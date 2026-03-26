export type Identifier = string;

export type CameraStatus = "active" | "blocked" | "unavailable";

export type StudentOperationalState = "active" | "idle" | "reconnecting" | "disconnected" | "camera-off";

export type FeedbackType = "confused" | "repeat" | "understood";

export type AlertLevel = "green" | "yellow" | "red";

export interface EngagementSignal {
  studentId: Identifier;
  studentName?: string;
  classId: Identifier;
  valueType: "engagement-score";
  value: number;
  engagementScore: number;
  cameraStatus: CameraStatus;
  timestamp: string;
}

export interface FeedbackEvent {
  studentId: Identifier;
  studentName?: string;
  classId: Identifier;
  valueType: "feedback-type";
  value: FeedbackType;
  feedbackType: FeedbackType;
  timestamp: string;
}

export interface StudentStatusEvent {
  studentId: Identifier;
  studentName: string;
  classId: Identifier;
  valueType: "student-status";
  value: StudentOperationalState;
  operationalState: StudentOperationalState;
  cameraStatus: CameraStatus;
  timestamp: string;
}

export interface SessionInfoEvent {
  classId: Identifier;
  sessionId: Identifier;
  valueType: "session-info";
  value: "started" | "heartbeat" | "ended";
  status: "started" | "heartbeat" | "ended";
  timestamp: string;
}

export interface ClassPulseSnapshot {
  classId: Identifier;
  valueType: "class-pulse";
  value: {
    averageEngagement: number;
    confusionRate: number;
    activeStudentCount: number;
    alertLevel: AlertLevel;
  };
  averageEngagement: number;
  confusionRate: number;
  activeStudentCount: number;
  alertLevel: AlertLevel;
  windowStart: string;
  windowEnd: string;
  timestamp: string;
  computedAt: string;
}

export interface TeacherNudge {
  classId: Identifier;
  valueType: "teacher-nudge";
  value: string;
  alertLevel: AlertLevel;
  nudgeId: string;
  title: string;
  suggestion: string;
  timestamp: string;
  generatedAt: string;
}

export interface CognitiveMapSnapshot {
  classId: Identifier;
  valueType: "cognitive-map";
  value: {
    confusionZones: string[];
    learningGapIndicators: string[];
    trendDirection: "up" | "flat" | "down";
  };
  confusionZones: string[];
  learningGapIndicators: string[];
  trendDirection: "up" | "flat" | "down";
  basedOnWindowStart: string;
  basedOnWindowEnd: string;
  timestamp: string;
  generatedAt: string;
}

export type MqttPayload =
  | EngagementSignal
  | FeedbackEvent
  | StudentStatusEvent
  | SessionInfoEvent
  | ClassPulseSnapshot
  | TeacherNudge
  | CognitiveMapSnapshot;

export interface MqttEnvelope<TPayload extends MqttPayload> {
  messageId: string;
  schemaVersion: "1.0.0";
  source: "student-client" | "teacher-dashboard" | "backend";
  payloadType:
    | "engagement-signal"
    | "student-status-event"
    | "feedback-event"
    | "session-info-event"
    | "class-pulse-snapshot"
    | "teacher-nudge"
    | "cognitive-map-snapshot";
  payload: TPayload;
}
