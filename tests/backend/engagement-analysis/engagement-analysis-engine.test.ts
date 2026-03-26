import assert from "assert";
import { analyzeEngagementObservation } from "../../../backend/services/engagement-analysis/src";
import { test } from "../test-harness";

test("legacy fallback analyze helper is disabled in strict YOLO mode", () => {
  assert.throws(
    () =>
      analyzeEngagementObservation({
        studentId: "s-1",
        classId: "class-101",
        timestamp: "2026-03-26T10:00:00.000Z",
        facePresent: true,
        confidence: 0.92,
        headOrientationScore: 0.86,
        gazeFocusScore: 0.9,
        attentivenessScore: 0.88,
      }),
    /removed/i,
  );
});
