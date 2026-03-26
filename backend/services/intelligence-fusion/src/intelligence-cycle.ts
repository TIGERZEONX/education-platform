import type {
  AlertThresholdConfig,
  CognitiveMapCycleOutput,
  DataFusionCycleInput,
  DataFusionCycleOutput,
  TeacherNudgeCycleOutput,
} from "../../../../shared/communication/mqtt/contracts";
import { DEFAULT_ALERT_THRESHOLDS } from "../../../../shared/communication/mqtt/contracts";
import {
  runCognitiveMapCycle,
  type CognitiveMapRuntimeInput,
  type CognitiveRuleConfig,
  type TopicTransitionMarker,
} from "./cognitive-map-engine";
import { runDataFusionCycle } from "./data-fusion-engine";
import { runTeacherNudgeCycle } from "./teacher-nudge-engine";

export interface IntelligenceCycleInput {
  fusionInput: DataFusionCycleInput;
  topicTransitions: TopicTransitionMarker[];
  expectedStudentIds: string[];
  ruleConfig: CognitiveRuleConfig;
  alertThresholds?: AlertThresholdConfig;
}

export interface IntelligenceCycleOutput {
  fusion: DataFusionCycleOutput;
  cognitiveMap: CognitiveMapCycleOutput;
  nudge: TeacherNudgeCycleOutput;
}

export function runIntelligenceCycle(input: IntelligenceCycleInput): IntelligenceCycleOutput {
  const fusion = runDataFusionCycle(
    input.fusionInput,
    input.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS,
  );

  const cognitiveInput: CognitiveMapRuntimeInput = {
    classId: input.fusionInput.classId,
    cycleTimestamp: input.fusionInput.cycleTimestamp,
    classPulseWindow: [fusion.classPulseSnapshot],
    engagementWindow: input.fusionInput.events.filter(
      (event) => event.valueType === "engagement-score",
    ),
    feedbackWindow: input.fusionInput.events.filter(
      (event) => event.valueType === "feedback-type",
    ),
    statusWindow: input.fusionInput.events.filter(
      (event) => event.valueType === "student-status",
    ),
    activeStudents: fusion.derived.activeStudents,
    fusedClassState: fusion.derived.unifiedClassState,
    topicTransitions: input.topicTransitions,
    expectedStudentIds: input.expectedStudentIds,
    ruleConfig: input.ruleConfig,
  };

  const cognitiveMap = runCognitiveMapCycle(cognitiveInput);
  const nudge = runTeacherNudgeCycle({
    classId: input.fusionInput.classId,
    cycleTimestamp: input.fusionInput.cycleTimestamp,
    triggers: cognitiveMap.triggers,
  });

  return {
    fusion,
    cognitiveMap,
    nudge,
  };
}
