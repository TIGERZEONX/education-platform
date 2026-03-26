import assert from "assert";
import { bootstrapRealtimeIngestion } from "../../../backend/api/src/ingestion/bootstrap";
import { test } from "../test-harness";

test("ingestion bootstrap buffers inbound signals and publishes derived outputs", () => {
  let nowMs = Date.parse("2026-03-25T10:00:00.000Z");
  const published: Array<{ topic: string; payload: string }> = [];

  const context = bootstrapRealtimeIngestion({
    classId: "class-101",
    clientId: "backend-class-101-ingest",
    expectedStudentIds: ["Aarav", "Mia", "Noah"],
    cycleIntervalMs: 999999,
    windowConfig: {
      windowDurationMs: 120000,
      activeStudentThresholdMs: 30000,
    },
    ruleConfig: {
      confusionSpikeNearTransitionWindowMs: 5000,
      sustainedDeclineSubIntervals: 2,
      silentStudentThresholdMs: 30000,
    },
    onPublish: (packet) => {
      published.push(packet);
    },
    now: () => nowMs,
    topicTransitions: [{ topicId: "Fractions", transitionedAt: "2026-03-25T09:59:59.000Z" }],
  });

  context.handleInboundMqttEnvelope({
    messageId: "m-1",
    schemaVersion: "1.0.0",
    source: "student-client",
    payloadType: "engagement-signal",
    payload: {
      studentId: "Aarav",
      classId: "class-101",
      valueType: "engagement-score",
      value: 0.8,
      engagementScore: 0.8,
      cameraStatus: "active",
      timestamp: "2026-03-25T09:59:55.000Z",
    },
  });

  context.handleInboundMqttEnvelope({
    messageId: "m-2",
    schemaVersion: "1.0.0",
    source: "student-client",
    payloadType: "feedback-event",
    payload: {
      studentId: "Mia",
      classId: "class-101",
      valueType: "feedback-type",
      value: "confused",
      feedbackType: "confused",
      timestamp: "2026-03-25T09:59:58.000Z",
    },
  });

  nowMs = Date.parse("2026-03-25T10:00:01.000Z");
  const cycle = context.runCycleOnce();

  assert.ok(cycle.classPulseSnapshot.activeStudentCount >= 1);
  assert.ok(published.length >= 2);
  assert.strictEqual(context.historyStore.listRecent("class-101", 1).length, 1);

  context.dispose();
});
