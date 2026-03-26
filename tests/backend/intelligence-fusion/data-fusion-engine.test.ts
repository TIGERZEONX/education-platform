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
});
