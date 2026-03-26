import type {
  DataCompletenessIssue,
  FlaggedStudentHistoricalReview,
  PersistedCycleRecord,
  SessionPlaybackStep,
  SessionSummaryReview,
  TeacherInterventionRecord,
} from "../../../../backend/services/persistence-history/src";
import type { TeacherClassFirstViewModel } from "./class-first-view";

export interface TeacherSessionAwareness {
  classId: string;
  sessionActive: boolean;
  lastUpdatedAt: string | null;
}

export interface TeacherAlertView {
  severity: "green" | "yellow" | "red" | "unknown";
  reason: string;
}

export interface TeacherTrendVisibility {
  confusionTrend: "rising" | "stable" | "falling" | "unknown";
  trendDirection: "up" | "flat" | "down" | "unknown";
}

export interface TeacherRecommendation {
  category: "slow-down" | "repeat" | "interact" | "quick-poll";
  recommendation: string;
}

export interface FlaggedStudentInspectionItem {
  studentId: string;
  studentName: string;
  reasons: string[];
  latestEngagement?: number;
  latestStatus?: string;
  repeatedConfusionCount: number;
}

export interface TeacherHistorySideAccess {
  recentCycleCount: number;
  lastInterventions: TeacherInterventionRecord[];
  sessionSummary: SessionSummaryReview | null;
  timelinePlayback: SessionPlaybackStep[];
  flaggedStudentHistoricalReview: FlaggedStudentHistoricalReview[];
  dataCompletenessIssues: DataCompletenessIssue[];
}

export interface TeacherClassDecisionSupportView {
  sessionAwareness: TeacherSessionAwareness;
  classPulse: {
    liveClassPulse: number | null;
    activeStudentCount: number;
    alertLevel: "green" | "yellow" | "red" | null;
  };
  alerting: TeacherAlertView;
  trendVisibility: TeacherTrendVisibility;
  cognitiveInsight: string | null;
  teacherRecommendations: TeacherRecommendation[];
  flaggedStudentInspection: FlaggedStudentInspectionItem[];
  historySideAccess: TeacherHistorySideAccess;
  supportPosture: string;
  trendArea: {
    movement: "recovering" | "declining" | "steady" | "unknown";
    engagementSeries: Array<{ timestamp: string; value: number }>;
    confusionSeries: Array<{ timestamp: string; value: number }>;
  };
  cognitiveInsightArea: {
    latest: string | null;
    recentHistory: string[];
    classLevelSignals: string[];
  };
  teacherActionArea: {
    immediateRecommendations: TeacherRecommendation[];
    priorRecommendations: TeacherInterventionRecord[];
  };
  systemHealth: {
    confidence: "high" | "medium" | "low";
    degraded: boolean;
    reasons: string[];
  };
}

export interface TeacherHistoryReader {
  listRecentCycles: (classId: string, limit: number) => PersistedCycleRecord[];
  listRecentInterventions: (classId: string, limit: number) => TeacherInterventionRecord[];
  buildSessionSummary?: (classId: string, sessionId: string) => SessionSummaryReview | null;
  buildSessionPlayback?: (classId: string, sessionId: string, limit: number) => SessionPlaybackStep[];
  listFlaggedStudentReview?: (classId: string, sessionId: string, limit: number) => FlaggedStudentHistoricalReview[];
  listSessionDataCompletenessIssues?: (
    classId: string,
    sessionId: string,
    limit: number,
  ) => DataCompletenessIssue[];
}

function inferEngagementPattern(values: number[]): "rising" | "falling" | "steady" | "insufficient" {
  if (values.length < 2) {
    return "insufficient";
  }

  const delta = values[values.length - 1] - values[0];
  if (delta > 0.08) {
    return "rising";
  }

  if (delta < -0.08) {
    return "falling";
  }

  return "steady";
}

function recommendCategoryFromText(
  input: string | null,
): TeacherRecommendation["category"] {
  const text = (input ?? "").toLowerCase();

  if (text.includes("confusion") || text.includes("transition")) {
    return "slow-down";
  }

  if (text.includes("repeat")) {
    return "repeat";
  }

  if (text.includes("silent") || text.includes("poll")) {
    return "quick-poll";
  }

  return "interact";
}

export function buildTeacherDecisionSupportView(
  viewModel: TeacherClassFirstViewModel,
  historyReader?: TeacherHistoryReader,
  now: () => number = () => Date.now(),
): TeacherClassDecisionSupportView {
  const alertSeverity = viewModel.summary.alertLevel ?? "unknown";
  const insight = viewModel.summary.recentCognitiveInsight;
  const nudge = viewModel.summary.latestTeacherNudge;

  const flaggedStudentInspection = Object.values(viewModel.studentActivityById)
    .filter(
      (student) =>
        student.silentStudent ||
        student.repeatedConfusionCount >= 2 ||
        (student.latestEngagement !== undefined && student.latestEngagement < 0.4) ||
        student.latestStatus === "reconnecting" ||
        student.latestStatus === "camera-off" ||
        student.latestStatus === "disconnected" ||
        student.latestStatus === "idle",
    )
    .map((student) => ({
      studentId: student.studentId,
      studentName: student.studentName,
      reasons: [
        ...(student.silentStudent ? ["Silent-student indicator"] : []),
        ...(student.repeatedConfusionCount >= 2 ? ["Repeated confusion pattern"] : []),
        ...(student.latestStatus === "reconnecting" ? ["Unstable connectivity"] : []),
        ...(student.latestStatus === "disconnected" ? ["Disconnected"] : []),
        ...(student.latestStatus === "camera-off" ? ["Camera-off participation"] : []),
        ...(student.latestStatus === "idle" ? ["Inactivity"] : []),
        ...(student.latestEngagement !== undefined && student.latestEngagement < 0.4
          ? ["Low engagement signal"]
          : []),
        ...(student.engagementHistory.length > 0
          ? [`Recent engagement pattern: ${inferEngagementPattern(student.engagementHistory)}`]
          : []),
      ],
      latestEngagement: student.latestEngagement,
      latestStatus: student.latestStatus,
      repeatedConfusionCount: student.repeatedConfusionCount,
    }));

  const recommendations: TeacherRecommendation[] = [];
  const sessionId = `${viewModel.classId}-live`;

  if (nudge) {
    recommendations.push({
      category: recommendCategoryFromText(nudge),
      recommendation: nudge,
    });
  }

  if (insight && (!nudge || insight !== nudge)) {
    recommendations.push({
      category: recommendCategoryFromText(insight),
      recommendation: insight,
    });
  }

  const historySideAccess: TeacherHistorySideAccess = {
    recentCycleCount: historyReader ? historyReader.listRecentCycles(viewModel.classId, 20).length : 0,
    lastInterventions: historyReader ? historyReader.listRecentInterventions(viewModel.classId, 5) : [],
    sessionSummary: historyReader?.buildSessionSummary
      ? historyReader.buildSessionSummary(viewModel.classId, sessionId)
      : null,
    timelinePlayback: historyReader?.buildSessionPlayback
      ? historyReader.buildSessionPlayback(viewModel.classId, sessionId, 40)
      : [],
    flaggedStudentHistoricalReview: historyReader?.listFlaggedStudentReview
      ? historyReader.listFlaggedStudentReview(viewModel.classId, sessionId, 20)
      : [],
    dataCompletenessIssues: historyReader?.listSessionDataCompletenessIssues
      ? historyReader.listSessionDataCompletenessIssues(viewModel.classId, sessionId, 20)
      : [],
  };

  const recentCycles = historyReader ? historyReader.listRecentCycles(viewModel.classId, 12) : [];
  const engagementSeries = [...recentCycles]
    .reverse()
    .map((cycle) => ({
      timestamp: cycle.cycleTimestamp,
      value: cycle.classPulseSnapshot.averageEngagement,
    }));
  const confusionSeries = [...recentCycles]
    .reverse()
    .map((cycle) => ({
      timestamp: cycle.cycleTimestamp,
      value: cycle.classPulseSnapshot.confusionRate,
    }));

  const trendMovement = (() => {
    if (engagementSeries.length < 2 || confusionSeries.length < 2) {
      return "unknown" as const;
    }

    const engagementDelta = engagementSeries[engagementSeries.length - 1].value - engagementSeries[0].value;
    const confusionDelta = confusionSeries[confusionSeries.length - 1].value - confusionSeries[0].value;

    if (engagementDelta > 0.05 && confusionDelta < -0.05) {
      return "recovering" as const;
    }

    if (engagementDelta < -0.05 || confusionDelta > 0.05) {
      return "declining" as const;
    }

    return "steady" as const;
  })();

  const cognitiveHistory = recentCycles
    .flatMap((cycle) => cycle.cognitiveInsights?.map((insight) => insight.summary) ?? cycle.cognitiveMapSnapshot.learningGapIndicators)
    .slice(0, 6);

  const staleLiveMs = viewModel.lastUpdatedAt ? now() - Date.parse(viewModel.lastUpdatedAt) : Number.POSITIVE_INFINITY;
  const trackedStudents = Math.max(1, Object.keys(viewModel.studentActivityById).length);
  const cameraOffRatio =
    Object.values(viewModel.studentActivityById).filter((student) => student.latestStatus === "camera-off").length /
    trackedStudents;
  const unstableRatio =
    Object.values(viewModel.studentActivityById).filter(
      (student) => student.latestStatus === "reconnecting" || student.latestStatus === "disconnected",
    ).length / trackedStudents;

  const degradedReasons: string[] = [];
  if (staleLiveMs > 15000) {
    degradedReasons.push("Real-time updates are delayed.");
  }
  if (cameraOffRatio >= 0.5) {
    degradedReasons.push("Many students are camera-off.");
  }
  if (unstableRatio >= 0.35) {
    degradedReasons.push("Connectivity is unstable for multiple students.");
  }
  if (historySideAccess.dataCompletenessIssues.length > 0) {
    degradedReasons.push("Historical review is partially complete due to reduced visibility or persistence interruptions.");
  }

  const confidence =
    degradedReasons.length === 0 ? "high" : degradedReasons.length === 1 ? "medium" : "low";

  return {
    sessionAwareness: {
      classId: viewModel.classId,
      sessionActive: viewModel.lastUpdatedAt !== null,
      lastUpdatedAt: viewModel.lastUpdatedAt,
    },
    classPulse: {
      liveClassPulse: viewModel.summary.liveClassPulse,
      activeStudentCount: viewModel.summary.activeStudentCount,
      alertLevel: viewModel.summary.alertLevel,
    },
    alerting: {
      severity: alertSeverity,
      reason: insight ?? nudge ?? "Awaiting sufficient class signals.",
    },
    trendVisibility: {
      confusionTrend: viewModel.summary.confusionTrend ?? "unknown",
      trendDirection: viewModel.cognitiveMap?.trendDirection ?? "unknown",
    },
    cognitiveInsight: insight,
    teacherRecommendations: recommendations,
    flaggedStudentInspection,
    historySideAccess,
    supportPosture:
      "Teaching-assistant posture: prioritize class understanding and timely intervention, not surveillance.",
    trendArea: {
      movement: trendMovement,
      engagementSeries,
      confusionSeries,
    },
    cognitiveInsightArea: {
      latest: insight,
      recentHistory: cognitiveHistory,
      classLevelSignals: viewModel.cognitiveMap?.learningGapIndicators ?? [],
    },
    teacherActionArea: {
      immediateRecommendations: recommendations,
      priorRecommendations: historySideAccess.lastInterventions,
    },
    systemHealth: {
      confidence,
      degraded: degradedReasons.length > 0,
      reasons: degradedReasons,
    },
  };
}
