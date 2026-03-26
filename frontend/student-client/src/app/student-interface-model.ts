import type { CameraExperienceState } from "../vision/camera-experience";
import type { EngagementSensingOutput } from "../vision/engagement-sensing-service";
import type { StudentRuntimeState } from "./student-runtime";
import type { StudentFallbackMode } from "../types/event-model";

export interface StudentLaptopFirstView {
  studentIdentity: string;
  sessionStatus: string;
  connectionState: string;
  cameraStatus: string;
  engagementTransparency: {
    score: number | null;
    signalQuality: string;
  };
  feedbackControls: Array<"confused" | "understood" | "repeat">;
  supportMessage: string;
  fallbackMode: StudentFallbackMode;
}

export function resolveFallbackMode(
  runtime: StudentRuntimeState,
  camera: CameraExperienceState,
): StudentFallbackMode {
  if (runtime.connectionHealth !== "healthy") {
    return {
      mode: "reconnect-fallback",
      reason: "Live connectivity is unstable. Feedback and status are buffered for replay.",
    };
  }

  if (camera.operationalState !== "camera-active") {
    return {
      mode: "camera-fallback",
      reason: "Camera is not active. Participation continues with feedback and status signals.",
    };
  }

  return {
    mode: "full-signals",
    reason: "Camera and connectivity are available. Full participation signals are active.",
  };
}

export function buildStudentLaptopFirstView(
  runtime: StudentRuntimeState,
  camera: CameraExperienceState,
  sensing: EngagementSensingOutput,
): StudentLaptopFirstView {
  return {
    studentIdentity: runtime.visibleStudentName,
    sessionStatus: runtime.sessionPhase,
    connectionState: runtime.connectionHealth,
    cameraStatus: camera.operationalState,
    engagementTransparency: {
      score: runtime.lastEngagementScore,
      signalQuality: sensing.signalQuality,
    },
    feedbackControls: ["confused", "understood", "repeat"],
    supportMessage:
      "CognitivePulse supports participation and helps teachers adapt quickly. It is designed for classroom support, not surveillance.",
    fallbackMode: resolveFallbackMode(runtime, camera),
  };
}
