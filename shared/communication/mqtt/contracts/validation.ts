import type {
  AlertLevel,
  ClassPulseSnapshot,
  CognitiveMapSnapshot,
  EngagementSignal,
  FeedbackEvent,
  FeedbackType,
  MqttEnvelope,
  MqttPayload,
  SessionInfoEvent,
  StudentOperationalState,
  StudentStatusEvent,
  TeacherNudge,
} from "./message-contracts";
import type {
  AlertThresholdConfig,
  MqttClientIdentity,
  RollingWindowConfig,
  StatelessCycleBehavior,
} from "./behavior-contracts";

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function isIsoTimestamp(input: unknown): input is string {
  if (!isNonEmptyString(input)) {
    return false;
  }

  return !Number.isNaN(Date.parse(input));
}

function isBetweenZeroAndOne(input: unknown): input is number {
  return typeof input === "number" && input >= 0 && input <= 1;
}

function isFeedbackType(input: unknown): input is FeedbackType {
  return input === "confused" || input === "repeat" || input === "understood";
}

function isAlertLevel(input: unknown): input is AlertLevel {
  return input === "green" || input === "yellow" || input === "red";
}

function isStudentOperationalState(input: unknown): input is StudentOperationalState {
  return (
    input === "active" ||
    input === "idle" ||
    input === "reconnecting" ||
    input === "disconnected" ||
    input === "camera-off"
  );
}

export function isEngagementSignal(input: unknown): input is EngagementSignal {
  if (!isRecord(input)) {
    return false;
  }

  return (
    isNonEmptyString(input.studentId) &&
    isNonEmptyString(input.classId) &&
    input.valueType === "engagement-score" &&
    isBetweenZeroAndOne(input.value) &&
    isBetweenZeroAndOne(input.engagementScore) &&
    input.value === input.engagementScore &&
    (input.cameraStatus === "active" ||
      input.cameraStatus === "blocked" ||
      input.cameraStatus === "unavailable") &&
    isIsoTimestamp(input.timestamp)
  );
}

export function isFeedbackEvent(input: unknown): input is FeedbackEvent {
  if (!isRecord(input)) {
    return false;
  }

  return (
    isNonEmptyString(input.studentId) &&
    isNonEmptyString(input.classId) &&
    input.valueType === "feedback-type" &&
    isFeedbackType(input.value) &&
    isFeedbackType(input.feedbackType) &&
    input.value === input.feedbackType &&
    isIsoTimestamp(input.timestamp)
  );
}

export function isStudentStatusEvent(input: unknown): input is StudentStatusEvent {
  if (!isRecord(input)) {
    return false;
  }

  return (
    isNonEmptyString(input.studentId) &&
    isNonEmptyString(input.studentName) &&
    isNonEmptyString(input.classId) &&
    input.valueType === "student-status" &&
    isStudentOperationalState(input.value) &&
    isStudentOperationalState(input.operationalState) &&
    input.value === input.operationalState &&
    (input.cameraStatus === "active" ||
      input.cameraStatus === "blocked" ||
      input.cameraStatus === "unavailable") &&
    isIsoTimestamp(input.timestamp)
  );
}

export function isSessionInfoEvent(input: unknown): input is SessionInfoEvent {
  if (!isRecord(input)) {
    return false;
  }

  const statusValid = input.status === "started" || input.status === "heartbeat" || input.status === "ended";

  return (
    isNonEmptyString(input.classId) &&
    isNonEmptyString(input.sessionId) &&
    input.valueType === "session-info" &&
    statusValid &&
    input.value === input.status &&
    isIsoTimestamp(input.timestamp)
  );
}

export function isClassPulseSnapshot(input: unknown): input is ClassPulseSnapshot {
  if (!isRecord(input)) {
    return false;
  }

  return (
    isNonEmptyString(input.classId) &&
    input.valueType === "class-pulse" &&
    isRecord(input.value) &&
    isBetweenZeroAndOne(input.value.averageEngagement) &&
    isBetweenZeroAndOne(input.value.confusionRate) &&
    typeof input.value.activeStudentCount === "number" &&
    input.value.activeStudentCount >= 0 &&
    Number.isInteger(input.value.activeStudentCount) &&
    isAlertLevel(input.value.alertLevel) &&
    isBetweenZeroAndOne(input.averageEngagement) &&
    isBetweenZeroAndOne(input.confusionRate) &&
    typeof input.activeStudentCount === "number" &&
    input.activeStudentCount >= 0 &&
    Number.isInteger(input.activeStudentCount) &&
    isAlertLevel(input.alertLevel) &&
    input.value.averageEngagement === input.averageEngagement &&
    input.value.confusionRate === input.confusionRate &&
    input.value.activeStudentCount === input.activeStudentCount &&
    input.value.alertLevel === input.alertLevel &&
    isIsoTimestamp(input.windowStart) &&
    isIsoTimestamp(input.windowEnd) &&
    isIsoTimestamp(input.timestamp) &&
    isIsoTimestamp(input.computedAt)
  );
}

export function isTeacherNudge(input: unknown): input is TeacherNudge {
  if (!isRecord(input)) {
    return false;
  }

  return (
    isNonEmptyString(input.classId) &&
    input.valueType === "teacher-nudge" &&
    isNonEmptyString(input.value) &&
    isAlertLevel(input.alertLevel) &&
    isNonEmptyString(input.nudgeId) &&
    isNonEmptyString(input.title) &&
    isNonEmptyString(input.suggestion) &&
    input.value === input.suggestion &&
    isIsoTimestamp(input.timestamp) &&
    isIsoTimestamp(input.generatedAt)
  );
}

export function isCognitiveMapSnapshot(input: unknown): input is CognitiveMapSnapshot {
  if (!isRecord(input)) {
    return false;
  }

  return (
    isNonEmptyString(input.classId) &&
    input.valueType === "cognitive-map" &&
    isRecord(input.value) &&
    Array.isArray(input.value.confusionZones) &&
    input.value.confusionZones.every(isNonEmptyString) &&
    Array.isArray(input.value.learningGapIndicators) &&
    input.value.learningGapIndicators.every(isNonEmptyString) &&
    (input.value.trendDirection === "up" ||
      input.value.trendDirection === "flat" ||
      input.value.trendDirection === "down") &&
    Array.isArray(input.confusionZones) &&
    input.confusionZones.every(isNonEmptyString) &&
    Array.isArray(input.learningGapIndicators) &&
    input.learningGapIndicators.every(isNonEmptyString) &&
    (input.trendDirection === "up" || input.trendDirection === "flat" || input.trendDirection === "down") &&
    input.value.trendDirection === input.trendDirection &&
    isIsoTimestamp(input.basedOnWindowStart) &&
    isIsoTimestamp(input.basedOnWindowEnd) &&
    isIsoTimestamp(input.timestamp) &&
    isIsoTimestamp(input.generatedAt)
  );
}

export function isMqttPayload(input: unknown): input is MqttPayload {
  return (
    isEngagementSignal(input) ||
    isFeedbackEvent(input) ||
    isStudentStatusEvent(input) ||
    isSessionInfoEvent(input) ||
    isClassPulseSnapshot(input) ||
    isTeacherNudge(input) ||
    isCognitiveMapSnapshot(input)
  );
}

function isPayloadType(input: unknown): input is MqttEnvelope<MqttPayload>["payloadType"] {
  return (
    input === "engagement-signal" ||
    input === "student-status-event" ||
    input === "feedback-event" ||
    input === "session-info-event" ||
    input === "class-pulse-snapshot" ||
    input === "teacher-nudge" ||
    input === "cognitive-map-snapshot"
  );
}

function isEnvelopeSource(input: unknown): input is MqttEnvelope<MqttPayload>["source"] {
  return input === "student-client" || input === "teacher-dashboard" || input === "backend";
}

function payloadMatchesType(payloadType: MqttEnvelope<MqttPayload>["payloadType"], payload: unknown): boolean {
  if (payloadType === "engagement-signal") {
    return isEngagementSignal(payload);
  }

  if (payloadType === "feedback-event") {
    return isFeedbackEvent(payload);
  }

  if (payloadType === "student-status-event") {
    return isStudentStatusEvent(payload);
  }

  if (payloadType === "session-info-event") {
    return isSessionInfoEvent(payload);
  }

  if (payloadType === "class-pulse-snapshot") {
    return isClassPulseSnapshot(payload);
  }

  if (payloadType === "teacher-nudge") {
    return isTeacherNudge(payload);
  }

  return isCognitiveMapSnapshot(payload);
}

export function isMqttEnvelope(input: unknown): input is MqttEnvelope<MqttPayload> {
  if (!isRecord(input)) {
    return false;
  }

  if (!isNonEmptyString(input.messageId)) {
    return false;
  }

  if (input.schemaVersion !== "1.0.0") {
    return false;
  }

  if (!isEnvelopeSource(input.source)) {
    return false;
  }

  if (!isPayloadType(input.payloadType)) {
    return false;
  }

  return payloadMatchesType(input.payloadType, input.payload);
}

export function assertMqttEnvelope(input: unknown): asserts input is MqttEnvelope<MqttPayload> {
  if (!isMqttEnvelope(input)) {
    throw new Error("Invalid MQTT envelope.");
  }
}

export function isMqttClientIdentity(input: unknown): input is MqttClientIdentity {
  if (!isRecord(input)) {
    return false;
  }

  const roleValid = input.role === "student" || input.role === "teacher" || input.role === "backend";
  const studentRuleValid =
    (input.role === "student" && isNonEmptyString(input.studentId)) ||
    (input.role !== "student" && (input.studentId === undefined || isNonEmptyString(input.studentId)));

  return roleValid && isNonEmptyString(input.clientId) && isNonEmptyString(input.classId) && studentRuleValid;
}

export function isRollingWindowConfig(input: unknown): input is RollingWindowConfig {
  if (!isRecord(input)) {
    return false;
  }

  return (
    typeof input.windowDurationMs === "number" &&
    input.windowDurationMs > 0 &&
    typeof input.activeStudentThresholdMs === "number" &&
    input.activeStudentThresholdMs > 0
  );
}

export function isAlertThresholdConfig(input: unknown): input is AlertThresholdConfig {
  if (!isRecord(input) || !isRecord(input.green) || !isRecord(input.yellow) || !isRecord(input.red)) {
    return false;
  }

  return (
    isBetweenZeroAndOne(input.green.minAverageEngagement) &&
    isBetweenZeroAndOne(input.green.maxConfusionRate) &&
    isBetweenZeroAndOne(input.yellow.minAverageEngagement) &&
    isBetweenZeroAndOne(input.yellow.maxConfusionRate) &&
    isBetweenZeroAndOne(input.red.maxAverageEngagement) &&
    isBetweenZeroAndOne(input.red.minConfusionRate)
  );
}

export function isStatelessCycleBehavior(input: unknown): input is StatelessCycleBehavior {
  if (!isRecord(input)) {
    return false;
  }

  return (
    input.statelessPerCycle === true &&
    input.dataSource === "current-rolling-window-only" &&
    input.nudgePriorityPolicy === "most-recent-trigger-wins"
  );
}
