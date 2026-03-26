import assert from "assert";
import { runDataFusionCycle } from "../../../backend/services/intelligence-fusion/src";
import { test } from "../test-harness";

test("data fusion computes active students and class pulse", () => {
  const cycleTimestamp = "2026-03-25T10:00:00.000Z";

  const result = runDataFusionCycle({
    classId: "class-101",
    cycleTimestamp,
    windowConfig: {
      windowDurationMs: 120000,
      activeStudentThresholdMs: 30000,
    },
    events: [
      {
        studentId: "Aarav",
        classId: "class-101",
        valueType: "engagement-score",
        value: 0.9,
        engagementScore: 0.9,
        cameraStatus: "active",
        timestamp: "2026-03-25T09:59:55.000Z",
      },
      {
        studentId: "Aarav",
        classId: "class-101",
        valueType: "engagement-score",
        value: 0.7,
        engagementScore: 0.7,
        cameraStatus: "active",
        timestamp: "2026-03-25T09:59:20.000Z",
      },
      {
        studentId: "Mia",
        classId: "class-101",
        valueType: "engagement-score",
        value: 0.5,
        engagementScore: 0.5,
        cameraStatus: "active",
        timestamp: "2026-03-25T09:59:50.000Z",
      },
      {
        studentId: "Mia",
        classId: "class-101",
        valueType: "feedback-type",
        value: "confused",
        feedbackType: "confused",
        timestamp: "2026-03-25T09:59:58.000Z",
      },
    ],
  });

  assert.deepStrictEqual(result.derived.activeStudents, ["Aarav", "Mia"]);
  assert.strictEqual(result.classPulseSnapshot.activeStudentCount, 2);
  assert.strictEqual(result.classPulseSnapshot.alertLevel, "red");
  assert.ok(result.classPulseSnapshot.averageEngagement > 0.6);
  assert.ok(result.derived.unifiedClassState.engagementTrend);
  assert.ok(result.derived.unifiedClassState.engagementTrend!.samples >= 3);

  const aarav = result.derived.unifiedClassState.studentStates.find((state) => state.studentId === "Aarav");
  assert.ok(aarav?.engagementTrend);
  assert.strictEqual(aarav?.engagementTrend?.direction, "up");
});

test("data fusion excludes missing engagement signals from class average", () => {
  const cycleTimestamp = "2026-03-25T10:00:00.000Z";

  const result = runDataFusionCycle({
    classId: "class-101",
    cycleTimestamp,
    windowConfig: {
      windowDurationMs: 120000,
      activeStudentThresholdMs: 30000,
    },
    events: [
      {
        studentId: "Aarav",
        classId: "class-101",
        valueType: "engagement-score",
        value: 0.8,
        engagementScore: 0.8,
        cameraStatus: "active",
        timestamp: "2026-03-25T09:59:55.000Z",
      },
      {
        studentId: "Mia",
        classId: "class-101",
        valueType: "feedback-type",
        value: "repeat",
        feedbackType: "repeat",
        timestamp: "2026-03-25T09:59:58.000Z",
      },
    ],
  });

  assert.strictEqual(result.classPulseSnapshot.averageEngagement, 0.8);
  const mia = result.derived.unifiedClassState.studentStates.find((state) => state.studentId === "Mia");
  assert.strictEqual(mia?.signalQuality, "missing");
});

test("data fusion fallback generates random engagement score in 80-100 range", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.4;

  try {
    const result = runDataFusionCycle({
      classId: "class-101",
      cycleTimestamp: "2026-03-25T10:00:00.000Z",
      windowConfig: {
        windowDurationMs: 120000,
        activeStudentThresholdMs: 30000,
      },
      events: [
        {
          studentId: "Mia",
          classId: "class-101",
          valueType: "feedback-type",
          value: "repeat",
          feedbackType: "repeat",
          timestamp: "2026-03-25T09:59:58.000Z",
        },
      ],
    });

    assert.strictEqual(result.classPulseSnapshot.averageEngagement, 0.88);
    assert.ok(result.classPulseSnapshot.averageEngagement >= 0.8);
    assert.ok(result.classPulseSnapshot.averageEngagement <= 1);
    assert.strictEqual(result.classPulseSnapshot.liveSignalState, "insufficient");
  } finally {
    Math.random = originalRandom;
  }
});
