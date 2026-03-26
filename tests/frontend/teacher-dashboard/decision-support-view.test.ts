import assert from "assert";
import { buildTeacherDecisionSupportView } from "../../../frontend/teacher-dashboard/src/app/decision-support-model";
import { createInitialClassFirstViewModel } from "../../../frontend/teacher-dashboard/src/app/class-first-view";

const viewModel = createInitialClassFirstViewModel("class-101");
viewModel.summary.liveClassPulse = 0.58;
viewModel.summary.activeStudentCount = 24;
viewModel.summary.alertLevel = "yellow";
viewModel.summary.confusionTrend = "rising";
viewModel.summary.recentCognitiveInsight = "Confusion cluster near topic transition.";
viewModel.summary.latestTeacherNudge = "Run a quick poll before moving on.";
viewModel.lastUpdatedAt = "2026-03-25T10:00:00.000Z";
viewModel.studentActivityById["aarav-sharma"] = {
  studentId: "aarav-sharma",
  studentName: "Aarav Sharma",
  latestEngagement: 0.35,
  latestStatus: "active",
  latestFeedback: "confused",
  silentStudent: false,
  repeatedConfusionCount: 2,
  engagementHistory: [0.52, 0.45, 0.35],
  feedbackHistory: ["confused", "repeat", "confused"],
  statusHistory: ["active", "active", "active"],
  updatedAt: "2026-03-25T10:00:00.000Z",
};

const decision = buildTeacherDecisionSupportView(viewModel, {
  listRecentCycles: () => [
    {
      classId: "class-101",
      cycleTimestamp: "2026-03-25T09:56:00.000Z",
      classPulseSnapshot: {
        classId: "class-101",
        valueType: "class-pulse",
        value: {
          averageEngagement: 0.52,
          confusionRate: 0.28,
          activeStudentCount: 24,
          alertLevel: "yellow",
        },
        averageEngagement: 0.52,
        confusionRate: 0.28,
        activeStudentCount: 24,
        alertLevel: "yellow",
        windowStart: "2026-03-25T09:54:00.000Z",
        windowEnd: "2026-03-25T09:56:00.000Z",
        timestamp: "2026-03-25T09:56:00.000Z",
        computedAt: "2026-03-25T09:56:00.000Z",
      },
      cognitiveMapSnapshot: {
        classId: "class-101",
        valueType: "cognitive-map",
        value: {
          confusionZones: ["transition cluster"],
          learningGapIndicators: ["Confusion cluster near topic transition."],
          trendDirection: "down",
        },
        confusionZones: ["transition cluster"],
        learningGapIndicators: ["Confusion cluster near topic transition."],
        trendDirection: "down",
        basedOnWindowStart: "2026-03-25T09:54:00.000Z",
        basedOnWindowEnd: "2026-03-25T09:56:00.000Z",
        timestamp: "2026-03-25T09:56:00.000Z",
        generatedAt: "2026-03-25T09:56:00.000Z",
      },
      teacherNudges: [],
      sourceEngagementSignals: [],
      sourceFeedbackEvents: [],
    },
    {
      classId: "class-101",
      cycleTimestamp: "2026-03-25T10:00:00.000Z",
      classPulseSnapshot: {
        classId: "class-101",
        valueType: "class-pulse",
        value: {
          averageEngagement: 0.58,
          confusionRate: 0.2,
          activeStudentCount: 24,
          alertLevel: "yellow",
        },
        averageEngagement: 0.58,
        confusionRate: 0.2,
        activeStudentCount: 24,
        alertLevel: "yellow",
        windowStart: "2026-03-25T09:58:00.000Z",
        windowEnd: "2026-03-25T10:00:00.000Z",
        timestamp: "2026-03-25T10:00:00.000Z",
        computedAt: "2026-03-25T10:00:00.000Z",
      },
      cognitiveMapSnapshot: {
        classId: "class-101",
        valueType: "cognitive-map",
        value: {
          confusionZones: ["transition cluster"],
          learningGapIndicators: ["Recovery after interaction."],
          trendDirection: "up",
        },
        confusionZones: ["transition cluster"],
        learningGapIndicators: ["Recovery after interaction."],
        trendDirection: "up",
        basedOnWindowStart: "2026-03-25T09:58:00.000Z",
        basedOnWindowEnd: "2026-03-25T10:00:00.000Z",
        timestamp: "2026-03-25T10:00:00.000Z",
        generatedAt: "2026-03-25T10:00:00.000Z",
      },
      teacherNudges: [],
      sourceEngagementSignals: [],
      sourceFeedbackEvents: [],
    },
  ],
  listRecentInterventions: () => [],
});

assert.strictEqual(decision.classPulse.activeStudentCount, 24);
assert.strictEqual(decision.alerting.severity, "yellow");
assert.ok(decision.flaggedStudentInspection.length >= 1);
assert.ok(decision.teacherRecommendations.length >= 1);
assert.ok(decision.trendArea.engagementSeries.length >= 1);
assert.ok(decision.teacherActionArea.immediateRecommendations.length >= 1);

console.log("[PASS] teacher decision support view model");
