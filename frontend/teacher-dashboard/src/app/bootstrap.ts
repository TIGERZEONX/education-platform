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
      viewModel.classPulse = snapshot;
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
