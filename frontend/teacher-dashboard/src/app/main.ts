import { bootstrapTeacherDashboard } from "./bootstrap";
import { getInProcessMqttBroker } from "../../../../backend/services/realtime-messaging/src";
import { startInProcessLiveBridge } from "../../../../backend/api/src/inprocess/live-bridge";

const broker = getInProcessMqttBroker();
const bridge = startInProcessLiveBridge({
  classId: "class-101",
  expectedStudentIds: ["aarav-sharma", "mia-chen", "noah-patel", "priya-iyer"],
  cycleIntervalMs: 4000,
});

const context = bootstrapTeacherDashboard({
  classId: "class-101",
  clientId: "teacher-class-101-dashboard",
  historyReader: {
    listRecentCycles: (classId, limit) => bridge.historyStore.listRecent(classId, limit),
    listRecentInterventions: (classId, limit) => bridge.historyStore.listInterventions(classId, limit),
    buildSessionSummary: (classId, sessionId) => bridge.historyStore.buildSessionSummary(classId, sessionId),
    buildSessionPlayback: (classId, sessionId, limit) =>
      bridge.historyStore.buildSessionPlayback(classId, sessionId, limit),
    listFlaggedStudentReview: (classId, sessionId, limit) =>
      bridge.historyStore.listFlaggedStudentReview(classId, sessionId, limit),
    listSessionDataCompletenessIssues: (classId, sessionId, limit) =>
      bridge.historyStore.listSessionDataCompletenessIssues(classId, sessionId, limit),
  },
});

broker.subscribe(context.classWildcardSubscription, (packet) => {
  context.consumeRawMqttMessage(packet.topic, packet.payload);
  const decision = context.decisionSupportView();
  console.log("[teacher-dashboard] decision-support view", decision);
});
