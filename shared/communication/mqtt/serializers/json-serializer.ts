import type { MqttEnvelope, MqttPayload } from "../contracts";
import { assertMqttEnvelope } from "../contracts";

export function serializeEnvelope(envelope: MqttEnvelope<MqttPayload>): string {
  assertMqttEnvelope(envelope);
  return JSON.stringify(envelope);
}

export function deserializeEnvelope(raw: string): MqttEnvelope<MqttPayload> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error("Invalid MQTT payload JSON.");
  }

  assertMqttEnvelope(parsed);
  return parsed;
}
