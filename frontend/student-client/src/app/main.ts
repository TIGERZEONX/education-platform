import { bootstrapStudentClient } from "./bootstrap";
import { getInProcessMqttBroker } from "../../../../backend/services/realtime-messaging/src";

const broker = getInProcessMqttBroker();

let cameraCallCount = 0;

const context = bootstrapStudentClient({
  classId: "class-101",
  studentId: "aarav-sharma",
  studentName: "Aarav Sharma",
  sessionId: "class-101-live-session",
  clientId: "student-class-101-aarav-sharma",
  publishing: {
    studentEngagementIntervalMs: 5000,
    feedbackEventTrigger: "on-user-interaction",
    messageRequirements: {
      requireIdentifiers: true,
      requireTypedValue: true,
      requireTimestamp: true,
    },
  },
  onPublish: (packet) => {
    broker.publish(packet.topic, packet.payload);
    console.log("[student-client] outbound", packet.topic, packet.payload);
  },
  cameraAccessAdapter: {
    requestAccess: async () => {
      cameraCallCount += 1;
      return cameraCallCount === 1 ? "granted" : "granted";
    },
    stopCamera: () => {
      console.log("[student-client] camera stream stopped by student");
    },
  },
  feedbackMinIntervalMs: 1500,
});

context.confirmRealName("Aarav Sharma");
context.joinClassSession();
console.log("[student-client] camera help", context.camera.state().helpText);
console.log("[student-client] laptop view", context.buildLaptopFirstView());

context.requestCameraAccess().then((status) => {
  console.log("[student-client] camera status", status);

  context.publishVisualObservation({
    facePresent: true,
    headOrientationScore: 0.9,
    gazeFocusScore: 0.8,
    attentivenessScore: 0.85,
    confidence: 0.92,
  });

  context.publishVisualObservation({
    facePresent: false,
    headOrientationScore: 0.2,
    gazeFocusScore: 0.3,
    attentivenessScore: 0.25,
    confidence: 0.2,
  });

  context.turnCameraOffDuringSession();
  context.recoverCamera();
  console.log("[student-client] laptop view", context.buildLaptopFirstView());
});

context.publishFeedbackControl("confused");
context.publishFeedbackControl("confused");
context.publishFeedbackControl("repeat");

context.setConnectionHealth("unstable");
console.log("[student-client] laptop view", context.buildLaptopFirstView());
context.setConnectionHealth("healthy");

context.markTemporarilyDisconnected();
context.reconnectClassSession();
console.log("[student-client] laptop view", context.buildLaptopFirstView());

console.log("[student-client] bootstrap ready", context.clientIdentity, context.topics.classNamespace);
console.log("[student-client] event inventory", context.eventInventory());
