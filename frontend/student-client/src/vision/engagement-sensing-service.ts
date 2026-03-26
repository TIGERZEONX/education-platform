import { deriveEngagementScore } from "../app/signal-paths";

export type VisualSignalQuality = "stable" | "unstable" | "insufficient-visual-confidence";

export interface VisualObservation {
  facePresent: boolean;
  headOrientationScore: number;
  gazeFocusScore: number;
  attentivenessScore: number;
  confidence: number;
}

export interface EngagementSensingOutput {
  engagementScore: number;
  signalQuality: VisualSignalQuality;
}

export interface EngagementSensingService {
  processObservation: (observation: VisualObservation) => EngagementSensingOutput;
  latest: () => EngagementSensingOutput;
}

export function createEngagementSensingService(): EngagementSensingService {
  let lastStableScore = 0.5;
  let latestOutput: EngagementSensingOutput = {
    engagementScore: lastStableScore,
    signalQuality: "insufficient-visual-confidence",
  };

  return {
    processObservation: (observation) => {
      const base = deriveEngagementScore(observation);
      const lowConfidence = observation.confidence < 0.45;
      const noFace = !observation.facePresent;

      if (lowConfidence || noFace) {
        const decayed = Math.max(0, Number((lastStableScore * 0.95).toFixed(3)));
        latestOutput = {
          engagementScore: decayed,
          signalQuality: "insufficient-visual-confidence",
        };
        return latestOutput;
      }

      const smoothed = Number((lastStableScore * 0.6 + base * 0.4).toFixed(3));
      const unstable = Math.abs(smoothed - lastStableScore) > 0.25;
      lastStableScore = smoothed;

      latestOutput = {
        engagementScore: smoothed,
        signalQuality: unstable ? "unstable" : "stable",
      };

      return latestOutput;
    },
    latest: () => latestOutput,
  };
}
