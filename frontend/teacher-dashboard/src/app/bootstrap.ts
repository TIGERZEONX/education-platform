import type {
  ClassPulseSnapshot,
  CognitiveMapSnapshot,
  MqttClientIdentity,
  MqttEnvelope,
  MqttPayload,
  TeacherNudge,
} from "../../../../shared/communication/mqtt/contracts";
import { buildTopicContracts } from "../../../../shared/communication/mqtt/topics";
import {
  consumeClassChannelPacket,
  consumeClassEnvelope,
} from "./realtime-consumer";
import {
  createInitialClassFirstViewModel,
  type TeacherClassFirstViewModel,
} from "./class-first-view";
import {
  buildTeacherDecisionSupportView,
  type TeacherClassDecisionSupportView,
  type TeacherHistoryReader,
} from "./decision-support-model";

export interface TeacherDashboardBootstrapConfig {
  classId: string;
  clientId: string;
  historyReader?: TeacherHistoryReader;
}

export interface TeacherDashboardBootstrapContext {
  clientIdentity: MqttClientIdentity;
  topics: ReturnType<typeof buildTopicContracts>;
  classWildcardSubscription: string;
  studentDrilldownSubscription: (studentId: string) => string;
  classFirstView: () => TeacherClassFirstViewModel;
  decisionSupportView: () => TeacherClassDecisionSupportView;
  flaggedStudentInspection: () => TeacherClassDecisionSupportView["flaggedStudentInspection"];
  sideHistoryAccess: () => TeacherClassDecisionSupportView["historySideAccess"];
  consumeRawMqttMessage: (topic: string, rawPayload: string) => TeacherClassFirstViewModel;
  consumeEnvelope: (topic: string, envelope: MqttEnvelope<MqttPayload>) => TeacherClassFirstViewModel;
  onClassPulse: (snapshot: ClassPulseSnapshot) => void;
  onCognitiveMap: (snapshot: CognitiveMapSnapshot) => void;
  onTeacherNudges: (nudges: TeacherNudge[]) => void;
}

export function bootstrapTeacherDashboard(
  config: TeacherDashboardBootstrapConfig,
): TeacherDashboardBootstrapContext {
  const topics = buildTopicContracts(config);
  const viewModel = createInitialClassFirstViewModel(config.classId);
  const telemetry = {
    pulsesReceived: 0,
    livePulses: 0,
    insufficientPulses: 0,
    stalePulses: 0,
    maxInterPulseGapMs: 0,
    lastPulseAtMs: 0,
  };
  const clientIdentity: MqttClientIdentity = {
    role: "teacher",
    clientId: config.clientId,
    classId: config.classId,
  };

  return {
    clientIdentity,
    topics,
    classWildcardSubscription: topics.classWildcard,
    studentDrilldownSubscription: (studentId) =>
      topics.studentWildcard.replace("{studentId}", studentId),
    classFirstView: () => viewModel,
    decisionSupportView: () => buildTeacherDecisionSupportView(viewModel, config.historyReader),
    flaggedStudentInspection: () =>
      buildTeacherDecisionSupportView(viewModel, config.historyReader).flaggedStudentInspection,
    sideHistoryAccess: () =>
      buildTeacherDecisionSupportView(viewModel, config.historyReader).historySideAccess,
    consumeRawMqttMessage: (topic, rawPayload) => {
      return consumeClassChannelPacket(viewModel, topic, rawPayload);
    },
    consumeEnvelope: (topic, envelope) => {
      return consumeClassEnvelope(viewModel, topic, envelope);
    },
    onClassPulse: (snapshot) => {
      const nowMs = Date.now();
      const pulseTimestampMs = Date.parse(snapshot.timestamp);
      const pulseAgeMs = Number.isFinite(pulseTimestampMs) ? Math.max(0, nowMs - pulseTimestampMs) : -1;
      telemetry.pulsesReceived += 1;
      if (snapshot.liveSignalState === "live") {
        telemetry.livePulses += 1;
      } else {
        telemetry.insufficientPulses += 1;
      }
      if (pulseAgeMs >= 15000) {
        telemetry.stalePulses += 1;
      }
      if (telemetry.lastPulseAtMs > 0) {
        telemetry.maxInterPulseGapMs = Math.max(telemetry.maxInterPulseGapMs, nowMs - telemetry.lastPulseAtMs);
      }
      telemetry.lastPulseAtMs = nowMs;

      if (telemetry.pulsesReceived % 5 === 0) {
        console.info("[teacher-live-freshness]", {
          classId: config.classId,
          pulsesReceived: telemetry.pulsesReceived,
          livePulses: telemetry.livePulses,
          insufficientPulses: telemetry.insufficientPulses,
          stalePulses: telemetry.stalePulses,
          lastPulseAgeMs: pulseAgeMs,
          maxInterPulseGapMs: telemetry.maxInterPulseGapMs,
        });
      }

      viewModel.classPulse = snapshot;
      viewModel.summary.liveClassPulse = snapshot.averageEngagement;
      viewModel.summary.activeStudentCount = snapshot.activeStudentCount;
      viewModel.summary.contributingStudentCount = snapshot.contributingStudentCount;
      viewModel.summary.missingSignalCount = snapshot.missingSignalCount;
      viewModel.summary.liveSignalState = snapshot.liveSignalState;
      viewModel.summary.alertLevel = snapshot.alertLevel;
      viewModel.lastUpdatedAt = snapshot.timestamp;
    },
    onCognitiveMap: (snapshot) => {
      viewModel.cognitiveMap = snapshot;
      viewModel.lastUpdatedAt = snapshot.timestamp;
    },
    onTeacherNudges: (nudges) => {
      viewModel.nudges = [...nudges, ...viewModel.nudges].slice(0, 8);
      viewModel.lastUpdatedAt = nudges[0]?.timestamp ?? viewModel.lastUpdatedAt;
    },
  };
}
