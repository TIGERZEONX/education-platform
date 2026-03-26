import type {
  MqttClientIdentity,
  MqttEnvelope,
  MqttPayload,
} from "../../../../shared/communication/mqtt/contracts";
import { assertMqttEnvelope } from "../../../../shared/communication/mqtt/contracts";
import {
  deserializeEnvelope,
  serializeEnvelope,
} from "../../../../shared/communication/mqtt/serializers";
import {
  topicForClassNamespace,
  topicForClassPulse,
  topicForCognitiveMap,
  topicForFeedback,
  topicForSessionInfo,
  topicForStudentEngagement,
  topicForStudentStatus,
  topicForStudentWildcard,
  topicForTeacherNudges,
} from "../../../../shared/communication/mqtt/topics";

export interface RuntimeIdentity {
  clientId: string;
  role: MqttClientIdentity["role"];
  classId: string;
}

export interface PublishPacket {
  topic: string;
  payload: string;
}

export interface SubscribePlan {
  topics: string[];
}

export interface DashboardSubscribePlans {
  classFirst: SubscribePlan;
  studentDrilldown: (studentId: string) => SubscribePlan;
}

export interface EnvelopeBuildInput {
  messageId: string;
  schemaVersion: "1.0.0";
  source: MqttEnvelope<MqttPayload>["source"];
  payloadType: MqttEnvelope<MqttPayload>["payloadType"];
  payload: MqttPayload;
}

export function createRuntimeIdentity(
  role: MqttClientIdentity["role"],
  classId: string,
  actorId: string,
): RuntimeIdentity {
  return {
    role,
    classId,
    clientId: `${role}-${classId}-${actorId}`,
  };
}

export function buildEnvelope(input: EnvelopeBuildInput): MqttEnvelope<MqttPayload> {
  const envelope: MqttEnvelope<MqttPayload> = {
    messageId: input.messageId,
    schemaVersion: input.schemaVersion,
    source: input.source,
    payloadType: input.payloadType,
    payload: input.payload,
  };

  assertMqttEnvelope(envelope);
  return envelope;
}

export function buildPublishPacket(topic: string, envelope: MqttEnvelope<MqttPayload>): PublishPacket {
  return {
    topic,
    payload: serializeEnvelope(envelope),
  };
}

export function parseIncomingPacket(rawPayload: string): MqttEnvelope<MqttPayload> {
  return deserializeEnvelope(rawPayload);
}

export function studentPublishTopics(classId: string): string[] {
  return [
    topicForStudentEngagement({ classId, studentId: "{studentId}" }),
    topicForStudentStatus({ classId, studentId: "{studentId}" }),
    topicForFeedback({ classId }, "confused"),
    topicForFeedback({ classId }, "repeat"),
    topicForFeedback({ classId }, "understood"),
    topicForSessionInfo({ classId }),
  ];
}

export function teacherSubscribePlan(classId: string): SubscribePlan {
  return {
    topics: [
      topicForClassPulse({ classId }),
      topicForCognitiveMap({ classId }),
      topicForTeacherNudges({ classId }),
      topicForSessionInfo({ classId }),
    ],
  };
}

export function dashboardSubscribePlans(classId: string): DashboardSubscribePlans {
  return {
    classFirst: {
      topics: [
        `${topicForClassNamespace({ classId })}/#`,
      ],
    },
    studentDrilldown: (studentId: string) => ({
      topics: [topicForStudentWildcard({ classId, studentId })],
    }),
  };
}
