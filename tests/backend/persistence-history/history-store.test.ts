import assert from "assert";
import { InMemoryHistoryStore } from "../../../backend/services/persistence-history/src";
import { test } from "../test-harness";

test("history store keeps most recent records first", () => {
  const store = new InMemoryHistoryStore();

  const baseRecord = {
    classId: "class-101",
    classPulseSnapshot: {
      classId: "class-101",
      valueType: "class-pulse" as const,
      value: {
        averageEngagement: 0.7,
        confusionRate: 0.1,
        activeStudentCount: 3,
        alertLevel: "green" as const,
      },
      averageEngagement: 0.7,
      confusionRate: 0.1,
      activeStudentCount: 3,
      alertLevel: "green" as const,
      windowStart: "2026-03-25T09:58:00.000Z",
      windowEnd: "2026-03-25T09:59:00.000Z",
      timestamp: "2026-03-25T09:59:00.000Z",
      computedAt: "2026-03-25T09:59:00.000Z",
    },
    cognitiveMapSnapshot: {
      classId: "class-101",
      valueType: "cognitive-map" as const,
      value: {
        confusionZones: [],
        learningGapIndicators: [],
        trendDirection: "flat" as const,
      },
      confusionZones: [],
      learningGapIndicators: [],
      trendDirection: "flat" as const,
      basedOnWindowStart: "2026-03-25T09:58:00.000Z",
      basedOnWindowEnd: "2026-03-25T09:59:00.000Z",
      timestamp: "2026-03-25T09:59:00.000Z",
      generatedAt: "2026-03-25T09:59:00.000Z",
    },
    teacherNudges: [],
    sourceEngagementSignals: [],
    sourceFeedbackEvents: [],
  };

  store.saveCycle({ ...baseRecord, cycleTimestamp: "2026-03-25T09:59:00.000Z" });
  store.saveCycle({ ...baseRecord, cycleTimestamp: "2026-03-25T10:00:00.000Z" });

  const recent = store.listRecent("class-101", 2);
  assert.strictEqual(recent.length, 2);
  assert.strictEqual(recent[0].cycleTimestamp, "2026-03-25T10:00:00.000Z");
});

test("history store tracks session lifecycle, manual markers, and coherent session narrative", () => {
  const store = new InMemoryHistoryStore();

  store.startSession({
    classId: "class-101",
    sessionId: "class-101-live",
    startedAt: "2026-03-25T09:00:00.000Z",
    teacherClientId: "teacher-class-101-dashboard",
  });
  store.markSessionLive("class-101", "class-101-live", "2026-03-25T09:00:01.000Z");

  store.appendSourceEvent({
    studentId: "aarav-sharma",
    studentName: "Aarav Sharma",
    classId: "class-101",
    valueType: "student-status",
    value: "active",
    operationalState: "active",
    cameraStatus: "active",
    timestamp: "2026-03-25T09:05:00.000Z",
  });

  store.addManualMarker({
    classId: "class-101",
    sessionId: "class-101-live",
    markerId: "m1",
    markerType: "new-topic-started",
    title: "Started Fractions",
    timestamp: "2026-03-25T09:10:00.000Z",
  });

  store.addManualMarker({
    classId: "class-101",
    sessionId: "class-101-live",
    markerId: "m2",
    markerType: "recap-moment",
    title: "Recap after confusion",
    timestamp: "2026-03-25T09:20:00.000Z",
  });

  const baseCycle = {
    classId: "class-101",
    sessionId: "class-101-live",
    classPulseSnapshot: {
      classId: "class-101",
      valueType: "class-pulse" as const,
      value: {
        averageEngagement: 0.62,
        confusionRate: 0.22,
        activeStudentCount: 21,
        alertLevel: "yellow" as const,
      },
      averageEngagement: 0.62,
      confusionRate: 0.22,
      activeStudentCount: 21,
      alertLevel: "yellow" as const,
      windowStart: "2026-03-25T09:08:00.000Z",
      windowEnd: "2026-03-25T09:10:00.000Z",
      timestamp: "2026-03-25T09:10:00.000Z",
      computedAt: "2026-03-25T09:10:00.000Z",
    },
    cognitiveMapSnapshot: {
      classId: "class-101",
      valueType: "cognitive-map" as const,
      value: {
        confusionZones: ["Transition confusion"],
        learningGapIndicators: ["Confusion cluster near new topic"],
        trendDirection: "down" as const,
      },
      confusionZones: ["Transition confusion"],
      learningGapIndicators: ["Confusion cluster near new topic"],
      trendDirection: "down" as const,
      basedOnWindowStart: "2026-03-25T09:08:00.000Z",
      basedOnWindowEnd: "2026-03-25T09:10:00.000Z",
      timestamp: "2026-03-25T09:10:00.000Z",
      generatedAt: "2026-03-25T09:10:00.000Z",
    },
    teacherNudges: [],
    sourceEngagementSignals: [],
    sourceFeedbackEvents: [],
    cognitiveInsights: [
      {
        severity: "yellow" as const,
        summary: "Confusion cluster near transition",
        category: "slow-down" as const,
        studentReferences: ["Aarav Sharma"],
      },
    ],
  };

  store.saveCycle({
    ...baseCycle,
    cycleTimestamp: "2026-03-25T09:10:00.000Z",
  });

  store.appendIntervention({
    classId: "class-101",
    sessionId: "class-101-live",
    nudgeId: "n1",
    category: "slow-down",
    suggestion: "Slow down and recap fractions.",
    reason: "Confusion cluster near transition",
    timestamp: "2026-03-25T09:12:00.000Z",
  });

  const session = store.getSessionRecord("class-101", "class-101-live");
  assert.ok(session);
  assert.strictEqual(session?.lifecycleState, "live");
  assert.ok(session?.participants.includes("aarav-sharma"));

  const markers = store.listManualMarkers("class-101", "class-101-live", 10);
  assert.strictEqual(markers.length, 2);
  assert.strictEqual(markers[0].markerId, "m2");

  const narrative = store.listSessionNarrative("class-101", "class-101-live", 20);
  assert.ok(narrative.length >= 4);
  assert.ok(narrative.some((item) => item.kind === "manual-marker"));
  assert.ok(narrative.some((item) => item.kind === "class-pulse"));
  assert.ok(narrative.some((item) => item.kind === "teacher-recommendation"));

  const derived = store.listSessionDerivedRecords("class-101", "class-101-live", 20);
  assert.ok(derived.some((entry) => entry.kind === "class-pulse-snapshot"));
  assert.ok(derived.some((entry) => entry.kind === "cognitive-insight-event"));
  assert.ok(derived.some((entry) => entry.kind === "teacher-recommendation-event"));

  const summary = store.buildSessionSummary("class-101", "class-101-live");
  assert.ok(summary);
  assert.strictEqual(summary?.classId, "class-101");
  assert.ok(summary?.suggestedInterventions.length);

  const playback = store.buildSessionPlayback("class-101", "class-101-live", 20);
  assert.ok(playback.length >= 1);
  assert.ok(playback.some((step) => step.manualMarkers.length > 0));

  const flagged = store.listFlaggedStudentReview("class-101", "class-101-live", 20);
  assert.ok(flagged.length >= 0);

  store.endSession("class-101", "class-101-live", "2026-03-25T10:00:00.000Z");
  store.markSessionReviewReady("class-101", "class-101-live", "2026-03-25T10:00:10.000Z");

  const ended = store.getSessionRecord("class-101", "class-101-live");
  assert.strictEqual(ended?.lifecycleState, "review-ready");
});
