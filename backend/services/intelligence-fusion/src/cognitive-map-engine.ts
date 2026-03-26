import type {
  CognitiveInsight,
  CognitiveMapCycleInput,
  CognitiveMapCycleOutput,
  CognitiveRuleTrigger,
  CognitiveTrendSummary,
} from "../../../../shared/communication/mqtt/contracts";

export interface TopicTransitionMarker {
  topicId: string;
  transitionedAt: string;
}

export interface CognitiveRuleConfig {
  confusionSpikeNearTransitionWindowMs: number;
  sustainedDeclineSubIntervals: number;
  silentStudentThresholdMs: number;
}

export interface CognitiveMapRuntimeInput extends CognitiveMapCycleInput {
  topicTransitions: TopicTransitionMarker[];
  expectedStudentIds: string[];
  ruleConfig: CognitiveRuleConfig;
}

function toMs(timestamp: string): number {
  return Date.parse(timestamp);
}

function detectTrendDirection(scores: number[]): "up" | "flat" | "down" {
  if (scores.length < 2) {
    return "flat";
  }

  const delta = scores[scores.length - 1] - scores[0];
  if (delta > 0.05) {
    return "up";
  }

  if (delta < -0.05) {
    return "down";
  }

  return "flat";
}

function splitIntoSubIntervals(values: number[], subIntervals: number): number[][] {
  if (subIntervals <= 1 || values.length < subIntervals) {
    return [values];
  }

  const bucketSize = Math.max(1, Math.floor(values.length / subIntervals));
  const buckets: number[][] = [];

  for (let i = 0; i < values.length; i += bucketSize) {
    buckets.push(values.slice(i, i + bucketSize));
  }

  return buckets;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function createTrigger(
  kind: CognitiveRuleTrigger["kind"],
  triggeredAt: string,
  reason: string,
  affectedStudentIds: string[],
): CognitiveRuleTrigger {
  return {
    kind,
    triggeredAt,
    reason,
    affectedStudentIds,
  };
}

function confusionTrendFromPulses(confusionRates: number[]): "rising" | "stable" | "falling" {
  if (confusionRates.length < 2) {
    return "stable";
  }

  const delta = confusionRates[confusionRates.length - 1] - confusionRates[0];
  if (delta > 0.05) {
    return "rising";
  }

  if (delta < -0.05) {
    return "falling";
  }

  return "stable";
}

function pushInsight(
  insights: CognitiveInsight[],
  severity: CognitiveInsight["severity"],
  summary: string,
  category: CognitiveInsight["category"],
  studentReferences: string[],
): void {
  insights.push({
    severity,
    summary,
    category,
    studentReferences,
  });
}

export function runCognitiveMapCycle(input: CognitiveMapRuntimeInput): CognitiveMapCycleOutput {
  const triggers: CognitiveRuleTrigger[] = [];
  const insights: CognitiveInsight[] = [];
  const cycleMs = toMs(input.cycleTimestamp);

  const confusedFeedback = input.feedbackWindow.filter(
    (event) => event.valueType === "feedback-type" && event.value === "confused",
  );

  if (confusedFeedback.length > 0 && input.topicTransitions.length > 0) {
    const latestConfusedTs = Math.max(...confusedFeedback.map((event) => toMs(event.timestamp)));
    const nearTransition = input.topicTransitions.find(
      (transition) =>
        Math.abs(toMs(transition.transitionedAt) - latestConfusedTs) <=
        input.ruleConfig.confusionSpikeNearTransitionWindowMs,
    );

    if (nearTransition) {
      const affectedStudents = Array.from(new Set(confusedFeedback.map((event) => event.studentId))).sort();
      triggers.push(
        createTrigger(
          "confusion-spike-topic-transition",
          new Date(latestConfusedTs).toISOString(),
          `Confusion spike detected near transition to topic ${nearTransition.topicId}.`,
          affectedStudents,
        ),
      );

      pushInsight(
        insights,
        "red",
        `Confusion cluster near topic transition (${nearTransition.topicId}).`,
        "slow-down",
        affectedStudents,
      );
    }
  }

  const orderedPulses = [...input.classPulseWindow].sort(
    (a, b) => toMs(a.timestamp) - toMs(b.timestamp),
  );
  const pulseAverages = orderedPulses.map((pulse) => pulse.averageEngagement);
  const pulseBuckets = splitIntoSubIntervals(
    pulseAverages,
    Math.max(2, input.ruleConfig.sustainedDeclineSubIntervals),
  );
  const bucketMeans = pulseBuckets.map((bucket) => average(bucket));

  const sustainedDecline =
    bucketMeans.length >= 2 && bucketMeans.every((val, idx) => idx === 0 || val < bucketMeans[idx - 1]);

  if (sustainedDecline) {
    triggers.push(
      createTrigger(
        "sustained-engagement-decline",
        input.cycleTimestamp,
        "Engagement means are declining across sub-intervals of the current window.",
        input.activeStudents,
      ),
    );

    pushInsight(
      insights,
      "yellow",
      "Class engagement is declining over the current rolling window.",
      "interact",
      input.activeStudents,
    );
  }

  const mostRecentSignalByStudent = new Map<string, number>();

  for (const event of input.engagementWindow) {
    const ts = toMs(event.timestamp);
    const prev = mostRecentSignalByStudent.get(event.studentId);
    if (prev === undefined || ts > prev) {
      mostRecentSignalByStudent.set(event.studentId, ts);
    }
  }

  for (const event of input.feedbackWindow) {
    const ts = toMs(event.timestamp);
    const prev = mostRecentSignalByStudent.get(event.studentId);
    if (prev === undefined || ts > prev) {
      mostRecentSignalByStudent.set(event.studentId, ts);
    }
  }

  const silentStudents = input.expectedStudentIds
    .filter((studentId) => {
      const lastSignal = mostRecentSignalByStudent.get(studentId);
      if (lastSignal === undefined) {
        return true;
      }

      return cycleMs - lastSignal > input.ruleConfig.silentStudentThresholdMs;
    })
    .sort();

  if (silentStudents.length > 0) {
    triggers.push(
      createTrigger(
        "silent-student-pattern",
        input.cycleTimestamp,
        "One or more expected students have not emitted signals for an extended period.",
        silentStudents,
      ),
    );

    pushInsight(
      insights,
      "yellow",
      "Silent-student condition detected for part of the class roster.",
      "quick-poll",
      silentStudents,
    );
  }

  const trendDirection = detectTrendDirection(pulseAverages);
  const confusionTrend = confusionTrendFromPulses(orderedPulses.map((pulse) => pulse.confusionRate));

  const repeatedConfusionStudents = input.fusedClassState.studentStates
    .filter((state) => state.repeatedConfusionPattern)
    .map((state) => state.studentName ?? state.studentId)
    .sort();

  if (repeatedConfusionStudents.length > 0) {
    pushInsight(
      insights,
      "red",
      "Repeated confusion pattern detected in student feedback signals.",
      "repeat",
      repeatedConfusionStudents,
    );
  }

  if (input.fusedClassState.lowEngagementCount > 0 && !sustainedDecline) {
    pushInsight(
      insights,
      "yellow",
      "Localized engagement drop detected without full-class decline.",
      "interact",
      input.fusedClassState.studentStates
        .filter((state) => state.engagementScore < 0.45 && !state.cameraOff)
        .map((state) => state.studentName ?? state.studentId),
    );
  }

  const recoveryPatternDetected = trendDirection === "up" && confusionTrend === "falling";

  if (recoveryPatternDetected) {
    pushInsight(
      insights,
      "green",
      "Recovery pattern detected: engagement rising while confusion is easing.",
      "interact",
      [],
    );
  }

  const trendSummary: CognitiveTrendSummary = {
    trendDirection,
    confusionTrend,
    recoveryPatternDetected,
  };

  const learningGapIndicators = Array.from(
    new Set([
      ...triggers.map((trigger) => trigger.reason),
      ...insights.map((insight) => insight.summary),
    ]),
  );

  return {
    cognitiveMap: {
      classId: input.classId,
      valueType: "cognitive-map",
      value: {
        confusionZones: triggers
          .filter((trigger) => trigger.kind === "confusion-spike-topic-transition")
          .map((trigger) => trigger.reason),
        learningGapIndicators,
        trendDirection,
      },
      confusionZones: triggers
        .filter((trigger) => trigger.kind === "confusion-spike-topic-transition")
        .map((trigger) => trigger.reason),
      learningGapIndicators,
      trendDirection,
      basedOnWindowStart:
        orderedPulses[0]?.windowStart ??
        new Date(cycleMs - input.ruleConfig.silentStudentThresholdMs).toISOString(),
      basedOnWindowEnd: input.cycleTimestamp,
      timestamp: input.cycleTimestamp,
      generatedAt: input.cycleTimestamp,
    },
    triggers,
    insights,
    trendSummary,
  };
}
