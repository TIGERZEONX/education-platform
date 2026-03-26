import assert from "assert";
import { createHeadPoseEstimator, estimateHeadOrientationScore } from "../../../frontend/student-client/src/vision/head-pose-estimator";
import type { NormalizedLandmark } from "../../../frontend/student-client/src/vision/gaze-estimator";

function buildLandmarks(
  noseX: number,
  noseY: number,
  foreheadY: number,
  chinY: number,
  leftX: number = -0.15,
  rightX: number = 0.15,
): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));

  landmarks[1] = { x: noseX, y: noseY, z: 0 };
  landmarks[10] = { x: noseX, y: foreheadY, z: -0.1 };
  landmarks[152] = { x: noseX, y: chinY, z: -0.05 };
  landmarks[234] = { x: noseX + leftX, y: noseY, z: 0 };
  landmarks[454] = { x: noseX + rightX, y: noseY, z: 0 };

  return landmarks;
}

const poseEstimator = createHeadPoseEstimator();

const neutral = poseEstimator.estimate(buildLandmarks(0.5, 0.5, 0.3, 0.7));
assert.ok(neutral.pitch !== null && neutral.yaw !== null, "Neutral pose should have valid angles");

const score = estimateHeadOrientationScore(neutral);
assert.ok(score >= 0 && score <= 1, "Head orientation score should be normalized");

const tilted = poseEstimator.estimate(buildLandmarks(0.5, 0.5, 0.45, 0.65, -0.1, 0.1));
const tiltedScore = estimateHeadOrientationScore(tilted);
assert.ok(typeof tiltedScore === "number", "Tilted head should produce valid score");

console.log("[PASS] head pose estimator");
