export interface VisionInputFrame {
  facePresent: boolean;
  headOrientationScore: number;
  gazeFocusScore: number;
  attentivenessScore: number;
}

export function deriveEngagementScore(frame: VisionInputFrame): number {
  if (!frame.facePresent) {
    return 0;
  }

  const weighted =
    frame.headOrientationScore * 0.25 +
    frame.gazeFocusScore * 0.35 +
    frame.attentivenessScore * 0.4;

  return Math.max(0, Math.min(1, Number(weighted.toFixed(3))));
}

export type QuickFeedbackControl = "confused" | "understood" | "repeat";

export function mapFeedbackControlToType(input: QuickFeedbackControl): QuickFeedbackControl {
  return input;
}
