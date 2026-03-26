import { parseIncomingPacket, getInProcessMqttBroker } from "../../../services/realtime-messaging/src";
import { InMemoryHistoryStore, type HistoryStore } from "../../../services/persistence-history/src";
import { bootstrapRealtimeIngestion } from "../ingestion/bootstrap";

export interface InProcessLiveBridgeConfig {
  classId: string;
  expectedStudentIds: string[];
  cycleIntervalMs: number;
  historyStore?: HistoryStore;
}

export interface InProcessLiveBridge {
  historyStore: HistoryStore;
  dispose: () => void;
}

import fs from "fs";
const LOG_FILE = "C:\\Users\\gautham jai\\Desktop\\cognative-smart-engagement\\student-eng-tracking\\education-platform\\server_debug.log";
function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] [bridge] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
}

export function startInProcessLiveBridge(config: InProcessLiveBridgeConfig): InProcessLiveBridge {
  const broker = getInProcessMqttBroker();
  const historyStore = config.historyStore ?? new InMemoryHistoryStore();
  const sessionId = `${config.classId}-live`;

  logToFile(`Starting bridge for ${config.classId}`);

  historyStore.startSession({
    classId: config.classId,
    sessionId,
    startedAt: new Date().toISOString(),
    teacherClientId: `teacher-${config.classId}`,
  });
  historyStore.markSessionLive(config.classId, sessionId, new Date().toISOString());

  const ingestion = bootstrapRealtimeIngestion({
    classId: config.classId,
    clientId: `backend-${config.classId}-ingest`,
    expectedStudentIds: config.expectedStudentIds,
    cycleIntervalMs: config.cycleIntervalMs,
    windowConfig: {
      windowDurationMs: 120000,
      activeStudentThresholdMs: 30000,
    },
    ruleConfig: {
      confusionSpikeNearTransitionWindowMs: 15000,
      sustainedDeclineSubIntervals: 3,
      silentStudentThresholdMs: 45000,
    },
    onPublish: (packet) => {
      broker.publish(packet.topic, packet.payload);
    },
    historyStore,
    topicTransitions: [],
  });

  const unsubscribe = broker.subscribe(ingestion.topics.classWildcard, (packet) => {
    try {
      const envelope = parseIncomingPacket(packet.payload);
      
      if (envelope.payloadType === "class-pulse-snapshot") {
        const pulse = envelope.payload as any;
        logToFile(`PULSE: active=${pulse.activeStudentCount}, avgEng=${pulse.averageEngagement.toFixed(2)}`);
      } else {
        logToFile(`Recv: ${packet.topic} from ${envelope.source} (type: ${envelope.payloadType})`);
      }

      if (envelope.source === "student-client") {
        ingestion.handleInboundMqttEnvelope(envelope);
        logToFile(`-> Accepted ${(envelope.payload as any).studentId} signal`);
      }
    } catch (e) {
      logToFile(`Error processing packet: ${e}`);
    }
  });

  return {
    historyStore,
    dispose: () => {
      unsubscribe();
      ingestion.dispose();
      historyStore.endSession(config.classId, sessionId, new Date().toISOString());
      historyStore.markSessionReviewReady(config.classId, sessionId, new Date().toISOString());
    },
  };
}
