import type { FeedbackType } from "../../../../shared/communication/mqtt/contracts";

export interface FeedbackTriggerResult {
  accepted: boolean;
  feedbackType: FeedbackType;
  reason?: "cooldown" | "burst-protection";
}

export interface FeedbackControlState {
  controlsVisible: true;
  minIntervalMs: number;
  burstLimit: number;
}

export interface FeedbackController {
  state: () => FeedbackControlState;
  trigger: (feedbackType: FeedbackType, nowMs?: number) => FeedbackTriggerResult;
}

export interface FeedbackControllerConfig {
  minIntervalMs?: number;
  burstWindowMs?: number;
  burstLimit?: number;
}

export function createFeedbackController(config: FeedbackControllerConfig = {}): FeedbackController {
  const minIntervalMs = config.minIntervalMs ?? 1200;
  const burstWindowMs = config.burstWindowMs ?? 8000;
  const burstLimit = config.burstLimit ?? 4;

  const lastSentByType = new Map<FeedbackType, number>();
  const sentTimestamps: number[] = [];

  return {
    state: () => ({
      controlsVisible: true,
      minIntervalMs,
      burstLimit,
    }),
    trigger: (feedbackType, nowMs = Date.now()) => {
      const previous = lastSentByType.get(feedbackType);
      if (previous !== undefined && nowMs - previous < minIntervalMs) {
        return {
          accepted: false,
          feedbackType,
          reason: "cooldown",
        };
      }

      const activeBurst = sentTimestamps.filter((ts) => nowMs - ts <= burstWindowMs);
      if (activeBurst.length >= burstLimit) {
        return {
          accepted: false,
          feedbackType,
          reason: "burst-protection",
        };
      }

      lastSentByType.set(feedbackType, nowMs);
      sentTimestamps.length = 0;
      sentTimestamps.push(...activeBurst, nowMs);

      return {
        accepted: true,
        feedbackType,
      };
    },
  };
}
