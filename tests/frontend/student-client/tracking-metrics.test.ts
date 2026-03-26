import assert from "assert";
import { createTrackingMetricsCollector } from "../../../frontend/student-client/src/vision/tracking-metrics";

const collector = createTrackingMetricsCollector(0);

collector.record(true, 0.8);
collector.record(true, 0.6);
collector.record(false, 0);
collector.record(false, 0);
collector.record(true, 0.9);

const snapshot = collector.snapshot();
assert.strictEqual(snapshot.totalFrames, 5);
assert.strictEqual(snapshot.detectedFrames, 3);
assert.strictEqual(snapshot.missedFrames, 2);
assert.strictEqual(snapshot.detectionRate, 0.6);
assert.strictEqual(snapshot.averageConfidence, 0.767);
assert.strictEqual(snapshot.longestMissStreak, 2);
assert.strictEqual(snapshot.currentMissStreak, 0);

collector.reset();
const resetSnapshot = collector.snapshot();
assert.strictEqual(resetSnapshot.totalFrames, 0);
assert.strictEqual(resetSnapshot.detectedFrames, 0);

console.log("[PASS] tracking metrics");
