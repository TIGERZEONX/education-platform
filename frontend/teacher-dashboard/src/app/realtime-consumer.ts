import type {
  ClassPulseSnapshot,
  CognitiveMapSnapshot,
  EngagementSignal,
  FeedbackEvent,
  MqttEnvelope,
  MqttPayload,
  StudentStatusEvent,
  TeacherNudge,
} from "../../../../shared/communication/mqtt/contracts";
import { parseIncomingPacket } from "../../../../backend/services/realtime-messaging/src";
import type { TeacherClassFirstViewModel } from "./class-first-view";

function upsertStudentActivity(
  viewModel: TeacherClassFirstViewModel,
  studentId: string,
  studentName: string,
  timestamp: string,
  patch: Partial<{ latestEngagement: number; latestStatus: string; latestFeedback: string }>,
): void {
  const existing = viewModel.studentActivityById[studentId] ?? {
    studentId,
    studentName,
    silentStudent: false,
    repeatedConfusionCount: 0,
    engagementHistory: [],
    feedbackHistory: [],
    statusHistory: [],
    updatedAt: timestamp,
  };

  const engagementHistory = patch.latestEngagement !== undefined
    ? [...existing.engagementHistory, patch.latestEngagement].slice(-8)
    : existing.engagementHistory;
  const feedbackHistory = patch.latestFeedback !== undefined
    ? [...existing.feedbackHistory, patch.latestFeedback].slice(-8)
    : existing.feedbackHistory;
  const statusHistory = patch.latestStatus !== undefined
    ? [...existing.statusHistory, patch.latestStatus].slice(-8)
    : existing.statusHistory;

  viewModel.studentActivityById[studentId] = {
    ...existing,
    studentName: studentName || existing.studentName,
    ...patch,
    engagementHistory,
    feedbackHistory,
    statusHistory,
    updatedAt: timestamp,
    silentStudent:
      patch.latestStatus === "disconnected" || patch.latestStatus === "idle"
        ? true
        : existing.silentStudent,
  };
}

export function consumeClassChannelPacket(
  viewModel: TeacherClassFirstViewModel,
  topic: string,
  rawPayload: string,
): TeacherClassFirstViewModel {
  const envelope = parseIncomingPacket(rawPayload);
  return consumeClassEnvelope(viewModel, topic, envelope);
}

export function consumeClassEnvelope(
  viewModel: TeacherClassFirstViewModel,
  _topic: string,
  envelope: MqttEnvelope<MqttPayload>,
): TeacherClassFirstViewModel {
  if (envelope.payloadType === "class-pulse-snapshot") {
    const payload = envelope.payload as ClassPulseSnapshot;
    viewModel.classPulse = payload;
    viewModel.summary.liveClassPulse = payload.averageEngagement;
    viewModel.summary.activeStudentCount = payload.activeStudentCount;
    viewModel.summary.alertLevel = payload.alertLevel;
    viewModel.lastUpdatedAt = payload.timestamp;
    return viewModel;
  }

  if (envelope.payloadType === "cognitive-map-snapshot") {
    const payload = envelope.payload as CognitiveMapSnapshot;
    viewModel.cognitiveMap = payload;
    viewModel.summary.confusionTrend =
      payload.trendDirection === "up" ? "rising" : payload.trendDirection === "down" ? "falling" : "stable";
    viewModel.summary.recentCognitiveInsight = payload.learningGapIndicators[0] ?? null;
    viewModel.lastUpdatedAt = payload.timestamp;
    return viewModel;
  }

  if (envelope.payloadType === "teacher-nudge") {
    const payload = envelope.payload as TeacherNudge;
    viewModel.nudges = [payload, ...viewModel.nudges].slice(0, 8);
    viewModel.summary.latestTeacherNudge = payload.suggestion;
    viewModel.lastUpdatedAt = payload.timestamp;
    return viewModel;
  }

  if (envelope.payloadType === "engagement-signal") {
    const payload = envelope.payload as EngagementSignal;
    upsertStudentActivity(
      viewModel,
      payload.studentId,
      payload.studentName ?? payload.studentId,
      payload.timestamp,
      {
      latestEngagement: payload.engagementScore,
      },
    );
    return viewModel;
  }

  if (envelope.payloadType === "student-status-event") {
    const payload = envelope.payload as StudentStatusEvent;
    upsertStudentActivity(
      viewModel,
      payload.studentId,
      payload.studentName,
      payload.timestamp,
      {
        latestStatus: payload.operationalState,
      },
    );
    return viewModel;
  }

  if (envelope.payloadType === "feedback-event") {
    const payload = envelope.payload as FeedbackEvent;
    upsertStudentActivity(
      viewModel,
      payload.studentId,
      payload.studentName ?? payload.studentId,
      payload.timestamp,
      {
        latestFeedback: payload.feedbackType,
      },
    );

    if (payload.feedbackType === "confused") {
      const entry = viewModel.studentActivityById[payload.studentId];
      if (entry) {
        entry.repeatedConfusionCount += 1;
      }
    }
  }

  return viewModel;
}
