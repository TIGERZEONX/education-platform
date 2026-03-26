import type {
  CognitiveInsight,
  CognitiveMapSnapshot,
  ClassPulseSnapshot,
  MqttClientIdentity,
  MqttEnvelope,
  MqttPayload,
  RollingWindowConfig,
  TeacherNudge,
} from "../../../../shared/communication/mqtt/contracts";
import { buildTopicContracts } from "../../../../shared/communication/mqtt/topics";
import {
  buildEnvelope,
  buildPublishPacket,
} from "../../../services/realtime-messaging/src";
import {
  InMemoryHistoryStore,
  type HistoryStore,
} from "../../../services/persistence-history/src";
import {
  runIntelligenceCycle,
  type TopicTransitionMarker,
  type CognitiveRuleConfig,
} from "../../../services/intelligence-fusion/src";
import { SessionWindowManager } from "./session-window-manager";

export interface RealtimeIngestionBootstrapConfig {
  classId: string;
  clientId: string;
  expectedStudentIds: string[];
  cycleIntervalMs: number;
  windowConfig: RollingWindowConfig;
  ruleConfig: CognitiveRuleConfig;
  schemaVersion?: "1.0.0";
  onPublish: (packet: { topic: string; payload: string }) => void;
  now?: () => number;
  topicTransitions?: TopicTransitionMarker[];
  historyStore?: HistoryStore;
}

export interface OutboundDerivedSignals {
  classPulseSnapshot: ClassPulseSnapshot;
  cognitiveMapSnapshot: CognitiveMapSnapshot;
  teacherNudges: TeacherNudge[];
  cognitiveInsights: CognitiveInsight[];
}

export interface RealtimeIngestionBootstrapContext {
  clientIdentity: MqttClientIdentity;
  topics: ReturnType<typeof buildTopicContracts>;
  cycleIntervalMs: number;
  historyStore: HistoryStore;
  handleInboundMqttEnvelope: (envelope: MqttEnvelope<MqttPayload>) => void;
  runCycleOnce: () => OutboundDerivedSignals;
  dispose: () => void;
}

export function bootstrapRealtimeIngestion(
  config: RealtimeIngestionBootstrapConfig,
): RealtimeIngestionBootstrapContext {
  const topics = buildTopicContracts(config);
  const schemaVersion = config.schemaVersion ?? "1.0.0";
  const now = config.now ?? (() => Date.now());
  const historyStore = config.historyStore ?? new InMemoryHistoryStore();
  const sessionId = `${config.classId}-live`;
  const pendingPersistenceFailureTimestamps: string[] = [];
  const safePersist = (operation: () => void): void => {
    try {
      operation();

      if (pendingPersistenceFailureTimestamps.length > 0) {
        for (const failedAt of pendingPersistenceFailureTimestamps.splice(0)) {
          historyStore.appendDataCompletenessIssue({
            classId: config.classId,
            sessionId,
            kind: "persistence-failure",
            timestamp: failedAt,
            summary: "Partial history capture: a persistence write failed during live session.",
            detail: "Live classroom processing continued, but some historical records may be missing.",
          });
        }
      }
    } catch (_error) {
      // Persistence is a side module; live classroom flow must continue on storage failures.
      pendingPersistenceFailureTimestamps.push(new Date(now()).toISOString());
    }
  };

  const topicTransitions = config.topicTransitions ?? [];

  const windowManager = new SessionWindowManager({
    classId: config.classId,
    expectedStudentIds: config.expectedStudentIds,
    cycleIntervalMs: config.cycleIntervalMs,
    windowConfig: config.windowConfig,
    now,
  });

  const clientIdentity: MqttClientIdentity = {
    role: "backend",
    clientId: config.clientId,
    classId: config.classId,
  };

  let outboundMessageCounter = 0;

  const nextMessageId = (): string => {
    outboundMessageCounter += 1;
    return `${clientIdentity.clientId}-${now()}-${outboundMessageCounter}`;
  };

  const inferRecommendationCategory = (
    text: string,
  ): "slow-down" | "repeat" | "interact" | "quick-poll" => {
    const normalized = text.toLowerCase();
    if (normalized.includes("confusion") || normalized.includes("transition")) {
      return "slow-down";
    }
    if (normalized.includes("repeat") || normalized.includes("recap")) {
      return "repeat";
    }
    if (normalized.includes("poll") || normalized.includes("silent")) {
      return "quick-poll";
    }
    return "interact";
  };

  const publishDerived = (derived: OutboundDerivedSignals, cycleTimestamp: string): void => {
    const classPulseEnvelope = buildEnvelope({
      messageId: nextMessageId(),
      schemaVersion,
      source: "backend",
      payloadType: "class-pulse-snapshot",
      payload: derived.classPulseSnapshot,
    });

    config.onPublish(buildPublishPacket(topics.classPulse, classPulseEnvelope));

    const cognitiveMapEnvelope = buildEnvelope({
      messageId: nextMessageId(),
      schemaVersion,
      source: "backend",
      payloadType: "cognitive-map-snapshot",
      payload: derived.cognitiveMapSnapshot,
    });

    config.onPublish(buildPublishPacket(topics.cognitiveMap, cognitiveMapEnvelope));

    for (const nudge of derived.teacherNudges) {
      const nudgeEnvelope = buildEnvelope({
        messageId: nextMessageId(),
        schemaVersion,
        source: "backend",
        payloadType: "teacher-nudge",
        payload: nudge,
      });

      config.onPublish(buildPublishPacket(topics.teacherNudges, nudgeEnvelope));
    }

    const state = windowManager.snapshot();
    const sourceEngagementSignals = state.bufferedEvents.filter(
      (event): event is Extract<(typeof state.bufferedEvents)[number], { valueType: "engagement-score" }> =>
        event.valueType === "engagement-score",
    );
    const sourceFeedbackEvents = state.bufferedEvents.filter(
      (event): event is Extract<(typeof state.bufferedEvents)[number], { valueType: "feedback-type" }> =>
        event.valueType === "feedback-type",
    );
    const sourceStatusEvents = state.bufferedEvents.filter(
      (event): event is Extract<(typeof state.bufferedEvents)[number], { valueType: "student-status" }> =>
        event.valueType === "student-status",
    );

    safePersist(() => {
      historyStore.saveCycle({
        classId: config.classId,
        cycleTimestamp,
        classPulseSnapshot: derived.classPulseSnapshot,
        cognitiveMapSnapshot: derived.cognitiveMapSnapshot,
        teacherNudges: derived.teacherNudges,
        sourceEngagementSignals,
        sourceFeedbackEvents,
        sourceStatusEvents,
        cognitiveInsights: derived.cognitiveInsights,
        sessionId,
      });
    });

    for (const nudge of derived.teacherNudges) {
      const reason =
        derived.cognitiveInsights.find(
          (insight) => insight.category === inferRecommendationCategory(`${nudge.title} ${nudge.suggestion}`),
        )?.summary ??
        derived.cognitiveInsights[0]?.summary ??
        `Class pulse was ${derived.classPulseSnapshot.alertLevel} at recommendation time.`;

      safePersist(() => {
        historyStore.appendIntervention({
          classId: config.classId,
          sessionId,
          nudgeId: nudge.nudgeId,
          category: inferRecommendationCategory(`${nudge.title} ${nudge.suggestion}`),
          suggestion: nudge.suggestion,
          reason,
          timestamp: nudge.timestamp,
        });
      });
    }
  };

  const runCycleOnce = (): OutboundDerivedSignals => {
    const cycleInput = windowManager.buildCycleInput();
    const cycleOutput = runIntelligenceCycle({
      fusionInput: cycleInput,
      topicTransitions,
      expectedStudentIds: config.expectedStudentIds,
      ruleConfig: config.ruleConfig,
    });

    const derived: OutboundDerivedSignals = {
      classPulseSnapshot: cycleOutput.fusion.classPulseSnapshot,
      cognitiveMapSnapshot: cycleOutput.cognitiveMap.cognitiveMap,
      teacherNudges: cycleOutput.nudge.nudges,
      cognitiveInsights: cycleOutput.cognitiveMap.insights,
    };

    publishDerived(derived, cycleInput.cycleTimestamp);
    return derived;
  };

  const intervalHandle = setInterval(runCycleOnce, config.cycleIntervalMs);

  return {
    clientIdentity,
    topics,
    cycleIntervalMs: config.cycleIntervalMs,
    historyStore,
    handleInboundMqttEnvelope: (envelope) => {
      if (
        envelope.payload.valueType === "engagement-score" ||
        envelope.payload.valueType === "feedback-type" ||
        envelope.payload.valueType === "student-status" ||
        envelope.payload.valueType === "session-info"
      ) {
        const sourceEvent = envelope.payload;
        safePersist(() => {
          historyStore.appendSourceEvent(sourceEvent);
        });
      }

      windowManager.pushEnvelope(envelope);
    },
    runCycleOnce,
    dispose: () => {
      clearInterval(intervalHandle);
    },
  };
}
