import type {
  CameraStatus,
  MqttClientIdentity,
  MqttPublishingBehavior,
  EngagementSignal,
  FeedbackEvent,
  StudentStatusEvent,
} from "../../../../shared/communication/mqtt/contracts";
import { buildTopicContracts } from "../../../../shared/communication/mqtt/topics";
import { createStudentRuntime, type StudentRuntime } from "./student-runtime";
import type { QuickFeedbackControl, VisionInputFrame } from "./signal-paths";
import {
  createCameraExperience,
  type CameraAccessAdapter,
  type CameraExperience,
} from "../vision/camera-experience";
import {
  createEngagementSensingService,
  type EngagementSensingService,
  type VisualObservation,
} from "../vision/engagement-sensing-service";
import { createEngagementAnalysisClient } from "../vision/engagement-analysis-client";
import { createFeedbackController, type FeedbackController } from "../feedback/feedback-controls";
import { buildStudentLaptopFirstView, type StudentLaptopFirstView } from "./student-interface-model";
import type { ConnectionHealth, StudentClientEvent } from "../types/event-model";

export interface StudentClientBootstrapConfig {
  classId: string;
  studentId: string;
  studentName: string;
  sessionId: string;
  clientId: string;
  publishing: MqttPublishingBehavior;
  onPublish: (packet: { topic: string; payload: string }) => void;
  cameraAccessAdapter?: CameraAccessAdapter;
  feedbackMinIntervalMs?: number;
  now?: () => string;
  engagementAnalysis?: {
    endpoint?: string;
    minIntervalMs?: number;
    requestTimeoutMs?: number;
  };
}

export interface StudentClientBootstrapContext {
  clientIdentity: MqttClientIdentity;
  topics: ReturnType<typeof buildTopicContracts>;
  runtime: StudentRuntime;
  camera: CameraExperience;
  sensing: EngagementSensingService;
  feedback: FeedbackController;
  confirmRealName: (name: string) => void;
  joinClassSession: () => void;
  markTemporarilyDisconnected: () => void;
  reconnectClassSession: () => void;
  setConnectionHealth: (health: ConnectionHealth) => void;
  leaveClassSession: () => void;
  eventInventory: () => StudentClientEvent[];
  buildLaptopFirstView: () => StudentLaptopFirstView;
  publishStatus: (state: StudentStatusEvent["operationalState"]) => void;
  requestCameraAccess: () => Promise<CameraStatus>;
  turnCameraOffDuringSession: () => CameraStatus;
  recoverCamera: () => Promise<CameraStatus>;
  publishVisualObservation: (observation: VisualObservation) => EngagementSignal;
  publishVisionSignal: (frame: VisionInputFrame) => EngagementSignal;
  publishFeedbackControl: (control: QuickFeedbackControl) => FeedbackEvent | null;
  publishEngagement: (signal: EngagementSignal) => void;
  publishFeedback: (event: FeedbackEvent) => void;
  publishEngagementHeartbeat: () => void;

}

export function bootstrapStudentClient(
  config: StudentClientBootstrapConfig,
): StudentClientBootstrapContext {
  const topics = buildTopicContracts({
    classId: config.classId,
    studentId: config.studentId,
  });

  const cameraAdapter: CameraAccessAdapter =
    config.cameraAccessAdapter ?? {
      requestAccess: async () => "unavailable",
      stopCamera: () => {
        // No-op fallback for non-browser runtime.
      },
    };

  const camera = createCameraExperience(cameraAdapter);
  const sensing = createEngagementSensingService();
  const feedback = createFeedbackController({
    minIntervalMs: config.feedbackMinIntervalMs,
  });
  const engagementAnalyzer = createEngagementAnalysisClient({
    endpoint: config.engagementAnalysis?.endpoint ?? "http://localhost:4000/api/analyze-engagement",
    requestTimeoutMs: config.engagementAnalysis?.requestTimeoutMs ?? 700,
  });

  const clientIdentity: MqttClientIdentity = {
    role: "student",
    clientId: config.clientId,
    classId: config.classId,
    studentId: config.studentId,
  };

  const runtime = createStudentRuntime({
    classId: config.classId,
    studentId: config.studentId,
    studentName: config.studentName,
    clientId: config.clientId,
    sessionId: config.sessionId,
    publishing: config.publishing,
    topics: {
      engagementTopic: topics.engagementPerStudent,
      statusTopic: topics.studentStatusPerStudent,
      feedbackByType: topics.feedbackByType,
      sessionInfoTopic: topics.sessionInfo,
    },
    onPublish: config.onPublish,
    now: config.now,
  });

  let heartbeatHandle: ReturnType<typeof setInterval> | undefined;
  let analysisInFlight = false;
  let lastAnalysisAtMs = 0;
  let strictPipelineHealthy = true;
  let lastStrictSignalAtMs = Date.now();
  const strictTelemetry = {
    missingClientResult: 0,
    strictHealthFalseTransitions: 0,
    verificationDrifted: 0,
    staleHeartbeatsSuppressed: 0,
  };
  let lastStrictSignal: EngagementSignal = {
    studentId: config.studentId,
    studentName: config.studentName,
    classId: config.classId,
    valueType: "engagement-score",
    value: 1,
    engagementScore: 1,
    engagementScoreBand: 100,
    engagementCategory: "engaged",
    cameraStatus: runtime.state().cameraStatus,
    mlConfidence: 1,
    eyeState: "open",
    gazeDirection: "focused",
    headPoseState: "stable",
    modelVersion: "yolov8-face-eye-v1",
    timestamp: config.now ? config.now() : new Date().toISOString(),
  };

  const setStrictPipelineHealthy = (next: boolean, reason: string): void => {
    if (strictPipelineHealthy && !next) {
      strictTelemetry.strictHealthFalseTransitions += 1;
      console.warn("[strict-pipeline] unhealthy", {
        reason,
        strictHealthFalseTransitions: strictTelemetry.strictHealthFalseTransitions,
        missingClientResult: strictTelemetry.missingClientResult,
        verificationDrifted: strictTelemetry.verificationDrifted,
      });
    }

    strictPipelineHealthy = next;
  };

  const maybeAnalyzeWithBackend = (observation: VisualObservation): void => {
    if (analysisInFlight) {
      return;
    }

    const nowMs = Date.now();
    const minIntervalMs = config.engagementAnalysis?.minIntervalMs ?? 70;
    if (nowMs - lastAnalysisAtMs < minIntervalMs) {
      return;
    }

    analysisInFlight = true;
    if (!observation.clientYoloResult) {
      strictTelemetry.missingClientResult += 1;
      console.warn("[strict-pipeline] observation missing clientYoloResult", {
        missingClientResult: strictTelemetry.missingClientResult,
        facePresent: observation.facePresent,
        confidence: observation.confidence,
      });
      setStrictPipelineHealthy(false, "missing-client-yolo-result");
      analysisInFlight = false;
      return;
    }

    const request = {
        studentId: config.studentId,
        classId: config.classId,
        timestamp: observation.frameTimestamp ?? (config.now ? config.now() : new Date().toISOString()),
        facePresent: observation.facePresent,
        confidence: observation.confidence,
        headOrientationScore: observation.headOrientationScore,
        gazeFocusScore: observation.gazeFocusScore,
        attentivenessScore: observation.attentivenessScore,
        faceWidthRatio: observation.faceWidthRatio,
        detectionStability: observation.detectionStability,
        faceCropDataUrl: observation.faceCropDataUrl,
      };

    const clientResult = observation.clientYoloResult;
    const normalizedClientScore = Math.max(0, Math.min(1, Number((clientResult.engagementScore / 100).toFixed(3))));
    const clientSignal: EngagementSignal = {
      studentId: config.studentId,
      studentName: runtime.state().visibleStudentName,
      classId: config.classId,
      valueType: "engagement-score",
      value: normalizedClientScore,
      engagementScore: normalizedClientScore,
      cameraStatus: runtime.state().cameraStatus,
      engagementScoreBand: clientResult.engagementScore,
      engagementCategory: clientResult.category,
      mlConfidence: clientResult.confidence,
      eyeState: clientResult.eyeState,
      gazeDirection: clientResult.gazeDirection,
      headPoseState: clientResult.headPose,
      modelVersion: clientResult.modelVersion,
      timestamp: config.now ? config.now() : new Date().toISOString(),
    };

    runtime.publishEngagementSignal(clientSignal);
    lastStrictSignal = clientSignal;
    lastStrictSignalAtMs = nowMs;

    engagementAnalyzer
      .verify({
        observation: request,
        clientResult,
      })
      .then((verification) => {
        if (verification.verdict !== "match") {
          strictTelemetry.verificationDrifted += 1;
          console.warn("[strict-pipeline] verification drifted", {
            verificationDrifted: strictTelemetry.verificationDrifted,
            scoreDelta: verification.drift.scoreDelta,
            categoryMatch: verification.drift.categoryMatch,
          });
        }
        setStrictPipelineHealthy(verification.verdict === "match", "verification-drift");
        lastAnalysisAtMs = nowMs;
      })
      .catch(() => {
        // Strict mode hard-fail: stop engagement publishing until YOLO succeeds again.
        setStrictPipelineHealthy(false, "verification-request-failed");
      })
      .finally(() => {
        analysisInFlight = false;
      });
  };

  const publishStrictHeartbeat = (): void => {
    if (!strictPipelineHealthy) {
      return;
    }

    const heartbeatStaleThresholdMs = Math.max(2000, config.publishing.studentEngagementIntervalMs * 2);
    if (Date.now() - lastStrictSignalAtMs > heartbeatStaleThresholdMs) {
      strictTelemetry.staleHeartbeatsSuppressed += 1;
      if (strictTelemetry.staleHeartbeatsSuppressed % 5 === 0) {
        console.info("[strict-pipeline] stale heartbeat suppressed", {
          staleHeartbeatsSuppressed: strictTelemetry.staleHeartbeatsSuppressed,
        });
      }
      return;
    }

    runtime.publishEngagementSignal({
      ...lastStrictSignal,
      timestamp: config.now ? config.now() : new Date().toISOString(),
    });
  };

  const startHeartbeat = (): void => {
    if (heartbeatHandle) {
      clearInterval(heartbeatHandle);
    }

    heartbeatHandle = setInterval(() => {
      publishStrictHeartbeat();
    }, config.publishing.studentEngagementIntervalMs);
  };

  const stopHeartbeat = (): void => {
    if (heartbeatHandle) {
      clearInterval(heartbeatHandle);
      heartbeatHandle = undefined;
    }
  };

  return {
    clientIdentity,
    topics,
    runtime,
    camera,
    sensing,
    feedback,
    confirmRealName: (name) => {
      runtime.confirmRealName(name);
    },
    joinClassSession: () => {
      runtime.joinSession();
      startHeartbeat();
    },
    markTemporarilyDisconnected: () => {
      stopHeartbeat();
      runtime.markTemporarilyDisconnected();
    },
    reconnectClassSession: () => {
      runtime.reconnectSession();
      startHeartbeat();
    },
    setConnectionHealth: (health) => {
      runtime.setConnectionHealth(health);
      if (health === "healthy") {
        startHeartbeat();
      }

      if (health === "disconnected" || health === "reconnecting" || health === "unstable") {
        stopHeartbeat();
      }
    },
    leaveClassSession: () => {
      stopHeartbeat();
      runtime.leaveSession();
    },
    eventInventory: () => {
      return runtime.eventInventory();
    },
    buildLaptopFirstView: () => {
      return buildStudentLaptopFirstView(runtime.state(), camera.state(), sensing.latest());
    },
    publishStatus: (state) => {
      runtime.setOperationalState(state);
    },
    requestCameraAccess: async () => {
      const cameraState = await camera.requestCameraAccess();
      runtime.setCameraStatus(cameraState.cameraStatus);
      return cameraState.cameraStatus;
    },
    turnCameraOffDuringSession: () => {
      const cameraState = camera.turnCameraOffDuringSession();
      runtime.setCameraStatus(cameraState.cameraStatus);
      return cameraState.cameraStatus;
    },
    recoverCamera: async () => {
      const cameraState = await camera.recoverCamera();
      runtime.setCameraStatus(cameraState.cameraStatus);
      return cameraState.cameraStatus;
    },
    publishVisualObservation: (observation) => {
      sensing.processObservation(observation);
      void maybeAnalyzeWithBackend(observation);
      return lastStrictSignal;
    },
    publishVisionSignal: (frame) => {
      return runtime.publishVisionFrame(frame);
    },
    publishFeedbackControl: (control) => {
      const feedbackType = control;
      const gate = feedback.trigger(feedbackType);
      if (!gate.accepted) {
        return null;
      }

      return runtime.publishFeedbackControl(control);
    },
    publishEngagement: (signal) => {
      runtime.publishEngagementSignal(signal);
    },
    publishFeedback: (event) => {
      runtime.publishFeedbackEvent(event);
    },
    publishEngagementHeartbeat: () => {
      publishStrictHeartbeat();
    },
  };
}
