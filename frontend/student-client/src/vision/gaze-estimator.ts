export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function axisDistance(a: NormalizedLandmark, b: NormalizedLandmark, axis: "x" | "y"): number {
  return Math.abs(a[axis] - b[axis]);
}

export function estimateGazeFocusScore(
  landmarks: NormalizedLandmark[],
  headOrientationScore: number,
): number {
  const leftEyeOuter = landmarks[33];
  const leftEyeInner = landmarks[133];
  const rightEyeInner = landmarks[362];
  const rightEyeOuter = landmarks[263];

  if (!leftEyeOuter || !leftEyeInner || !rightEyeInner || !rightEyeOuter) {
    return headOrientationScore;
  }

  const leftIrisCenter = landmarks[468];
  const rightIrisCenter = landmarks[473];

  if (!leftIrisCenter || !rightIrisCenter) {
    return Number((headOrientationScore * 0.9).toFixed(3));
  }

  const leftMinX = Math.min(leftEyeOuter.x, leftEyeInner.x);
  const leftMaxX = Math.max(leftEyeOuter.x, leftEyeInner.x);
  const rightMinX = Math.min(rightEyeOuter.x, rightEyeInner.x);
  const rightMaxX = Math.max(rightEyeOuter.x, rightEyeInner.x);

  const leftWidth = leftMaxX - leftMinX;
  const rightWidth = rightMaxX - rightMinX;

  if (leftWidth < 0.005 || rightWidth < 0.005) {
    return Number((headOrientationScore * 0.9).toFixed(3));
  }

  const leftRatio = clamp((leftIrisCenter.x - leftMinX) / leftWidth, 0, 1);
  const rightRatio = clamp((rightIrisCenter.x - rightMinX) / rightWidth, 0, 1);
  const centerDeviation = (Math.abs(0.5 - leftRatio) + Math.abs(0.5 - rightRatio)) / 2;
  const irisAlignmentScore = clamp(1 - centerDeviation * 2, 0, 1);

  const leftUpperLid = landmarks[159];
  const leftLowerLid = landmarks[145];
  const rightUpperLid = landmarks[386];
  const rightLowerLid = landmarks[374];

  if (!leftUpperLid || !leftLowerLid || !rightUpperLid || !rightLowerLid) {
    return Number((irisAlignmentScore * 0.7 + headOrientationScore * 0.3).toFixed(3));
  }

  const leftEyeOpen = axisDistance(leftUpperLid, leftLowerLid, "y") / leftWidth;
  const rightEyeOpen = axisDistance(rightUpperLid, rightLowerLid, "y") / rightWidth;
  const meanEyeOpen = (leftEyeOpen + rightEyeOpen) / 2;

  // Eye openness factor dampens gaze confidence when eyelids are mostly closed.
  const eyeOpenScore = clamp((meanEyeOpen - 0.08) / 0.1, 0, 1);

  return Number((irisAlignmentScore * 0.6 + headOrientationScore * 0.25 + eyeOpenScore * 0.15).toFixed(3));
}
