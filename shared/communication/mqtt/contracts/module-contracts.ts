import type {
  ClassPulseSnapshot,
  CognitiveMapSnapshot,
  EngagementSignal,
  FeedbackEvent,
  TeacherNudge,
} from "./message-contracts";

export interface AiVisionModuleInput {
  studentId: string;
  classId: string;
  cameraState: "starting" | "streaming" | "stopped";
  landmarkFrameTimestamp: string;
}

export interface AiVisionModuleOutput {
  engagementSignal: EngagementSignal;
}

export interface FeedbackInputModuleInput {
  studentId: string;
  classId: string;
  interaction: "confused" | "repeat" | "understood";
  occurredAt: string;
}

export interface FeedbackInputModuleOutput {
  feedbackEvent: FeedbackEvent;
}

export interface DataFusionWindowState {
  classId: string;
  windowStart: string;
  windowEnd: string;
  recentEngagement: EngagementSignal[];
  recentFeedback: FeedbackEvent[];
}

export interface DataFusionEngineInput {
  windowState: DataFusionWindowState;
}

export interface DataFusionEngineOutput {
  classPulse: ClassPulseSnapshot;
}

export interface CognitiveMapEngineInput {
  classPulseHistory: ClassPulseSnapshot[];
  feedbackHistory: FeedbackEvent[];
}

export interface CognitiveMapEngineOutput {
  cognitiveMap: CognitiveMapSnapshot;
  teacherNudges: TeacherNudge[];
}

export interface TeacherDashboardInput {
  classPulse: ClassPulseSnapshot;
  cognitiveMap: CognitiveMapSnapshot;
  teacherNudges: TeacherNudge[];
  activityFeed: Array<EngagementSignal | FeedbackEvent>;
}

export interface TeacherDashboardOutput {
  classPulseIndicator: {
    alertLevel: "green" | "yellow" | "red";
    averageEngagement: number;
    confusionRate: number;
  };
  confusionTimeline: Array<{
    timestamp: string;
    confusionRate: number;
  }>;
  studentActivityList: Array<{
    studentId: string;
    latestEventType: "engagement-signal" | "feedback-event";
    latestTimestamp: string;
  }>;
  nudgePanel: TeacherNudge[];
}

export interface PersistenceLayerInput {
  mqttEvent:
    | EngagementSignal
    | FeedbackEvent
    | ClassPulseSnapshot
    | CognitiveMapSnapshot
    | TeacherNudge;
}

export interface SessionSummary {
  classId: string;
  sessionStart: string;
  sessionEnd: string;
  averageEngagement: number;
  peakConfusionRate: number;
  dominantTrendDirection: "up" | "flat" | "down";
}

export interface PersistenceLayerOutput {
  eventLogAck: {
    stored: boolean;
    storedAt: string;
  };
  sessionSummary: SessionSummary | null;
}
