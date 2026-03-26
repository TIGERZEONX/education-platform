import type { NormalizedLandmark } from "./gaze-estimator";

export interface HeadPoseAngles {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface HeadPoseEstimator {
  estimate: (landmarks: NormalizedLandmark[]) => HeadPoseAngles;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function createHeadPoseEstimator(): HeadPoseEstimator {
  return {
    estimate: (landmarks) => {
      const nose = landmarks[1];
      const forehead = landmarks[10];
      const chin = landmarks[152];
      const leftEar = landmarks[234];
      const rightEar = landmarks[454];

      if (!nose || !forehead || !chin || !leftEar || !rightEar) {
        return { pitch: 0, yaw: 0, roll: 0 };
      }

      const noseToForehead: [number, number, number] = [
        forehead.x - nose.x,
        forehead.y - nose.y,
        (forehead.z || 0) - (nose.z || 0),
      ];

      const noseToChin: [number, number, number] = [
        chin.x - nose.x,
        chin.y - nose.y,
        (chin.z || 0) - (nose.z || 0),
      ];

      const noseToLeft: [number, number, number] = [
        leftEar.x - nose.x,
        leftEar.y - nose.y,
        (leftEar.z || 0) - (nose.z || 0),
      ];

      const noseToRight: [number, number, number] = [
        rightEar.x - nose.x,
        rightEar.y - nose.y,
        (rightEar.z || 0) - (nose.z || 0),
      ];

      const yAxis = normalize(noseToForehead);
      const xAxisRaw = cross(noseToRight, noseToLeft);
      const xAxis = normalize(xAxisRaw);
      const zAxis = normalize(cross(xAxis, yAxis));

      const pitch = Math.asin(Math.max(-1, Math.min(1, -yAxis[2]))) * (180 / Math.PI);

      const yawX = dot(noseToRight, xAxis);
      const yawZ = dot(noseToRight, zAxis);
      const yaw = Math.atan2(-yawZ, yawX) * (180 / Math.PI);

      const rollX = dot(noseToForehead, xAxis);
      const rollZ = dot(noseToForehead, zAxis);
      const roll = Math.atan2(rollZ, rollX) * (180 / Math.PI);

      return {
        pitch: Number(pitch.toFixed(1)),
        yaw: Number(yaw.toFixed(1)),
        roll: Number(roll.toFixed(1)),
      };
    },
  };
}

export function estimateHeadOrientationScore(pose: HeadPoseAngles): number {
  const maxDeviation = 45;
  const maxAngle = Math.max(Math.abs(pose.pitch), Math.abs(pose.yaw), Math.abs(pose.roll));
  return Math.max(0, 1 - maxAngle / maxDeviation);
}
