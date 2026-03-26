import React, { useContext, useEffect, useState, useRef } from "react";
import { StudentContext } from "./context";
import { GlassCard, InteractiveButton } from "../../../shared-ui/components/core-components";
import { FaceMesh, Results } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import { estimateGazeFocusScore } from "../vision/gaze-estimator";
import { createLandmarkSmoother } from "../vision/landmark-smoother";
import { createTrackingMetricsCollector } from "../vision/tracking-metrics";
import { createHeadPoseEstimator, estimateHeadOrientationScore } from "../vision/head-pose-estimator";
import { createDebugOverlay } from "../vision/debug-overlay";

function LiveFaceTracker() {
  const context = useContext(StudentContext)!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(true);
  const smootherRef = useRef(createLandmarkSmoother(0.35, 8));
  const metricsRef = useRef(createTrackingMetricsCollector(5000));
  const poseEstimatorRef = useRef(createHeadPoseEstimator());
  const debugOverlayRef = useRef(createDebugOverlay());
  const containerRef = useRef<HTMLDivElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const MIN_PUBLISH_INTERVAL_MS = 60;
  const TARGET_CAMERA_WIDTH = 1280;
  const TARGET_CAMERA_HEIGHT = 720;

  const clamp = (value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
  };

  const captureFaceCropDataUrl = (landmarks: { x: number; y: number }[]): string | undefined => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return undefined;
    }

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    for (const point of landmarks) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) {
      return undefined;
    }

    const padX = width * 0.25;
    const padY = height * 0.25;
    const boxLeft = clamp(minX - padX, 0, 1);
    const boxTop = clamp(minY - padY, 0, 1);
    const boxRight = clamp(maxX + padX, 0, 1);
    const boxBottom = clamp(maxY + padY, 0, 1);

    const sx = Math.floor(boxLeft * video.videoWidth);
    const sy = Math.floor(boxTop * video.videoHeight);
    const sw = Math.max(1, Math.floor((boxRight - boxLeft) * video.videoWidth));
    const sh = Math.max(1, Math.floor((boxBottom - boxTop) * video.videoHeight));

    if (sw < 40 || sh < 40) {
      return undefined;
    }

    if (!cropCanvasRef.current) {
      cropCanvasRef.current = document.createElement("canvas");
    }

    const canvas = cropCanvasRef.current;
    canvas.width = 224;
    canvas.height = 224;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  };

  useEffect(() => {
    let camera: Camera | null = null;
    let faceMesh: FaceMesh | null = null;
    let stream: MediaStream | null = null;
    let isMounted = true;
    let consecutiveDetections = 0;
    let consecutiveMisses = 0;
    
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: TARGET_CAMERA_WIDTH },
            height: { ideal: TARGET_CAMERA_HEIGHT },
            facingMode: "user",
          },
        });
        if (!isMounted) return;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          if (debugMode && containerRef.current) {
            debugOverlayRef.current.mount(containerRef.current);
          }
        }
        setIsActive(true);

        faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.8
        });

        let lastPublish = Date.now();

        faceMesh.onResults((results: Results) => {
          const now = Date.now();
          if (now - lastPublish < MIN_PUBLISH_INTERVAL_MS) return;
          
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = smootherRef.current.smooth(results.multiFaceLandmarks[0]);
            consecutiveDetections += 1;
            consecutiveMisses = 0;
            
            const left = landmarks[234];
            const right = landmarks[454];
            const faceWidth = Math.abs(right.x - left.x);
            if (faceWidth < 0.01) {
              return;
            }

            const pose = poseEstimatorRef.current.estimate(landmarks);
            const headOrientationScore = estimateHeadOrientationScore(pose);
            const gazeFocusScore = estimateGazeFocusScore(landmarks, headOrientationScore);
            const attentivenessScore = (headOrientationScore + gazeFocusScore) / 2;

            const detectionStability = Math.min(1, consecutiveDetections / 5);
            const baseFaceSize = faceWidth / 0.22;
            const confidence = clamp(
              Number((0.2 + Math.min(1, baseFaceSize) * 0.45 + detectionStability * 0.35).toFixed(3)),
              0,
              1,
            );
            const faceCropDataUrl = captureFaceCropDataUrl(landmarks);

            context.publishVisualObservation({
              facePresent: true,
              headOrientationScore,
              gazeFocusScore,
              attentivenessScore,
              confidence,
              faceWidthRatio: Number(faceWidth.toFixed(3)),
              detectionStability,
              frameTimestamp: new Date().toISOString(),
              faceCropDataUrl,
            });

            const report = metricsRef.current.record(true, confidence);
            if (report) {
              console.info("[tracking-metrics]", report);
            }

            if (debugMode) {
              debugOverlayRef.current.update({
                isVisible: true,
                metrics: metricsRef.current.snapshot(),
                pose,
                facePresent: true,
                confidence,
              });
            }
          } else {
             consecutiveMisses += 1;
             consecutiveDetections = 0;
             smootherRef.current.markMiss();

             context.publishVisualObservation({
              facePresent: false,
              headOrientationScore: 0,
              gazeFocusScore: 0,
              attentivenessScore: 0,
              confidence: consecutiveMisses > 2 ? 0 : 0.1,
            });

            const report = metricsRef.current.record(false, 0);
            if (report) {
              console.info("[tracking-metrics]", report);
            }

            if (debugMode) {
              debugOverlayRef.current.update({
                isVisible: true,
                metrics: metricsRef.current.snapshot(),
                pose: null,
                facePresent: false,
                confidence: 0,
              });
            }
          }
          lastPublish = now;
        });

        if (videoRef.current) {
          camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && isMounted) await faceMesh!.send({ image: videoRef.current });
            },
            width: TARGET_CAMERA_WIDTH,
            height: TARGET_CAMERA_HEIGHT,
          });
          camera.start();
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg("Camera denied or unavailable.");
          setIsActive(false);
        }
      }
    }

    start();

    return () => {
      isMounted = false;
      camera?.stop();
      faceMesh?.close();
      stream?.getTracks().forEach((track) => track.stop());
      smootherRef.current.reset();
      metricsRef.current.reset();
      debugOverlayRef.current.unmount();
    };
  }, [context]);

  return (
    <div ref={containerRef} style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", height: "200px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginBottom: "1rem", color: isActive ? "var(--accent-green)" : "var(--accent-red)", overflow: "hidden", position: "relative" }}>
      <video ref={videoRef} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", opacity: 0.3 }} playsInline muted />
      <div style={{ zIndex: 2, fontWeight: "bold", background: "rgba(0,0,0,0.5)", padding: "4px 8px", borderRadius: "4px" }}>
        {errorMsg ? errorMsg : isActive ? "AI Active (MediaPipe FaceMesh)" : "Initializing Camera..."}
      </div>
      <button onClick={() => setDebugMode(!debugMode)} style={{ position: "absolute", bottom: "8px", right: "8px", padding: "4px 8px", fontSize: "10px", zIndex: 3, background: debugMode ? "rgba(0,255,0,0.3)" : "rgba(128,128,128,0.3)", border: "1px solid currentColor", borderRadius: "4px", cursor: "pointer", color: "inherit" }}>
        {debugMode ? "Debug ON" : "Debug OFF"}
      </button>
    </div>
  );
}

export default function App() {
  const context = useContext(StudentContext)!;

  return (
    <div className="app-container">
      <header style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1>Student Space</h1>
        <p>Session: {context.topics.classNamespace}</p>
      </header>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
        <GlassCard title="Privacy-First Camera AI">
          <LiveFaceTracker />
          <p style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>{context.camera.state().helpText}</p>
        </GlassCard>

        <GlassCard title="Immediate Feedback">
          <p style={{ marginBottom: "1rem" }}>Tap a button to share your current state with the teacher anonymously.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <InteractiveButton 
               label="I'm Confused" 
               variant="danger" 
               onClick={() => context.publishFeedbackControl("confused")} 
            />
            <InteractiveButton 
               label="Please Repeat" 
               onClick={() => context.publishFeedbackControl("repeat")} 
            />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
