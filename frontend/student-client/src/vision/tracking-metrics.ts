export interface TrackingMetricsSnapshot {
  totalFrames: number;
  detectedFrames: number;
  missedFrames: number;
  detectionRate: number;
  averageConfidence: number;
  longestMissStreak: number;
  currentMissStreak: number;
}

export interface TrackingMetricsCollector {
  record: (detected: boolean, confidence: number) => TrackingMetricsSnapshot | null;
  snapshot: () => TrackingMetricsSnapshot;
  reset: () => void;
}

export function createTrackingMetricsCollector(reportIntervalMs = 5000): TrackingMetricsCollector {
  let totalFrames = 0;
  let detectedFrames = 0;
  let confidenceSum = 0;
  let currentMissStreak = 0;
  let longestMissStreak = 0;
  let lastReportAt = Date.now();

  const buildSnapshot = (): TrackingMetricsSnapshot => {
    const missedFrames = totalFrames - detectedFrames;
    return {
      totalFrames,
      detectedFrames,
      missedFrames,
      detectionRate: totalFrames === 0 ? 0 : Number((detectedFrames / totalFrames).toFixed(3)),
      averageConfidence: detectedFrames === 0 ? 0 : Number((confidenceSum / detectedFrames).toFixed(3)),
      longestMissStreak,
      currentMissStreak,
    };
  };

  return {
    record: (detected, confidence) => {
      totalFrames += 1;
      if (detected) {
        detectedFrames += 1;
        confidenceSum += confidence;
        currentMissStreak = 0;
      } else {
        currentMissStreak += 1;
        longestMissStreak = Math.max(longestMissStreak, currentMissStreak);
      }

      const now = Date.now();
      if (now - lastReportAt < reportIntervalMs) {
        return null;
      }

      lastReportAt = now;
      return buildSnapshot();
    },
    snapshot: () => buildSnapshot(),
    reset: () => {
      totalFrames = 0;
      detectedFrames = 0;
      confidenceSum = 0;
      currentMissStreak = 0;
      longestMissStreak = 0;
      lastReportAt = Date.now();
    },
  };
}
