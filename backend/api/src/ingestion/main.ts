import { bootstrapRealtimeIngestion } from "./bootstrap";

const context = bootstrapRealtimeIngestion({
  classId: "class-101",
  clientId: "backend-class-101-ingest",
  expectedStudentIds: ["Aarav", "Mia", "Noah", "Priya", "Lucas"],
  cycleIntervalMs: 5000,
  windowConfig: {
    windowDurationMs: 120000,
    activeStudentThresholdMs: 30000,
  },
  ruleConfig: {
    confusionSpikeNearTransitionWindowMs: 20000,
    sustainedDeclineSubIntervals: 3,
    silentStudentThresholdMs: 45000,
  },
  onPublish: (packet) => {
    console.log("[realtime-ingestion] outbound", packet.topic, packet.payload);
  },
  topicTransitions: [
    {
      topicId: "Fractions",
      transitionedAt: new Date().toISOString(),
    },
  ],
});

console.log("[realtime-ingestion] bootstrap ready", context.clientIdentity, context.topics.classNamespace);
