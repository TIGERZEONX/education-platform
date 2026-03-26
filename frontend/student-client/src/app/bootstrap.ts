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

  const startHeartbeat = (): void => {
    if (heartbeatHandle) {
      clearInterval(heartbeatHandle);
    }

    heartbeatHandle = setInterval(() => {
      runtime.publishEngagementHeartbeat();
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
      const sensed = sensing.processObservation(observation);
      const signal: EngagementSignal = {
        studentId: config.studentId,
        studentName: runtime.state().visibleStudentName,
        classId: config.classId,
        valueType: "engagement-score",
        value: sensed.engagementScore,
        engagementScore: sensed.engagementScore,
        cameraStatus: runtime.state().cameraStatus,
        timestamp: config.now ? config.now() : new Date().toISOString(),
      };

      runtime.publishEngagementSignal(signal);
      return signal;
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
      runtime.publishEngagementHeartbeat();
    },
  };
}
