import type { CameraStatus } from "../../../../shared/communication/mqtt/contracts";

export type CameraAccessResult = "granted" | "denied" | "unavailable";

export type CameraOperationalState =
  | "permission-pending"
  | "camera-active"
  | "camera-unavailable"
  | "camera-denied"
  | "camera-turned-off";

export interface CameraAccessAdapter {
  requestAccess: () => Promise<CameraAccessResult>;
  stopCamera: () => void;
}

export interface CameraExperienceState {
  operationalState: CameraOperationalState;
  cameraStatus: CameraStatus;
  helpText: string;
}

export interface CameraExperience {
  state: () => CameraExperienceState;
  requestCameraAccess: () => Promise<CameraExperienceState>;
  turnCameraOffDuringSession: () => CameraExperienceState;
  recoverCamera: () => Promise<CameraExperienceState>;
}

const HELP_TEXT =
  "Camera is used only to derive engagement cues such as face presence, gaze focus, and head orientation. Participation still works without camera.";

export function createCameraExperience(adapter: CameraAccessAdapter): CameraExperience {
  let state: CameraExperienceState = {
    operationalState: "permission-pending",
    cameraStatus: "unavailable",
    helpText: HELP_TEXT,
  };

  const setFromResult = (result: CameraAccessResult): CameraExperienceState => {
    if (result === "granted") {
      state = {
        operationalState: "camera-active",
        cameraStatus: "active",
        helpText: HELP_TEXT,
      };
      return state;
    }

    if (result === "denied") {
      state = {
        operationalState: "camera-denied",
        cameraStatus: "blocked",
        helpText: HELP_TEXT,
      };
      return state;
    }

    state = {
      operationalState: "camera-unavailable",
      cameraStatus: "unavailable",
      helpText: HELP_TEXT,
    };
    return state;
  };

  return {
    state: () => state,
    requestCameraAccess: async () => {
      const result = await adapter.requestAccess();
      return setFromResult(result);
    },
    turnCameraOffDuringSession: () => {
      adapter.stopCamera();
      state = {
        operationalState: "camera-turned-off",
        cameraStatus: "unavailable",
        helpText: HELP_TEXT,
      };
      return state;
    },
    recoverCamera: async () => {
      const result = await adapter.requestAccess();
      return setFromResult(result);
    },
  };
}
