import assert from "assert";
import { runCognitiveMapCycle } from "../../../backend/services/intelligence-fusion/src";
import { test } from "../test-harness";

test("cognitive map emits confusion-transition and silent-student triggers", () => {
  const result = runCognitiveMapCycle({
    classId: "class-101",
    cycleTimestamp: "2026-03-25T10:00:00.000Z",
    classPulseWindow: [
      {
        classId: "class-101",
        valueType: "class-pulse",
        value: {
          averageEngagement: 0.65,
          confusionRate: 0.2,
          activeStudentCount: 3,
          alertLevel: "yellow",
        },
        averageEngagement: 0.65,
        confusionRate: 0.2,
        activeStudentCount: 3,
        alertLevel: "yellow",
        windowStart: "2026-03-25T09:58:00.000Z",
        windowEnd: "2026-03-25T09:59:00.000Z",
        timestamp: "2026-03-25T09:59:00.000Z",
        computedAt: "2026-03-25T09:59:00.000Z",
      },
      {
        classId: "class-101",
        valueType: "class-pulse",
        value: {
          averageEngagement: 0.5,
          confusionRate: 0.3,
          activeStudentCount: 3,
          alertLevel: "yellow",
        },
        averageEngagement: 0.5,
        confusionRate: 0.3,
        activeStudentCount: 3,
        alertLevel: "yellow",
        windowStart: "2026-03-25T09:59:00.000Z",
        windowEnd: "2026-03-25T10:00:00.000Z",
        timestamp: "2026-03-25T10:00:00.000Z",
        computedAt: "2026-03-25T10:00:00.000Z",
      },
    ],
    engagementWindow: [
      {
        studentId: "Aarav",
        classId: "class-101",
        valueType: "engagement-score",
        value: 0.6,
        engagementScore: 0.6,
        cameraStatus: "active",
        timestamp: "2026-03-25T09:59:50.000Z",
      },
    ],
    feedbackWindow: [
      {
        studentId: "Mia",
        classId: "class-101",
        valueType: "feedback-type",
        value: "confused",
        feedbackType: "confused",
        timestamp: "2026-03-25T09:59:52.000Z",
      },
    ],
    statusWindow: [
      {
        studentId: "Aarav",
        studentName: "Aarav",
        classId: "class-101",
        valueType: "student-status",
        value: "active",
        operationalState: "active",
        cameraStatus: "active",
        timestamp: "2026-03-25T09:59:49.000Z",
      },
    ],
    activeStudents: ["Aarav", "Mia"],
    fusedClassState: {
      classId: "class-101",
      timestamp: "2026-03-25T10:00:00.000Z",
      averageEngagement: 0.58,
      confusionRate: 0.3,
      activeStudentCount: 2,
      cameraOffCount: 0,
      inactiveCount: 1,
      explicitConfusionCount: 1,
      lowEngagementCount: 1,
      studentStates: [
        {
          studentId: "Aarav",
          studentName: "Aarav",
          operationalState: "active",
          engagementScore: 0.6,
          signalQuality: "stable",
          explicitConfusionCount: 0,
          repeatedConfusionPattern: false,
          cameraOff: false,
          inactive: false,
          lastSeenAt: "2026-03-25T09:59:50.000Z",
        },
        {
          studentId: "Mia",
          studentName: "Mia",
          operationalState: "idle",
          engagementScore: 0.3,
          signalQuality: "unstable",
          explicitConfusionCount: 1,
          repeatedConfusionPattern: false,
          cameraOff: false,
          inactive: true,
          lastSeenAt: "2026-03-25T09:59:52.000Z",
        },
      ],
    },
    topicTransitions: [{ topicId: "Decimals", transitionedAt: "2026-03-25T09:59:50.000Z" }],
    expectedStudentIds: ["Aarav", "Mia", "Noah"],
    ruleConfig: {
      confusionSpikeNearTransitionWindowMs: 5000,
      sustainedDeclineSubIntervals: 2,
      silentStudentThresholdMs: 30000,
    },
  });

  const kinds = result.triggers.map((trigger) => trigger.kind);
  assert.ok(kinds.includes("confusion-spike-topic-transition"));
  assert.ok(kinds.includes("silent-student-pattern"));
  assert.strictEqual(result.cognitiveMap.valueType, "cognitive-map");
});
