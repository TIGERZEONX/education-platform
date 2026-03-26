import type {
  AlertLevel,
  ClassPulseSnapshot,
  CognitiveMapSnapshot,
  EngagementSignal,
  FeedbackEvent,
  FeedbackType,
  StudentStatusEvent,
  TeacherNudge,
} from "./message-contracts";

export interface TypedSignalValue<TType extends string, TValue> {
  valueType: TType;
  value: TValue;
  timestamp: string;
}

export interface MqttTopicHierarchy {
  rootNamespace: "cognitivepulse";
  classNamespacePattern: "cognitivepulse/class/{classId}";
  studentEngagementPattern: "cognitivepulse/class/{classId}/student/{studentId}/engagement";
  studentStatusPattern: "cognitivepulse/class/{classId}/student/{studentId}/status";
  feedbackByTypePattern: "cognitivepulse/class/{classId}/feedback/{feedbackType}";
  sessionInfoPattern: "cognitivepulse/class/{classId}/session/info";
  classPulsePattern: "cognitivepulse/class/{classId}/pulse";
  cognitiveMapPattern: "cognitivepulse/class/{classId}/cognitive-map";
  teacherNudgesPattern: "cognitivepulse/class/{classId}/teacher/nudges";
  teacherDashboardWildcardPattern: "cognitivepulse/class/{classId}/#";
  teacherStudentDrilldownPattern: "cognitivepulse/class/{classId}/student/{studentId}/#";
}

export interface MqttClientIdentity {
  role: "student" | "teacher" | "backend";
  clientId: string;
  classId: string;
  studentId?: string;
}

export interface MqttPublishingBehavior {
  studentEngagementIntervalMs: number;
  feedbackEventTrigger: "on-user-interaction";
  messageRequirements: {
    requireIdentifiers: true;
    requireTypedValue: true;
    requireTimestamp: true;
  };
}

export interface RollingWindowConfig {
  windowDurationMs: number;
  activeStudentThresholdMs: number;
}

export interface AlertThresholdConfig {
  green: {
    minAverageEngagement: number;
    maxConfusionRate: number;
  };
  yellow: {
    minAverageEngagement: number;
    maxConfusionRate: number;
  };
  red: {
    maxAverageEngagement: number;
    minConfusionRate: number;
  };
}

export interface DataFusionCycleInput {
  classId: string;
  cycleTimestamp: string;
  windowConfig: RollingWindowConfig;
  events: Array<EngagementSignal | FeedbackEvent | StudentStatusEvent>;
}

export type SignalQuality = "stable" | "unstable" | "missing";

export interface FusedStudentState {
  studentId: string;
  studentName?: string;
  operationalState: "active" | "idle" | "reconnecting" | "disconnected" | "camera-off";
  engagementScore: number;
  signalQuality: SignalQuality;
  explicitConfusionCount: number;
  repeatedConfusionPattern: boolean;
  cameraOff: boolean;
  inactive: boolean;
  lastSeenAt: string;
}

export interface UnifiedClassState {
  classId: string;
  timestamp: string;
  averageEngagement: number;
  confusionRate: number;
  activeStudentCount: number;
  cameraOffCount: number;
  inactiveCount: number;
  explicitConfusionCount: number;
  lowEngagementCount: number;
  studentStates: FusedStudentState[];
}

export interface DataFusionCycleDerived {
  activeStudents: string[];
  averageEngagementAcrossActiveStudents: number;
  confusionRateWithinWindow: number;
  alertLevel: AlertLevel;
  unifiedClassState: UnifiedClassState;
}

export interface DataFusionCycleOutput {
  classPulseSnapshot: ClassPulseSnapshot;
  derived: DataFusionCycleDerived;
}

export interface CognitiveMapCycleInput {
  classId: string;
  cycleTimestamp: string;
  classPulseWindow: ClassPulseSnapshot[];
  engagementWindow: EngagementSignal[];
  feedbackWindow: FeedbackEvent[];
  statusWindow: StudentStatusEvent[];
  activeStudents: string[];
  fusedClassState: UnifiedClassState;
}

export type CognitiveRuleKind =
  | "confusion-spike-topic-transition"
  | "sustained-engagement-decline"
  | "silent-student-pattern";

export interface CognitiveRuleTrigger {
  kind: CognitiveRuleKind;
  triggeredAt: string;
  reason: string;
  affectedStudentIds: string[];
}

export type InterventionCategory = "slow-down" | "repeat" | "interact" | "quick-poll";

export interface CognitiveInsight {
  severity: AlertLevel;
  summary: string;
  category: InterventionCategory;
  studentReferences: string[];
}

export interface CognitiveTrendSummary {
  trendDirection: "up" | "flat" | "down";
  confusionTrend: "rising" | "stable" | "falling";
  recoveryPatternDetected: boolean;
}

export interface CognitiveMapCycleOutput {
  cognitiveMap: CognitiveMapSnapshot;
  triggers: CognitiveRuleTrigger[];
  insights: CognitiveInsight[];
  trendSummary: CognitiveTrendSummary;
}

export interface TeacherNudgeMappingRule {
  kind: CognitiveRuleKind;
  recommendation: string;
}

export interface TeacherNudgeCycleInput {
  classId: string;
  cycleTimestamp: string;
  triggers: CognitiveRuleTrigger[];
}

export interface TeacherNudgeCycleOutput {
  nudges: TeacherNudge[];
  selectedPrimaryRule: CognitiveRuleKind | null;
}

export interface StatelessCycleBehavior {
  statelessPerCycle: true;
  dataSource: "current-rolling-window-only";
  nudgePriorityPolicy: "most-recent-trigger-wins";
}

export const DEFAULT_MQTT_TOPIC_HIERARCHY: MqttTopicHierarchy = {
  rootNamespace: "cognitivepulse",
  classNamespacePattern: "cognitivepulse/class/{classId}",
  studentEngagementPattern: "cognitivepulse/class/{classId}/student/{studentId}/engagement",
  studentStatusPattern: "cognitivepulse/class/{classId}/student/{studentId}/status",
  feedbackByTypePattern: "cognitivepulse/class/{classId}/feedback/{feedbackType}",
  sessionInfoPattern: "cognitivepulse/class/{classId}/session/info",
  classPulsePattern: "cognitivepulse/class/{classId}/pulse",
  cognitiveMapPattern: "cognitivepulse/class/{classId}/cognitive-map",
  teacherNudgesPattern: "cognitivepulse/class/{classId}/teacher/nudges",
  teacherDashboardWildcardPattern: "cognitivepulse/class/{classId}/#",
  teacherStudentDrilldownPattern: "cognitivepulse/class/{classId}/student/{studentId}/#",
};

export const DEFAULT_PUBLISHING_BEHAVIOR: MqttPublishingBehavior = {
  studentEngagementIntervalMs: 5000,
  feedbackEventTrigger: "on-user-interaction",
  messageRequirements: {
    requireIdentifiers: true,
    requireTypedValue: true,
    requireTimestamp: true,
  },
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholdConfig = {
  green: {
    minAverageEngagement: 0.7,
    maxConfusionRate: 0.15,
  },
  yellow: {
    minAverageEngagement: 0.45,
    maxConfusionRate: 0.35,
  },
  red: {
    maxAverageEngagement: 0.45,
    minConfusionRate: 0.35,
  },
};

export const DEFAULT_NUDGE_RULES: TeacherNudgeMappingRule[] = [
  {
    kind: "confusion-spike-topic-transition",
    recommendation: "Confusion just spiked near a topic change. Recap with a simpler example.",
  },
  {
    kind: "sustained-engagement-decline",
    recommendation: "Engagement is trending down. Run a quick interactive check-in now.",
  },
  {
    kind: "silent-student-pattern",
    recommendation: "Some students are silent. Ask a gentle low-pressure group question.",
  },
];

export const FEEDBACK_VALUE_TYPES: Record<FeedbackType, TypedSignalValue<"feedback-type", FeedbackType>["valueType"]> = {
  confused: "feedback-type",
  repeat: "feedback-type",
  understood: "feedback-type",
};
