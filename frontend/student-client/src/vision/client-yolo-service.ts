import * as ort from "onnxruntime-web";

export interface ClientYoloObservation {
  faceCropDataUrl?: string;
  confidence: number;
  facePresent: boolean;
  frameTimestamp: string;
}

export interface ClientYoloResult {
  engagementScore: number;
  category: "engaged" | "neutral" | "disengaged";
  confidence: number;
  eyeState: "open" | "closed" | "unstable";
  gazeDirection: "focused" | "distracted";
  headPose: "stable" | "tilted" | "extreme";
  signalQuality: "stable" | "unstable" | "insufficient";
  modelVersion: string;
}

export interface ClientYoloService {
  preload: () => Promise<void>;
  analyze: (observation: ClientYoloObservation) => Promise<ClientYoloResult>;
  ready: () => boolean;
}

export interface ClientYoloServiceConfig {
  faceModelUrl: string;
  eyeModelUrl: string;
  executionProviders?: ort.InferenceSession.SessionOptions["executionProviders"];
}

interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

const MODEL_INPUT_SIZE = 640;

function softCategory(score: number): "engaged" | "neutral" | "disengaged" {
  if (score >= 67) {
    return "engaged";
  }

  if (score >= 34) {
    return "neutral";
  }

  return "disengaged";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toTensorData(imageData: ImageData): Float32Array {
  const pixels = imageData.data;
  const tensor = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
  const channelSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;

  for (let i = 0; i < MODEL_INPUT_SIZE * MODEL_INPUT_SIZE; i += 1) {
    const base = i * 4;
    tensor[i] = pixels[base] / 255;
    tensor[channelSize + i] = pixels[base + 1] / 255;
    tensor[channelSize * 2 + i] = pixels[base + 2] / 255;
  }

  return tensor;
}

async function decodeImageData(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("client-yolo-image-decode-failed"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = MODEL_INPUT_SIZE;
  canvas.height = MODEL_INPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("client-yolo-canvas-context-unavailable");
  }

  ctx.drawImage(image, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  return ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
}

function iou(a: Detection, b: Detection): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;

  if (union <= 0) {
    return 0;
  }

  return intersection / union;
}

function nonMaxSuppression(input: Detection[], threshold = 0.45): Detection[] {
  const sorted = [...input].sort((a, b) => b.confidence - a.confidence);
  const selected: Detection[] = [];

  while (sorted.length > 0) {
    const candidate = sorted.shift()!;
    selected.push(candidate);

    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (iou(candidate, sorted[i]) > threshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return selected;
}

function parseYoloDetections(output: ort.Tensor, confidenceThreshold = 0.35): Detection[] {
  const data = output.data as Float32Array;
  const dims = output.dims;

  if (dims.length < 3) {
    return [];
  }

  const channels = dims[1];
  const boxes = dims[2];
  const detections: Detection[] = [];

  for (let boxIdx = 0; boxIdx < boxes; boxIdx += 1) {
    const x = data[boxIdx];
    const y = data[boxes + boxIdx];
    const w = data[boxes * 2 + boxIdx];
    const h = data[boxes * 3 + boxIdx];

    let bestClassScore = 0;
    for (let classIdx = 4; classIdx < channels; classIdx += 1) {
      const classScore = data[boxes * classIdx + boxIdx];
      if (classScore > bestClassScore) {
        bestClassScore = classScore;
      }
    }

    if (bestClassScore < confidenceThreshold) {
      continue;
    }

    detections.push({
      x1: x - w / 2,
      y1: y - h / 2,
      x2: x + w / 2,
      y2: y + h / 2,
      confidence: bestClassScore,
    });
  }

  return nonMaxSuppression(detections);
}

async function runYolo(
  session: ort.InferenceSession,
  imageData: ImageData,
  confidenceThreshold: number,
): Promise<Detection[]> {
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const inputTensor = new ort.Tensor("float32", toTensorData(imageData), [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
  const output = await session.run({ [inputName]: inputTensor });
  return parseYoloDetections(output[outputName], confidenceThreshold);
}

export function createClientYoloService(config: ClientYoloServiceConfig): ClientYoloService {
  let isReady = false;
  let faceSession: ort.InferenceSession | null = null;
  let eyeSession: ort.InferenceSession | null = null;

  const providers = config.executionProviders ?? ["wasm"];

  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

  return {
    preload: async () => {
      faceSession = await ort.InferenceSession.create(config.faceModelUrl, {
        executionProviders: providers,
        graphOptimizationLevel: "all",
      });
      eyeSession = await ort.InferenceSession.create(config.eyeModelUrl, {
        executionProviders: providers,
        graphOptimizationLevel: "all",
      });
      isReady = true;
    },
    analyze: async (observation) => {
      if (!isReady) {
        throw new Error("client-yolo-not-ready");
      }

      if (!faceSession || !eyeSession) {
        throw new Error("client-yolo-session-unavailable");
      }

      if (!observation.faceCropDataUrl || !observation.facePresent) {
        return {
          engagementScore: 1,
          category: "disengaged",
          confidence: observation.confidence,
          eyeState: "unstable",
          gazeDirection: "distracted",
          headPose: "extreme",
          signalQuality: "insufficient",
          modelVersion: "yolov8-client-face-eye-onnx-v1",
        };
      }

      const imageData = await decodeImageData(observation.faceCropDataUrl);
      const faceDetections = await runYolo(faceSession, imageData, 0.2);
      const eyeDetections = await runYolo(eyeSession, imageData, 0.2);

      const topFace = faceDetections[0];
      const topEyes = eyeDetections.slice(0, 2);
      const faceConfidence = topFace?.confidence ?? 0;
      const eyeConfidence =
        topEyes.length > 0
          ? topEyes.reduce((sum, detection) => sum + detection.confidence, 0) / topEyes.length
          : 0;

      let gazeDirection: ClientYoloResult["gazeDirection"] = "distracted";
      if (topEyes.length >= 2) {
        const sorted = [...topEyes].sort((a, b) => (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2);
        const eyeCenterX = (sorted[0].x1 + sorted[0].x2 + sorted[1].x1 + sorted[1].x2) / 4;
        const faceCenterX = topFace ? (topFace.x1 + topFace.x2) / 2 : MODEL_INPUT_SIZE / 2;
        const eyeSpan = Math.max(1, ((sorted[1].x1 + sorted[1].x2) / 2) - ((sorted[0].x1 + sorted[0].x2) / 2));
        const normalizedOffset = Math.abs(eyeCenterX - faceCenterX) / eyeSpan;
        gazeDirection = normalizedOffset < 0.4 ? "focused" : "distracted";
      }

      const eyeState: ClientYoloResult["eyeState"] = eyeConfidence >= 0.35 ? "open" : "unstable";

      let headPose: ClientYoloResult["headPose"] = "extreme";
      if (faceConfidence >= 0.7) {
        headPose = "stable";
      } else if (faceConfidence >= 0.45) {
        headPose = "tilted";
      }

      const normalized =
        (eyeState === "open" ? 1 : 0.42) * 0.25 +
        (gazeDirection === "focused" ? 1 : 0.25) * 0.35 +
        (headPose === "stable" ? 1 : headPose === "tilted" ? 0.56 : 0.2) * 0.15 +
        clamp(observation.confidence, 0, 1) * 0.25;

      const engagementScore = Math.max(1, Math.min(100, Math.round(normalized * 100)));
      const signalQuality: ClientYoloResult["signalQuality"] =
        observation.confidence < 0.35 ? "insufficient" : observation.confidence < 0.6 ? "unstable" : "stable";

      return {
        engagementScore,
        category: softCategory(engagementScore),
        confidence: observation.confidence,
        eyeState,
        gazeDirection,
        headPose,
        signalQuality,
        modelVersion: "yolov8-client-face-eye-onnx-v1",
      };
    },
    ready: () => isReady,
  };
}
