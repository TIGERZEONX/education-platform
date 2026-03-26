import type {
  CameraStatus,
  EngagementSignal,
  FeedbackEvent,
  MqttEnvelope,
  MqttPayload,
  MqttPublishingBehavior,
  SessionInfoEvent,
  StudentOperationalState,
  StudentStatusEvent,
} from "../../../../shared/communication/mqtt/contracts";
import {
  buildEnvelope,
  buildPublishPacket,
} from "../../../../backend/services/realtime-messaging/src";
import {
  deriveEngagementScore,
  mapFeedbackControlToType,
  type QuickFeedbackControl,
  type VisionInputFrame,
} from "./signal-paths";
import { StudentConnectivityLayer } from "../state/connectivity-layer";
import type {
  ConnectionHealth,
  StudentClientEvent,
  StudentClientEventCategory,
} from "../types/event-model";

export interface StudentRuntimeConfig {
  classId: string;
  studentId: string;
  studentName: string;
  clientId: string;
  sessionId: string;
  publishing: MqttPublishingBehavior;
  topics: {
    engagementTopic: string;
    statusTopic: string;
    feedbackByType: Record<"confused" | "repeat" | "understood", string>;
    sessionInfoTopic: string;
  };
  onPublish: (packet: { topic: string; payload: string }) => void;
  now?: () => string;
}

export interface StudentRuntimeState {
  sessionPhase:
    | "not-joined"
    | "joining"
    | "joined"
    | "live"
    | "temporarily-disconnected"
    | "reconnecting"
    | "exited";
  identityConfirmed: boolean;
  visibleStudentName: string;
  activeSessionId: string | null;
  connectionHealth: ConnectionHealth;
  queuedOutboundMessages: number;
  operationalState: StudentOperationalState;
  cameraStatus: CameraStatus;
  joined: boolean;
  lastEngagementScore: number | null;
}

export interface StudentRuntime {
  state: () => StudentRuntimeState;
  eventInventory: () => StudentClientEvent[];
  confirmRealName: (name: string) => void;
  joinSession: () => void;
  setConnectionHealth: (health: ConnectionHealth) => void;
  markTemporarilyDisconnected: () => void;
  reconnectSession: () => void;
  leaveSession: () => void;
  setCameraStatus: (status: CameraStatus) => void;
  setOperationalState: (state: StudentOperationalState) => void;
  publishEngagementSignal: (signal: EngagementSignal) => void;
  publishFeedbackEvent: (event: FeedbackEvent) => void;
  publishVisionFrame: (frame: VisionInputFrame) => EngagementSignal;
  publishFeedbackControl: (control: QuickFeedbackControl) => FeedbackEvent;
  publishEngagementHeartbeat: () => EngagementSignal;
}

export function createStudentRuntime(config: StudentRuntimeConfig): StudentRuntime {
  const now = config.now ?? (() => new Date().toISOString());
  let messageCounter = 0;
  let sessionPhase: StudentRuntimeState["sessionPhase"] = "not-joined";
  let identityConfirmed = false;
  let visibleStudentName = config.studentName;
  let activeSessionId: string | null = null;
  let joined = false;
  let connectionHealth: ConnectionHealth = "healthy";
  let operationalState: StudentOperationalState = "idle";
  let cameraStatus: CameraStatus = "unavailable";
  let lastEngagementScore: number | null = null;
  const connectivity = new StudentConnectivityLayer();
  const events: StudentClientEvent[] = [];

  const recordEvent = (
    category: StudentClientEventCategory,
    detail: string,
    metadata?: StudentClientEvent["metadata"],
  ): void => {
    events.push({
      category,
      timestamp: now(),
      detail,
      metadata,
    });

    if (events.length > 500) {
      events.shift();
    }
  };

  const nextMessageId = (): string => {
    messageCounter += 1;
    return `${config.clientId}-${Date.now()}-${messageCounter}`;
  };

  const publishPayload = (
    topic: string,
    payloadType: MqttEnvelope<MqttPayload>["payloadType"],
    payload: MqttPayload,
  ): void => {
    const envelope = buildEnvelope({
      messageId: nextMessageId(),
      schemaVersion: "1.0.0",
      source: "student-client",
      payloadType,
      payload,
    });

    const packet = buildPublishPacket(topic, envelope);
    const status = connectivity.dispatch(packet, (nextPacket) => config.onPublish(nextPacket));

    if (status === "queued") {
      recordEvent("reconnection-transition", "Packet queued due to connectivity degradation.", {
        payloadType,
        connectionHealth,
      });
    }
  };

  const publishStatus = (status: StudentOperationalState): StudentStatusEvent => {
    const event: StudentStatusEvent = {
      studentId: config.studentId,
      studentName: visibleStudentName,
      classId: config.classId,
      valueType: "student-status",
      value: status,
      operationalState: status,
      cameraStatus,
      timestamp: now(),
    };

    publishPayload(config.topics.statusTopic, "student-status-event", event);
    return event;
  };

  const publishSession = (status: SessionInfoEvent["status"]): SessionInfoEvent => {
    const event: SessionInfoEvent = {
      classId: config.classId,
      sessionId: config.sessionId,
      valueType: "session-info",
      value: status,
      status,
      timestamp: now(),
    };

    publishPayload(config.topics.sessionInfoTopic, "session-info-event", event);
    return event;
  };

  const buildEngagementSignal = (score: number): EngagementSignal => ({
    studentId: config.studentId,
    studentName: visibleStudentName,
    classId: config.classId,
    valueType: "engagement-score",
    value: score,
    engagementScore: score,
    cameraStatus,
    timestamp: now(),
  });

  return {
    state: () => ({
      sessionPhase,
      identityConfirmed,
      visibleStudentName,
      activeSessionId,
      connectionHealth,
      queuedOutboundMessages: connectivity.state().queuedPackets,
      operationalState,
      cameraStatus,
      joined,
      lastEngagementScore,
    }),
    eventInventory: () => [...events],
    confirmRealName: (name) => {
      const normalized = name.trim();
      if (normalized.length < 2) {
        throw new Error("Student name must be at least 2 characters.");
      }

      visibleStudentName = normalized;
      identityConfirmed = true;
      recordEvent("session-participation", "Student identity confirmed.", {
        visibleStudentName,
      });
    },
    joinSession: () => {
      if (!identityConfirmed) {
        throw new Error("Real-name confirmation is required before joining.");
      }

      if (activeSessionId && activeSessionId !== config.sessionId) {
        throw new Error("Student client supports exactly one live class session at a time.");
      }

      if (sessionPhase === "live") {
        return;
      }

      sessionPhase = "joining";
      recordEvent("session-participation", "Joining live classroom session.", {
        sessionId: config.sessionId,
      });
      joined = true;
      activeSessionId = config.sessionId;
      sessionPhase = "joined";
      operationalState = "active";
      publishSession("started");
      publishStatus("active");
      sessionPhase = "live";
      recordEvent("session-participation", "Student is live in class session.", {
        sessionId: config.sessionId,
      });
    },
    setConnectionHealth: (health) => {
      connectionHealth = health;
      connectivity.setHealth(health, (packet) => config.onPublish(packet));

      if (health === "healthy") {
        if (joined && sessionPhase === "reconnecting") {
          sessionPhase = "live";
          operationalState = "active";
          publishStatus("active");
          publishSession("heartbeat");
        }

        recordEvent("reconnection-transition", "Connection health is healthy.", {
          queuedMessages: connectivity.state().queuedPackets,
        });
        return;
      }

      sessionPhase = "reconnecting";
      operationalState = "reconnecting";
      publishStatus("reconnecting");
      recordEvent("reconnection-transition", "Connection health degraded.", {
        connectionHealth: health,
      });
    },
    markTemporarilyDisconnected: () => {
      if (!joined) {
        return;
      }

      sessionPhase = "temporarily-disconnected";
      operationalState = "disconnected";
      connectionHealth = "disconnected";
      connectivity.setHealth("disconnected", (packet) => config.onPublish(packet));
      publishStatus("disconnected");
      recordEvent("reconnection-transition", "Student temporarily disconnected.");
    },
    reconnectSession: () => {
      if (!joined) {
        throw new Error("Cannot reconnect before joining the live class session.");
      }

      sessionPhase = "reconnecting";
      connectionHealth = "reconnecting";
      connectivity.setHealth("reconnecting", (packet) => config.onPublish(packet));
      publishStatus("idle");
      operationalState = "active";
      publishStatus("active");
      publishSession("heartbeat");
      sessionPhase = "live";
      connectionHealth = "healthy";
      connectivity.setHealth("healthy", (packet) => config.onPublish(packet));
      recordEvent("reconnection-transition", "Student reconnected and resumed live participation.");
    },
    leaveSession: () => {
      operationalState = "disconnected";
      publishStatus("disconnected");
      publishSession("ended");
      joined = false;
      activeSessionId = null;
      sessionPhase = "exited";
      recordEvent("session-exit", "Student exited class session cleanly.", {
        sessionId: config.sessionId,
      });
    },
    setCameraStatus: (status) => {
      cameraStatus = status;
      if (status === "blocked" || status === "unavailable") {
        operationalState = "camera-off";
        publishStatus("camera-off");
        recordEvent("camera-state", "Camera unavailable during participation.", {
          cameraStatus: status,
        });
      } else if (joined && operationalState === "camera-off") {
        operationalState = "active";
        publishStatus("active");
        recordEvent("camera-state", "Camera resumed and active.", {
          cameraStatus: status,
        });
      }
    },
    setOperationalState: (state) => {
      operationalState = state;
      publishStatus(state);
      recordEvent("status-change", "Operational state updated.", {
        operationalState: state,
      });
    },
    publishEngagementSignal: (signal) => {
      lastEngagementScore = signal.engagementScore;
      publishPayload(config.topics.engagementTopic, "engagement-signal", signal);
      recordEvent("engagement-update", "Engagement signal published.", {
        engagementScore: signal.engagementScore,
        cameraStatus: signal.cameraStatus,
      });
    },
    publishFeedbackEvent: (event) => {
      publishPayload(config.topics.feedbackByType[event.feedbackType], "feedback-event", event);
      recordEvent("explicit-feedback", "Feedback event published.", {
        feedbackType: event.feedbackType,
      });
    },
    publishVisionFrame: (frame) => {
      const engagementScore = deriveEngagementScore(frame);
      lastEngagementScore = engagementScore;
      const signal = buildEngagementSignal(engagementScore);
      publishPayload(config.topics.engagementTopic, "engagement-signal", signal);
      publishSession("heartbeat");
      recordEvent("engagement-update", "Vision-derived engagement update emitted.", {
        engagementScore,
      });
      return signal;
    },
    publishFeedbackControl: (control) => {
      if (!joined) {
        throw new Error("Join the live class session before sending feedback.");
      }

      const feedbackType = mapFeedbackControlToType(control);
      const event: FeedbackEvent = {
        studentId: config.studentId,
        studentName: visibleStudentName,
        classId: config.classId,
        valueType: "feedback-type",
        value: feedbackType,
        feedbackType,
        timestamp: now(),
      };

      publishPayload(config.topics.feedbackByType[feedbackType], "feedback-event", event);
      recordEvent("explicit-feedback", "Student triggered quick feedback action.", {
        feedbackType,
      });
      return event;
    },
    publishEngagementHeartbeat: () => {
      const score = lastEngagementScore ?? 0;
      const signal = buildEngagementSignal(score);
      publishPayload(config.topics.engagementTopic, "engagement-signal", signal);
      publishSession("heartbeat");
      recordEvent("engagement-update", "Heartbeat engagement signal emitted.", {
        engagementScore: score,
      });
      return signal;
    },
  };
}
