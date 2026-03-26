import type {
  CognitiveRuleKind,
  TeacherNudgeCycleInput,
  TeacherNudgeCycleOutput,
  TeacherNudgeMappingRule,
} from "../../../../shared/communication/mqtt/contracts";
import { DEFAULT_NUDGE_RULES } from "../../../../shared/communication/mqtt/contracts";

function recommendationForRule(
  kind: CognitiveRuleKind,
  rules: TeacherNudgeMappingRule[],
): string {
  return (
    rules.find((rule) => rule.kind === kind)?.recommendation ??
    "Use adaptive teaching support based on current class signals."
  );
}

function titleForRule(kind: CognitiveRuleKind): string {
  if (kind === "confusion-spike-topic-transition") {
    return "Confusion Spike Near Topic Transition";
  }

  if (kind === "sustained-engagement-decline") {
    return "Sustained Engagement Decline";
  }

  return "Silent Student Pattern";
}

function alertLevelForRule(kind: CognitiveRuleKind): "green" | "yellow" | "red" {
  if (kind === "confusion-spike-topic-transition") {
    return "red";
  }

  if (kind === "sustained-engagement-decline") {
    return "yellow";
  }

  return "yellow";
}

export function runTeacherNudgeCycle(
  input: TeacherNudgeCycleInput,
  rules: TeacherNudgeMappingRule[] = DEFAULT_NUDGE_RULES,
): TeacherNudgeCycleOutput {
  const orderedTriggers = [...input.triggers].sort(
    (a, b) => Date.parse(b.triggeredAt) - Date.parse(a.triggeredAt),
  );

  const primary = orderedTriggers[0]?.kind ?? null;

  const nudges = orderedTriggers.map((trigger, index) => ({
    classId: input.classId,
    valueType: "teacher-nudge" as const,
    value: recommendationForRule(trigger.kind, rules),
    alertLevel: alertLevelForRule(trigger.kind),
    nudgeId: `nudge-${Date.parse(input.cycleTimestamp)}-${index}`,
    title: titleForRule(trigger.kind),
    suggestion: recommendationForRule(trigger.kind, rules),
    timestamp: input.cycleTimestamp,
    generatedAt: input.cycleTimestamp,
  }));

  return {
    nudges,
    selectedPrimaryRule: primary,
  };
}
