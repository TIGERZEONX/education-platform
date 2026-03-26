import assert from "assert";
import { runTeacherNudgeCycle } from "../../../backend/services/intelligence-fusion/src";
import { test } from "../test-harness";

test("teacher nudge cycle prioritizes the most recent trigger", () => {
  const result = runTeacherNudgeCycle({
    classId: "class-101",
    cycleTimestamp: "2026-03-25T10:00:00.000Z",
    triggers: [
      {
        kind: "sustained-engagement-decline",
        triggeredAt: "2026-03-25T09:59:00.000Z",
        reason: "Declining trend",
        affectedStudentIds: ["Aarav", "Mia"],
      },
      {
        kind: "confusion-spike-topic-transition",
        triggeredAt: "2026-03-25T09:59:59.000Z",
        reason: "Confusion spike",
        affectedStudentIds: ["Mia"],
      },
    ],
  });

  assert.strictEqual(result.selectedPrimaryRule, "confusion-spike-topic-transition");
  assert.strictEqual(result.nudges[0].alertLevel, "red");
  assert.ok(result.nudges[0].suggestion.length > 0);
});
