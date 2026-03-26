import assert from "assert";
import { createLandmarkSmoother } from "../../../frontend/student-client/src/vision/landmark-smoother";
import type { NormalizedLandmark } from "../../../frontend/student-client/src/vision/gaze-estimator";

function point(x: number, y: number, z = 0): NormalizedLandmark {
  return { x, y, z };
}

const smoother = createLandmarkSmoother(0.5, 2);

const first = smoother.smooth([point(0.2, 0.2), point(0.3, 0.3)]);
assert.strictEqual(first[0].x, 0.2);
assert.strictEqual(first[1].y, 0.3);

const second = smoother.smooth([point(0.4, 0.4), point(0.7, 0.7)]);
assert.strictEqual(Number(second[0].x.toFixed(3)), 0.3);
assert.strictEqual(Number(second[1].y.toFixed(3)), 0.5);

smoother.markMiss();
smoother.markMiss();

const third = smoother.smooth([point(0.9, 0.9), point(0.1, 0.1)]);
assert.strictEqual(third[0].x, 0.9, "Smoother should reset after consecutive misses");
assert.strictEqual(third[1].x, 0.1);

console.log("[PASS] landmark smoother");
