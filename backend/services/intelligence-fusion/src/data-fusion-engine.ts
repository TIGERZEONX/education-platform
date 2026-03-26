import type {
  AlertThresholdConfig,
  DataFusionCycleDerived,
  DataFusionCycleInput,
  DataFusionCycleOutput,
  FusedStudentState,
  StudentStatusEvent,
} from "../../../../shared/communication/mqtt/contracts";
import { DEFAULT_ALERT_THRESHOLDS } from "../../../../shared/communication/mqtt/contracts";

function toMs(timestamp: string): number {
  return Date.parse(timestamp);
}

function isFeedbackConfused(event: { valueType?: string; value?: string; feedbackType?: string }): boolean {
  return event.valueType === "feedback-type" && event.value === "confused" && event.feedbackType === "confused";
}

function inferOperationalState(
  latestStatusEvent: StudentStatusEvent | undefined,
  latestSeenMs: number | undefined,
  cycleTimestampMs: number,
  activeThresholdMs: number,
  cameraStatus: "active" | "blocked" | "unavailable" | undefined,
): "active" | "idle" | "reconnecting" | "disconnected" | "camera-off" {
  if (latestStatusEvent) {
    return latestStatusEvent.operationalState;
  }

  if (cameraStatus === "blocked" || cameraStatus === "unavailable") {
    return "camera-off";
  }

  if (latestSeenMs === undefined) {
    return "disconnected";
  }

  if (cycleTimestampMs - latestSeenMs > activeThresholdMs * 2) {
    return "disconnected";
  }

  if (cycleTimestampMs - latestSeenMs > activeThresholdMs) {
    return "idle";
  }

  return "active";
}

function evaluateAlertLevel(
  averageEngagement: number,
  confusionRate: number,
  thresholds: AlertThresholdConfig,
  sharpConfusionSpike: boolean,
): "green" | "yellow" | "red" {
  if (
    averageEngagement < thresholds.red.maxAverageEngagement ||
    confusionRate > thresholds.red.minConfusionRate ||
    sharpConfusionSpike
  ) {
    return "red";
  }

  if (
    averageEngagement >= thresholds.green.minAverageEngagement &&
    confusionRate <= thresholds.green.maxConfusionRate
  ) {
    return "green";
  }

  return "yellow";
}

function detectSharpConfusionSpike(
  cycleTimestampMs: number,
  windowStartMs: number,
  confusedEventMs: number[],
): boolean {
  if (confusedEventMs.length < 3) {
    return false;
  }

  const midpoint = windowStartMs + Math.floor((cycleTimestampMs - windowStartMs) / 2);
  const firstHalf = confusedEventMs.filter((t) => t < midpoint).length;
  const secondHalf = confusedEventMs.filter((t) => t >= midpoint).length;

  if (firstHalf === 0) {
    return secondHalf >= 3;
  }

  return secondHalf >= firstHalf * 2;
}

export function runDataFusionCycle(
  input: DataFusionCycleInput,
  thresholds: AlertThresholdConfig = DEFAULT_ALERT_THRESHOLDS,
): DataFusionCycleOutput {
  const cycleTimestampMs = toMs(input.cycleTimestamp);
  const windowStartMs = cycleTimestampMs - input.windowConfig.windowDurationMs;
  const activeThresholdMs = cycleTimestampMs - input.windowConfig.activeStudentThresholdMs;

  const windowEvents = input.events.filter((event) => {
    const t = toMs(event.timestamp);
    return t >= windowStartMs && t <= cycleTimestampMs;
  });

  const engagementEvents = windowEvents.filter(
    (event): event is Extract<(typeof windowEvents)[number], { valueType: "engagement-score" }> =>
      (event as { valueType?: string }).valueType === "engagement-score",
  );

  const feedbackEvents = windowEvents.filter(
    (event): event is Extract<(typeof windowEvents)[number], { valueType: "feedback-type" }> =>
      (event as { valueType?: string }).valueType === "feedback-type",
  );

  const statusEvents = windowEvents.filter(
    (event): event is Extract<(typeof windowEvents)[number], { valueType: "student-status" }> =>
      (event as { valueType?: string }).valueType === "student-status",
  );

  const studentsFromSignals = new Set<string>();

  for (const event of engagementEvents) {
    studentsFromSignals.add(event.studentId);
  }

  for (const event of feedbackEvents) {
    studentsFromSignals.add(event.studentId);
  }

  for (const event of statusEvents) {
    studentsFromSignals.add(event.studentId);
  }

  const latestEngagementByStudent = new Map<string, { timestampMs: number; score: number }>();
  const latestCameraStatusByStudent = new Map<string, "active" | "blocked" | "unavailable">();
  const latestStatusByStudent = new Map<string, StudentStatusEvent>();
  const confusionByStudent = new Map<string, number>();
  const latestSeenByStudent = new Map<string, number>();
  const studentNameByStudent = new Map<string, string>();

  for (const event of engagementEvents) {
    const existing = latestEngagementByStudent.get(event.studentId);
    const timestampMs = toMs(event.timestamp);

    if (!existing || timestampMs > existing.timestampMs) {
      latestEngagementByStudent.set(event.studentId, {
        timestampMs,
        score: event.engagementScore,
      });
    }

    latestCameraStatusByStudent.set(event.studentId, event.cameraStatus);
    latestSeenByStudent.set(
      event.studentId,
      Math.max(latestSeenByStudent.get(event.studentId) ?? 0, timestampMs),
    );

    if (event.studentName) {
      studentNameByStudent.set(event.studentId, event.studentName);
    }
  }

  for (const event of statusEvents) {
    const prev = latestStatusByStudent.get(event.studentId);
    const ts = toMs(event.timestamp);
    if (!prev || ts > toMs(prev.timestamp)) {
      latestStatusByStudent.set(event.studentId, event);
    }

    latestCameraStatusByStudent.set(event.studentId, event.cameraStatus);
    latestSeenByStudent.set(
      event.studentId,
      Math.max(latestSeenByStudent.get(event.studentId) ?? 0, ts),
    );
    studentNameByStudent.set(event.studentId, event.studentName);
  }

  for (const event of feedbackEvents) {
    const ts = toMs(event.timestamp);
    latestSeenByStudent.set(
      event.studentId,
      Math.max(latestSeenByStudent.get(event.studentId) ?? 0, ts),
    );

    if (isFeedbackConfused(event)) {
      confusionByStudent.set(event.studentId, (confusionByStudent.get(event.studentId) ?? 0) + 1);
    }

    if (event.studentName) {
      studentNameByStudent.set(event.studentId, event.studentName);
    }
  }

  const fusedStudentStates: FusedStudentState[] = Array.from(studentsFromSignals)
    .sort()
    .map((studentId) => {
      const latestEngagement = latestEngagementByStudent.get(studentId);
      const latestSeenMs = latestSeenByStudent.get(studentId);
      const cameraStatus = latestCameraStatusByStudent.get(studentId);
      const statusEvent = latestStatusByStudent.get(studentId);
      const operationalState = inferOperationalState(
        statusEvent,
        latestSeenMs,
        cycleTimestampMs,
        input.windowConfig.activeStudentThresholdMs,
        cameraStatus,
      );
      const inactive =
        latestSeenMs === undefined || cycleTimestampMs - latestSeenMs > input.windowConfig.activeStudentThresholdMs;
      const cameraOff = operationalState === "camera-off";
      const engagementScore = latestEngagement?.score ?? (cameraOff ? 0 : 0.15);
      const confusionCount = confusionByStudent.get(studentId) ?? 0;
      const signalQuality =
        latestEngagement === undefined
          ? "missing"
          : cameraOff || operationalState === "disconnected" || inactive
            ? "unstable"
            : "stable";

      return {
        studentId,
        studentName: studentNameByStudent.get(studentId),
        operationalState,
        engagementScore,
        signalQuality,
        explicitConfusionCount: confusionCount,
        repeatedConfusionPattern: confusionCount >= 2,
        cameraOff,
        inactive,
        lastSeenAt: new Date(latestSeenMs ?? windowStartMs).toISOString(),
      };
    });

  const activeStudents = fusedStudentStates
    .filter((state) => !state.inactive && state.operationalState === "active")
    .map((state) => state.studentId);

  const engagementScores = fusedStudentStates
    .filter((state) => !state.cameraOff && state.operationalState !== "disconnected")
    .map((state) => state.engagementScore);

  const averageEngagementAcrossActiveStudents =
    engagementScores.length > 0
      ? engagementScores.reduce((sum, score) => sum + score, 0) / engagementScores.length
      : 0;

  const confusedEventMs = feedbackEvents
    .filter((event) => isFeedbackConfused(event))
    .map((event) => toMs(event.timestamp));

  const confusionRateWithinWindow =
    fusedStudentStates.length > 0
      ? fusedStudentStates.filter((state) => state.explicitConfusionCount > 0).length / fusedStudentStates.length
      : 0;

  const cameraOffCount = fusedStudentStates.filter((state) => state.cameraOff).length;
  const inactiveCount = fusedStudentStates.filter((state) => state.inactive).length;
  const lowEngagementCount = fusedStudentStates.filter(
    (state) => !state.cameraOff && !state.inactive && state.engagementScore < thresholds.red.maxAverageEngagement,
  ).length;
  const explicitConfusionCount = fusedStudentStates.reduce(
    (sum, state) => sum + state.explicitConfusionCount,
    0,
  );

  const sharpConfusionSpike = detectSharpConfusionSpike(cycleTimestampMs, windowStartMs, confusedEventMs);

  const alertLevel = evaluateAlertLevel(
    averageEngagementAcrossActiveStudents,
    confusionRateWithinWindow,
    thresholds,
    sharpConfusionSpike || lowEngagementCount > 0 || inactiveCount > Math.ceil(fusedStudentStates.length * 0.4),
  );

  const unifiedClassState = {
    classId: input.classId,
    timestamp: input.cycleTimestamp,
    averageEngagement: averageEngagementAcrossActiveStudents,
    confusionRate: confusionRateWithinWindow,
    activeStudentCount: activeStudents.length,
    cameraOffCount,
    inactiveCount,
    explicitConfusionCount,
    lowEngagementCount,
    studentStates: fusedStudentStates,
  };

  const derived: DataFusionCycleDerived = {
    activeStudents,
    averageEngagementAcrossActiveStudents,
    confusionRateWithinWindow,
    alertLevel,
    unifiedClassState,
  };

  return {
    classPulseSnapshot: {
      classId: input.classId,
      valueType: "class-pulse",
      value: {
        averageEngagement: averageEngagementAcrossActiveStudents,
        confusionRate: confusionRateWithinWindow,
        activeStudentCount: activeStudents.length,
        alertLevel,
      },
      averageEngagement: averageEngagementAcrossActiveStudents,
      confusionRate: confusionRateWithinWindow,
      activeStudentCount: activeStudents.length,
      alertLevel,
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: input.cycleTimestamp,
      timestamp: input.cycleTimestamp,
      computedAt: input.cycleTimestamp,
    },
    derived,
  };
}
