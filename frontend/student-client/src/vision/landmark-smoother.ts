import type { NormalizedLandmark } from "./gaze-estimator";

export interface LandmarkSmoother {
  smooth: (landmarks: NormalizedLandmark[]) => NormalizedLandmark[];
  markMiss: () => void;
  reset: () => void;
}

function lerp(previous: number, current: number, alpha: number): number {
  return previous * (1 - alpha) + current * alpha;
}

export function createLandmarkSmoother(alpha = 0.35, maxMissesBeforeReset = 8): LandmarkSmoother {
  let smoothed: NormalizedLandmark[] | null = null;
  let misses = 0;

  return {
    smooth: (landmarks) => {
      misses = 0;
      if (!smoothed || smoothed.length !== landmarks.length) {
        smoothed = landmarks.map((point) => ({ ...point }));
        return smoothed;
      }

      smoothed = landmarks.map((point, index) => {
        const previous = smoothed![index];
        return {
          x: lerp(previous.x, point.x, alpha),
          y: lerp(previous.y, point.y, alpha),
          z: point.z === undefined || previous.z === undefined ? point.z : lerp(previous.z, point.z, alpha),
        };
      });

      return smoothed;
    },
    markMiss: () => {
      misses += 1;
      if (misses >= maxMissesBeforeReset) {
        smoothed = null;
      }
    },
    reset: () => {
      smoothed = null;
      misses = 0;
    },
  };
}
