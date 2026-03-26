import assert from "assert";
import { estimateGazeFocusScore, type NormalizedLandmark } from "../../../frontend/student-client/src/vision/gaze-estimator";

function buildLandmarks(leftIrisX: number, rightIrisX: number): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));

  landmarks[33] = { x: 0.35, y: 0.42 };
  landmarks[133] = { x: 0.45, y: 0.42 };
  landmarks[362] = { x: 0.55, y: 0.42 };
  landmarks[263] = { x: 0.65, y: 0.42 };

  landmarks[468] = { x: leftIrisX, y: 0.42 };
  landmarks[473] = { x: rightIrisX, y: 0.42 };

  // Eye openness landmarks (open eyes baseline)
  landmarks[159] = { x: 0.4, y: 0.39 };
  landmarks[145] = { x: 0.4, y: 0.45 };
  landmarks[386] = { x: 0.6, y: 0.39 };
  landmarks[374] = { x: 0.6, y: 0.45 };

  return landmarks;
}

const centered = estimateGazeFocusScore(buildLandmarks(0.40, 0.60), 0.9);
assert.ok(centered >= 0.9, "Centered gaze should produce a high score");

const leftShifted = estimateGazeFocusScore(buildLandmarks(0.36, 0.56), 0.9);
assert.ok(leftShifted < centered, "Off-center gaze should reduce score");

const nearClosedEyes = buildLandmarks(0.40, 0.60);
nearClosedEyes[159] = { x: 0.4, y: 0.42 };
nearClosedEyes[145] = { x: 0.4, y: 0.425 };
nearClosedEyes[386] = { x: 0.6, y: 0.42 };
nearClosedEyes[374] = { x: 0.6, y: 0.425 };
const lowEyeOpen = estimateGazeFocusScore(nearClosedEyes, 0.9);
assert.ok(lowEyeOpen < centered, "Closed or near-closed eyes should reduce gaze confidence");

const fallbackLandmarks = buildLandmarks(0.40, 0.60);
delete (fallbackLandmarks as Array<NormalizedLandmark | undefined>)[468];
delete (fallbackLandmarks as Array<NormalizedLandmark | undefined>)[473];
const fallback = estimateGazeFocusScore(fallbackLandmarks, 0.8);
assert.strictEqual(fallback, 0.72, "No iris landmarks should fall back to damped head orientation");

console.log("[PASS] gaze estimator");
