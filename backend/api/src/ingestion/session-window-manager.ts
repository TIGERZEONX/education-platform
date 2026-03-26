import type {
  DataFusionCycleInput,
  EngagementSignal,
  FeedbackEvent,
  MqttEnvelope,
  MqttPayload,
  RollingWindowConfig,
  StudentStatusEvent,
} from "../../../../shared/communication/mqtt/contracts";

type SignalEvent = EngagementSignal | FeedbackEvent | StudentStatusEvent;

export interface SessionWindowManagerConfig {
  classId: string;
  expectedStudentIds: string[];
  cycleIntervalMs: number;
  windowConfig: RollingWindowConfig;
  now?: () => number;
}

export interface SessionWindowManagerState {
  classId: string;
  expectedStudentIds: string[];
  cycleIntervalMs: number;
  windowConfig: RollingWindowConfig;
  bufferedEvents: SignalEvent[];
}

export class SessionWindowManager {
  private readonly config: SessionWindowManagerConfig;

  private readonly now: () => number;

  private readonly events: SignalEvent[] = [];

  constructor(config: SessionWindowManagerConfig) {
    this.config = config;
    this.now = config.now ?? (() => Date.now());
  }

  pushEnvelope(envelope: MqttEnvelope<MqttPayload>): void {
    if (
      envelope.payload.valueType !== "engagement-score" &&
      envelope.payload.valueType !== "feedback-type" &&
      envelope.payload.valueType !== "student-status"
    ) {
      return;
    }

    this.events.push(envelope.payload as SignalEvent);
    this.pruneOldEvents();
  }

  buildCycleInput(atMs: number = this.now()): DataFusionCycleInput {
    this.pruneOldEvents(atMs);

    return {
      classId: this.config.classId,
      cycleTimestamp: new Date(atMs).toISOString(),
      windowConfig: this.config.windowConfig,
      events: [...this.events],
    };
  }

  snapshot(): SessionWindowManagerState {
    return {
      classId: this.config.classId,
      expectedStudentIds: [...this.config.expectedStudentIds],
      cycleIntervalMs: this.config.cycleIntervalMs,
      windowConfig: this.config.windowConfig,
      bufferedEvents: [...this.events],
    };
  }

  private pruneOldEvents(atMs: number = this.now()): void {
    const cutoff = atMs - this.config.windowConfig.windowDurationMs;
    const kept = this.events.filter((event) => Date.parse(event.timestamp) >= cutoff);
    this.events.length = 0;
    this.events.push(...kept);
  }
}
