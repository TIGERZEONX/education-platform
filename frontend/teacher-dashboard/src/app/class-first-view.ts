import type {
  ClassPulseSnapshot,
  CognitiveMapSnapshot,
  TeacherNudge,
} from "../../../../shared/communication/mqtt/contracts";

export interface StudentActivityView {
  studentId: string;
  studentName: string;
  latestEngagement?: number;
  latestStatus?: string;
  latestFeedback?: string;
  silentStudent: boolean;
  repeatedConfusionCount: number;
  engagementHistory: number[];
  feedbackHistory: string[];
  statusHistory: string[];
  updatedAt: string;
}

export interface TeacherClassSummary {
  liveClassPulse: number | null;
  activeStudentCount: number;
  confusionTrend: "rising" | "stable" | "falling" | null;
  alertLevel: "green" | "yellow" | "red" | null;
  recentCognitiveInsight: string | null;
  latestTeacherNudge: string | null;
}

export interface TeacherClassFirstViewModel {
  classId: string;
  classPulse: ClassPulseSnapshot | null;
  cognitiveMap: CognitiveMapSnapshot | null;
  nudges: TeacherNudge[];
  summary: TeacherClassSummary;
  lastUpdatedAt: string | null;
  studentActivityById: Record<string, StudentActivityView>;
}

export function createInitialClassFirstViewModel(classId: string): TeacherClassFirstViewModel {
  return {
    classId,
    classPulse: null,
    cognitiveMap: null,
    nudges: [],
    summary: {
      liveClassPulse: null,
      activeStudentCount: 0,
      confusionTrend: null,
      alertLevel: null,
      recentCognitiveInsight: null,
      latestTeacherNudge: null,
    },
    lastUpdatedAt: null,
    studentActivityById: {},
  };
}
