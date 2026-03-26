import assert from "assert";
import { createFeedbackController } from "../../../frontend/student-client/src/feedback/feedback-controls";

const controller = createFeedbackController({
  minIntervalMs: 1000,
  burstWindowMs: 5000,
  burstLimit: 2,
});

const first = controller.trigger("confused", 1000);
assert.strictEqual(first.accepted, true);

const second = controller.trigger("confused", 1500);
assert.strictEqual(second.accepted, false);
assert.strictEqual(second.reason, "cooldown");

const third = controller.trigger("repeat", 2200);
assert.strictEqual(third.accepted, true);

const fourth = controller.trigger("understood", 2600);
assert.strictEqual(fourth.accepted, false);
assert.strictEqual(fourth.reason, "burst-protection");

console.log("[PASS] feedback controls rapid-trigger protection");
