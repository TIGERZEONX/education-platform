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
  let recentScores: number[] = [];
  let latestOutput: EngagementSensingOutput = {
    engagementScore: lastStableScore,
    signalQuality: "insufficient-visual-confidence",
  };

  const PUSH_WINDOW = 5;

  const pushRecentScore = (score: number): void => {
    recentScores.push(score);
    if (recentScores.length > PUSH_WINDOW) {
      recentScores = recentScores.slice(recentScores.length - PUSH_WINDOW);
    }
  };

  const calculateVariance = (): number => {
    if (recentScores.length < 2) {
      return 0;
    }

    const mean = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    const squaredDeltaSum = recentScores.reduce((sum, score) => {
      const delta = score - mean;
      return sum + delta * delta;
    }, 0);

    return squaredDeltaSum / recentScores.length;
  };

  return {
    processObservation: (observation) => {
      const base = deriveEngagementScore(observation);
      const lowConfidence = observation.confidence < 0.6;
      const noFace = !observation.facePresent;

      if (lowConfidence || noFace) {
        const decayed = Math.max(0, Number((lastStableScore * 0.97).toFixed(3)));
        pushRecentScore(decayed);
        latestOutput = {
          engagementScore: decayed,
          signalQuality: "insufficient-visual-confidence",
        };
        return latestOutput;
      }

      const confidenceWeight = Math.min(0.5, Math.max(0.2, observation.confidence * 0.55));
      const smoothed = Number((lastStableScore * (1 - confidenceWeight) + base * confidenceWeight).toFixed(3));
      pushRecentScore(smoothed);

      const variance = calculateVariance();
      const unstable = Math.abs(smoothed - lastStableScore) > 0.2 || variance > 0.02;
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
