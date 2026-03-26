import assert from "assert";
import { createCameraExperience } from "../../../frontend/student-client/src/vision/camera-experience";

let stopped = false;
const camera = createCameraExperience({
  requestAccess: async () => "denied",
  stopCamera: () => {
    stopped = true;
  },
});

assert.strictEqual(camera.state().operationalState, "permission-pending");

async function run(): Promise<void> {
  const state = await camera.requestCameraAccess();
  assert.strictEqual(state.operationalState, "camera-denied");
  assert.strictEqual(state.cameraStatus, "blocked");

  const off = camera.turnCameraOffDuringSession();
  assert.strictEqual(off.operationalState, "camera-turned-off");
  assert.strictEqual(stopped, true);
  console.log("[PASS] camera experience states");
}

run();
