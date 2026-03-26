import type {
  ClassPulseSnapshot,
  CognitiveMapSnapshot,
  EngagementSignal,
  FeedbackEvent,
  SessionInfoEvent,
  StudentStatusEvent,
  TeacherNudge,
} from "../../../../shared/communication/mqtt/contracts";
import type { CognitiveInsight } from "../../../../shared/communication/mqtt/contracts";

export type SessionLifecycleState = "created" | "live" | "ended" | "review-ready";

export interface SessionMetadata {
  classId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  teacherClientId?: string;
}

export interface SessionRecord {
  classId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  teacherClientId?: string;
  lifecycleState: SessionLifecycleState;
  participants: string[];
  createdAt: string;
  updatedAt: string;
}

export type TeachingMomentType =
  | "new-topic-started"
  | "important-explanation"
  | "recap-moment"
  | "teacher-note";

export interface ManualTeachingMarker {
  classId: string;
  sessionId: string;
  markerId: string;
  markerType: TeachingMomentType;
  title: string;
  detail?: string;
  timestamp: string;
}

export interface TeacherInterventionRecord {
  classId: string;
  sessionId: string;
  nudgeId: string;
  category: "slow-down" | "repeat" | "interact" | "quick-poll";
  suggestion: string;
  reason: string;
  timestamp: string;
}

export type SourceEvent = EngagementSignal | FeedbackEvent | StudentStatusEvent | SessionInfoEvent;

export type DerivedRecordKind =
  | "class-pulse-snapshot"
  | "cognitive-insight-event"
  | "teacher-recommendation-event";

export interface DerivedRecord {
  classId: string;
  sessionId: string;
  timestamp: string;
  kind: DerivedRecordKind;
  summary: string;
  alertLevel?: "green" | "yellow" | "red";
  recommendationCategory?: "slow-down" | "repeat" | "interact" | "quick-poll";
  recommendationReason?: string;
  studentReferences?: string[];
}

export type DataCompletenessIssueKind =
  | "camera-off-visibility"
  | "connectivity-instability"
  | "persistence-failure";

export interface DataCompletenessIssue {
  classId: string;
  sessionId: string;
  kind: DataCompletenessIssueKind;
  timestamp: string;
  summary: string;
  detail?: string;
  affectedStudentIds?: string[];
}

export interface FlaggedStudentHistoricalReview {
  studentId: string;
  studentName: string;
  reasons: string[];
  lowEngagementCount: number;
  confusionFeedbackCount: number;
  unstableConnectivityCount: number;
  cameraOffCount: number;
  disengagedStatusCount: number;
  patternSummary: string;
}

export interface SessionSummaryReview {
  classId: string;
  sessionId: string;
  overallEngagementQuality: "high" | "moderate" | "low" | "insufficient";
  majorConfusionPeriods: Array<{
    timestamp: string;
    confusionRate: number;
    averageEngagement: number;
  }>;
  classTrajectory: "improved" | "declined" | "steady" | "insufficient";
  repeatedlyFlaggedStudents: FlaggedStudentHistoricalReview[];
  suggestedInterventions: TeacherInterventionRecord[];
  markerAlignedBehaviorShifts: Array<{
    markerId: string;
    markerTitle: string;
    markerType: TeachingMomentType;
    timestamp: string;
    interpretation: string;
  }>;
  dataCompleteness: {
    status: "complete" | "partial";
    issues: DataCompletenessIssue[];
  };
}

export interface SessionPlaybackStep {
  classId: string;
  sessionId: string;
  timestamp: string;
  classPulseProgression?: {
    averageEngagement: number;
    confusionRate: number;
    activeStudentCount: number;
    alertLevel: "green" | "yellow" | "red";
  };
  alertChange?: string;
  cognitiveInsightMilestones: string[];
  recommendationHistory: Array<{ recommendation: string; reason: string }>;
  manualMarkers: Array<{ markerId: string; title: string; markerType: TeachingMomentType }>;
  behaviorShiftNotes: string[];
  dataCompletenessNotices: string[];
}

export interface PersistedCycleRecord {
  classId: string;
  sessionId?: string;
  cycleTimestamp: string;
  classPulseSnapshot: ClassPulseSnapshot;
  cognitiveMapSnapshot: CognitiveMapSnapshot;
  teacherNudges: TeacherNudge[];
  sourceEngagementSignals: EngagementSignal[];
  sourceFeedbackEvents: FeedbackEvent[];
  sourceStatusEvents?: StudentStatusEvent[];
  cognitiveInsights?: CognitiveInsight[];
}

export interface SessionNarrativeItem {
  sessionId: string;
  classId: string;
  timestamp: string;
  kind:
    | "source-event"
    | "class-pulse"
    | "cognitive-insight"
    | "teacher-recommendation"
    | "manual-marker"
    | "data-completeness";
  summary: string;
}

export interface HistoryStore {
  saveCycle(record: PersistedCycleRecord): void;
  listRecent(classId: string, limit: number): PersistedCycleRecord[];
  startSession(session: SessionMetadata): void;
  markSessionLive(classId: string, sessionId: string, at: string): void;
  endSession(classId: string, sessionId: string, endedAt: string): void;
  markSessionReviewReady(classId: string, sessionId: string, at: string): void;
  appendSourceEvent(event: SourceEvent): void;
  appendIntervention(intervention: TeacherInterventionRecord): void;
  addManualMarker(marker: ManualTeachingMarker): void;
  appendDataCompletenessIssue(issue: DataCompletenessIssue): void;
  listSourceEvents(classId: string, limit: number): SourceEvent[];
  listSessionSourceEvents(classId: string, sessionId: string, limit: number): SourceEvent[];
  listSessionDerivedRecords(classId: string, sessionId: string, limit: number): DerivedRecord[];
  listInterventions(classId: string, limit: number): TeacherInterventionRecord[];
  listSessionInterventions(classId: string, sessionId: string, limit: number): TeacherInterventionRecord[];
  listManualMarkers(classId: string, sessionId: string, limit: number): ManualTeachingMarker[];
  listSessionDataCompletenessIssues(classId: string, sessionId: string, limit: number): DataCompletenessIssue[];
  getSessionRecord(classId: string, sessionId: string): SessionRecord | null;
  listSessionNarrative(classId: string, sessionId: string, limit: number): SessionNarrativeItem[];
  buildSessionSummary(classId: string, sessionId: string): SessionSummaryReview | null;
  buildSessionPlayback(classId: string, sessionId: string, limit: number): SessionPlaybackStep[];
  listFlaggedStudentReview(classId: string, sessionId: string, limit: number): FlaggedStudentHistoricalReview[];
}

export class InMemoryHistoryStore implements HistoryStore {
  private readonly recordsByClass = new Map<string, PersistedCycleRecord[]>();
  private readonly recordsBySession = new Map<string, PersistedCycleRecord[]>();
  private readonly sessionsByClass = new Map<string, SessionRecord[]>();
  private readonly sourceEventsByClass = new Map<string, SourceEvent[]>();
  private readonly sourceEventsBySession = new Map<string, SourceEvent[]>();
  private readonly derivedRecordsBySession = new Map<string, DerivedRecord[]>();
  private readonly interventionsByClass = new Map<string, TeacherInterventionRecord[]>();
  private readonly interventionsBySession = new Map<string, TeacherInterventionRecord[]>();
  private readonly markersBySession = new Map<string, ManualTeachingMarker[]>();
  private readonly completenessIssuesBySession = new Map<string, DataCompletenessIssue[]>();

  private keyFor(classId: string, sessionId: string): string {
    return `${classId}::${sessionId}`;
  }

  private inferSessionIdForClass(classId: string): string {
    const sessions = this.sessionsByClass.get(classId) ?? [];
    const live = sessions.find((session) => session.lifecycleState === "live");
    if (live) {
      return live.sessionId;
    }

    return sessions[0]?.sessionId ?? `${classId}-live`;
  }

  private updateSessionState(
    classId: string,
    sessionId: string,
    state: SessionLifecycleState,
    at: string,
    endedAt?: string,
  ): void {
    const sessions = this.sessionsByClass.get(classId) ?? [];
    this.sessionsByClass.set(
      classId,
      sessions.map((session) =>
        session.sessionId === sessionId
          ? {
              ...session,
              lifecycleState: state,
              updatedAt: at,
              endedAt: endedAt ?? session.endedAt,
            }
          : session,
      ),
    );
  }

  private upsertSession(session: SessionRecord): void {
    const existing = this.sessionsByClass.get(session.classId) ?? [];
    const filtered = existing.filter((entry) => entry.sessionId !== session.sessionId);
    this.sessionsByClass.set(session.classId, [session, ...filtered].slice(0, 100));
  }

  private pushDerivedRecord(record: DerivedRecord): void {
    const key = this.keyFor(record.classId, record.sessionId);
    const existing = this.derivedRecordsBySession.get(key) ?? [];
    this.derivedRecordsBySession.set(
      key,
      [record, ...existing]
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, 5000),
    );
  }

  private pushCompletenessIssue(issue: DataCompletenessIssue): void {
    const key = this.keyFor(issue.classId, issue.sessionId);
    const existing = this.completenessIssuesBySession.get(key) ?? [];
    const duplicate = existing.some(
      (entry) =>
        entry.kind === issue.kind &&
        entry.summary === issue.summary &&
        Math.abs(Date.parse(entry.timestamp) - Date.parse(issue.timestamp)) < 120000,
    );

    if (duplicate) {
      return;
    }

    this.completenessIssuesBySession.set(
      key,
      [issue, ...existing]
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, 2000),
    );
  }

  private shouldPersistClassPulse(record: PersistedCycleRecord, sessionId: string): boolean {
    const key = this.keyFor(record.classId, sessionId);
    const previous = (this.recordsBySession.get(key) ?? [])[0];
    if (!previous) {
      return true;
    }

    const elapsedMs = Date.parse(record.cycleTimestamp) - Date.parse(previous.cycleTimestamp);
    if (elapsedMs >= 30000) {
      return true;
    }

    if (record.classPulseSnapshot.alertLevel !== previous.classPulseSnapshot.alertLevel) {
      return true;
    }

    if (
      Math.abs(record.classPulseSnapshot.averageEngagement - previous.classPulseSnapshot.averageEngagement) >= 0.04
    ) {
      return true;
    }

    if (Math.abs(record.classPulseSnapshot.confusionRate - previous.classPulseSnapshot.confusionRate) >= 0.05) {
      return true;
    }

    if (Math.abs(record.classPulseSnapshot.activeStudentCount - previous.classPulseSnapshot.activeStudentCount) >= 2) {
      return true;
    }

    return false;
  }

  private isEducationallyRelevantInsight(insight: CognitiveInsight): boolean {
    const normalized = insight.summary.toLowerCase();
    const relevantPhrases = [
      "confusion cluster",
      "engagement drop",
      "silent",
      "unstable",
      "recovery",
      "learning gap",
      "learning-gap",
    ];

    return relevantPhrases.some((phrase) => normalized.includes(phrase));
  }

  private resolveStudentName(sourceEvents: SourceEvent[], studentId: string): string {
    for (const event of sourceEvents) {
      if ("studentId" in event && event.studentId === studentId) {
        const maybeName = event.studentName;
        if (maybeName && maybeName.trim().length > 0) {
          return maybeName;
        }
      }
    }

    return studentId;
  }

  saveCycle(record: PersistedCycleRecord): void {
    const resolvedSessionId = record.sessionId ?? this.inferSessionIdForClass(record.classId);
    const normalizedRecord: PersistedCycleRecord = {
      ...record,
      sessionId: resolvedSessionId,
    };

    if (!this.shouldPersistClassPulse(normalizedRecord, resolvedSessionId)) {
      return;
    }

    const existing = this.recordsByClass.get(record.classId) ?? [];
    const updated = [normalizedRecord, ...existing]
      .sort((a, b) => Date.parse(b.cycleTimestamp) - Date.parse(a.cycleTimestamp))
      .slice(0, 500);

    this.recordsByClass.set(record.classId, updated);

    const sessionKey = this.keyFor(record.classId, resolvedSessionId);
    const sessionRecords = this.recordsBySession.get(sessionKey) ?? [];
    this.recordsBySession.set(
      sessionKey,
      [normalizedRecord, ...sessionRecords]
        .sort((a, b) => Date.parse(b.cycleTimestamp) - Date.parse(a.cycleTimestamp))
        .slice(0, 1000),
    );

    this.pushDerivedRecord({
      classId: normalizedRecord.classId,
      sessionId: resolvedSessionId,
      timestamp: normalizedRecord.cycleTimestamp,
      kind: "class-pulse-snapshot",
      summary: `Class pulse ${normalizedRecord.classPulseSnapshot.alertLevel} (engagement ${normalizedRecord.classPulseSnapshot.averageEngagement.toFixed(2)}, confusion ${normalizedRecord.classPulseSnapshot.confusionRate.toFixed(2)})`,
      alertLevel: normalizedRecord.classPulseSnapshot.alertLevel,
    });

    for (const insight of normalizedRecord.cognitiveInsights ?? []) {
      if (!this.isEducationallyRelevantInsight(insight)) {
        continue;
      }

      this.pushDerivedRecord({
        classId: normalizedRecord.classId,
        sessionId: resolvedSessionId,
        timestamp: normalizedRecord.cycleTimestamp,
        kind: "cognitive-insight-event",
        summary: insight.summary,
        alertLevel: insight.severity,
        recommendationCategory: insight.category,
        studentReferences: insight.studentReferences,
      });
    }

    const statusEvents = normalizedRecord.sourceStatusEvents ?? [];
    const cameraOffStudents = Array.from(
      new Set(
        statusEvents
          .filter((event) => event.operationalState === "camera-off")
          .map((event) => event.studentId),
      ),
    );
    const unstableStudents = Array.from(
      new Set(
        statusEvents
          .filter((event) => event.operationalState === "reconnecting" || event.operationalState === "disconnected")
          .map((event) => event.studentId),
      ),
    );
    const trackedCount = Math.max(1, normalizedRecord.classPulseSnapshot.activeStudentCount);

    if (cameraOffStudents.length >= Math.max(2, Math.ceil(trackedCount * 0.4))) {
      this.pushCompletenessIssue({
        classId: normalizedRecord.classId,
        sessionId: resolvedSessionId,
        kind: "camera-off-visibility",
        timestamp: normalizedRecord.cycleTimestamp,
        summary: "Reduced visibility: many students were camera-off during this period.",
        affectedStudentIds: cameraOffStudents,
      });
    }

    if (unstableStudents.length >= Math.max(2, Math.ceil(trackedCount * 0.25))) {
      this.pushCompletenessIssue({
        classId: normalizedRecord.classId,
        sessionId: resolvedSessionId,
        kind: "connectivity-instability",
        timestamp: normalizedRecord.cycleTimestamp,
        summary: "Reduced visibility: unstable connectivity affected multiple students.",
        affectedStudentIds: unstableStudents,
      });
    }
  }

  listRecent(classId: string, limit: number): PersistedCycleRecord[] {
    const entries = this.recordsByClass.get(classId) ?? [];
    const safeLimit = Math.max(0, limit);
    return entries.slice(0, safeLimit);
  }

  startSession(session: SessionMetadata): void {
    const now = session.startedAt;
    const record: SessionRecord = {
      classId: session.classId,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      teacherClientId: session.teacherClientId,
      lifecycleState: "created",
      participants: [],
      createdAt: now,
      updatedAt: now,
    };

    this.upsertSession(record);
  }

  markSessionLive(classId: string, sessionId: string, at: string): void {
    this.updateSessionState(classId, sessionId, "live", at);
  }

  endSession(classId: string, sessionId: string, endedAt: string): void {
    this.updateSessionState(classId, sessionId, "ended", endedAt, endedAt);
  }

  markSessionReviewReady(classId: string, sessionId: string, at: string): void {
    this.updateSessionState(classId, sessionId, "review-ready", at);
  }

  appendSourceEvent(event: SourceEvent): void {
    const classId = event.classId;
    const existing = this.sourceEventsByClass.get(classId) ?? [];
    this.sourceEventsByClass.set(classId, [event, ...existing].slice(0, 5000));

    const sessionId = this.inferSessionIdForClass(classId);
    const key = this.keyFor(classId, sessionId);
    const sessionEvents = this.sourceEventsBySession.get(key) ?? [];
    this.sourceEventsBySession.set(key, [event, ...sessionEvents].slice(0, 5000));

    const sessions = this.sessionsByClass.get(classId) ?? [];
    this.sessionsByClass.set(
      classId,
      sessions.map((session) => {
        if (session.sessionId !== sessionId) {
          return session;
        }

        const participant = "studentId" in event ? event.studentId : null;
        const nextParticipants =
          participant && !session.participants.includes(participant)
            ? [...session.participants, participant]
            : session.participants;

        return {
          ...session,
          participants: nextParticipants,
          updatedAt: event.timestamp,
        };
      }),
    );
  }

  appendIntervention(intervention: TeacherInterventionRecord): void {
    const existing = this.interventionsByClass.get(intervention.classId) ?? [];
    this.interventionsByClass.set(intervention.classId, [intervention, ...existing].slice(0, 1000));

    const key = this.keyFor(intervention.classId, intervention.sessionId);
    const sessionInterventions = this.interventionsBySession.get(key) ?? [];
    this.interventionsBySession.set(key, [intervention, ...sessionInterventions].slice(0, 1000));

    this.pushDerivedRecord({
      classId: intervention.classId,
      sessionId: intervention.sessionId,
      timestamp: intervention.timestamp,
      kind: "teacher-recommendation-event",
      summary: intervention.suggestion,
      recommendationCategory: intervention.category,
      recommendationReason: intervention.reason,
    });

    this.updateSessionState(intervention.classId, intervention.sessionId, "live", intervention.timestamp);
  }

  addManualMarker(marker: ManualTeachingMarker): void {
    const key = this.keyFor(marker.classId, marker.sessionId);
    const existing = this.markersBySession.get(key) ?? [];
    this.markersBySession.set(
      key,
      [marker, ...existing]
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, 2000),
    );

    this.updateSessionState(marker.classId, marker.sessionId, "live", marker.timestamp);
  }

  appendDataCompletenessIssue(issue: DataCompletenessIssue): void {
    this.pushCompletenessIssue(issue);
    this.updateSessionState(issue.classId, issue.sessionId, "live", issue.timestamp);
  }

  listSourceEvents(classId: string, limit: number): SourceEvent[] {
    const entries = this.sourceEventsByClass.get(classId) ?? [];
    return entries.slice(0, Math.max(0, limit));
  }

  listSessionSourceEvents(classId: string, sessionId: string, limit: number): SourceEvent[] {
    const entries = this.sourceEventsBySession.get(this.keyFor(classId, sessionId)) ?? [];
    return entries.slice(0, Math.max(0, limit));
  }

  listSessionDerivedRecords(classId: string, sessionId: string, limit: number): DerivedRecord[] {
    const entries = this.derivedRecordsBySession.get(this.keyFor(classId, sessionId)) ?? [];
    return entries.slice(0, Math.max(0, limit));
  }

  listInterventions(classId: string, limit: number): TeacherInterventionRecord[] {
    const entries = this.interventionsByClass.get(classId) ?? [];
    return entries.slice(0, Math.max(0, limit));
  }

  listSessionInterventions(classId: string, sessionId: string, limit: number): TeacherInterventionRecord[] {
    const entries = this.interventionsBySession.get(this.keyFor(classId, sessionId)) ?? [];
    return entries.slice(0, Math.max(0, limit));
  }

  listManualMarkers(classId: string, sessionId: string, limit: number): ManualTeachingMarker[] {
    const entries = this.markersBySession.get(this.keyFor(classId, sessionId)) ?? [];
    return entries.slice(0, Math.max(0, limit));
  }

  listSessionDataCompletenessIssues(classId: string, sessionId: string, limit: number): DataCompletenessIssue[] {
    const entries = this.completenessIssuesBySession.get(this.keyFor(classId, sessionId)) ?? [];
    return entries.slice(0, Math.max(0, limit));
  }

  getSessionRecord(classId: string, sessionId: string): SessionRecord | null {
    const sessions = this.sessionsByClass.get(classId) ?? [];
    return sessions.find((session) => session.sessionId === sessionId) ?? null;
  }

  listSessionNarrative(classId: string, sessionId: string, limit: number): SessionNarrativeItem[] {
    const key = this.keyFor(classId, sessionId);
    const sourceEvents = this.sourceEventsBySession.get(key) ?? [];
    const derived = this.derivedRecordsBySession.get(key) ?? [];
    const markers = this.markersBySession.get(key) ?? [];
    const completeness = this.completenessIssuesBySession.get(key) ?? [];

    const narrative: SessionNarrativeItem[] = [
      ...sourceEvents.map((event) => ({
        sessionId,
        classId,
        timestamp: event.timestamp,
        kind: "source-event" as const,
        summary:
          event.valueType === "engagement-score"
            ? `Engagement signal from ${event.studentId}`
            : event.valueType === "feedback-type"
              ? `Feedback event: ${event.feedbackType} from ${event.studentId}`
              : event.valueType === "student-status"
                ? `Status event: ${event.operationalState} for ${event.studentId}`
                : `Session event: ${event.status}`,
      })),
      ...derived.map((entry) => ({
        sessionId,
        classId,
        timestamp: entry.timestamp,
        kind:
          entry.kind === "class-pulse-snapshot"
            ? ("class-pulse" as const)
            : entry.kind === "cognitive-insight-event"
              ? ("cognitive-insight" as const)
              : ("teacher-recommendation" as const),
        summary: entry.summary,
      })),
      ...markers.map((marker) => ({
        sessionId,
        classId,
        timestamp: marker.timestamp,
        kind: "manual-marker" as const,
        summary: `${marker.markerType}: ${marker.title}`,
      })),
      ...completeness.map((issue) => ({
        sessionId,
        classId,
        timestamp: issue.timestamp,
        kind: "data-completeness" as const,
        summary: issue.summary,
      })),
    ];

    return narrative
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(Math.max(0, narrative.length - Math.max(0, limit)));
  }

  listFlaggedStudentReview(classId: string, sessionId: string, limit: number): FlaggedStudentHistoricalReview[] {
    const sourceEvents = this.sourceEventsBySession.get(this.keyFor(classId, sessionId)) ?? [];
    const byStudent = new Map<
      string,
      {
        studentName: string;
        lowEngagementCount: number;
        confusionFeedbackCount: number;
        unstableConnectivityCount: number;
        cameraOffCount: number;
        disengagedStatusCount: number;
      }
    >();

    for (const event of sourceEvents) {
      if (!("studentId" in event)) {
        continue;
      }

      const current =
        byStudent.get(event.studentId) ??
        {
          studentName: this.resolveStudentName(sourceEvents, event.studentId),
          lowEngagementCount: 0,
          confusionFeedbackCount: 0,
          unstableConnectivityCount: 0,
          cameraOffCount: 0,
          disengagedStatusCount: 0,
        };

      if (event.valueType === "engagement-score" && event.engagementScore < 0.4) {
        current.lowEngagementCount += 1;
      }

      if (
        event.valueType === "feedback-type" &&
        (event.feedbackType === "confused" || event.feedbackType === "repeat")
      ) {
        current.confusionFeedbackCount += 1;
      }

      if (
        event.valueType === "student-status" &&
        (event.operationalState === "reconnecting" || event.operationalState === "disconnected")
      ) {
        current.unstableConnectivityCount += 1;
      }

      if (event.valueType === "student-status" && event.operationalState === "camera-off") {
        current.cameraOffCount += 1;
      }

      if (event.valueType === "student-status" && (event.operationalState === "idle" || event.operationalState === "disconnected")) {
        current.disengagedStatusCount += 1;
      }

      byStudent.set(event.studentId, current);
    }

    const flagged = Array.from(byStudent.entries())
      .map(([studentId, entry]) => {
        const reasons: string[] = [];
        if (entry.confusionFeedbackCount >= 2) {
          reasons.push("Repeated confusion signals");
        }
        if (entry.lowEngagementCount >= 3) {
          reasons.push("Sustained low engagement");
        }
        if (entry.unstableConnectivityCount >= 2) {
          reasons.push("Unstable connectivity pattern");
        }
        if (entry.cameraOffCount >= 2) {
          reasons.push("Frequent camera-off participation");
        }
        if (entry.disengagedStatusCount >= 2) {
          reasons.push("Repeated disengaged status");
        }

        return {
          studentId,
          studentName: entry.studentName,
          reasons,
          lowEngagementCount: entry.lowEngagementCount,
          confusionFeedbackCount: entry.confusionFeedbackCount,
          unstableConnectivityCount: entry.unstableConnectivityCount,
          cameraOffCount: entry.cameraOffCount,
          disengagedStatusCount: entry.disengagedStatusCount,
          patternSummary:
            reasons.length > 0
              ? reasons.join("; ")
              : "No repeated risk pattern detected.",
        };
      })
      .filter((entry) => entry.reasons.length > 0)
      .sort(
        (a, b) =>
          b.reasons.length - a.reasons.length ||
          b.confusionFeedbackCount + b.lowEngagementCount - (a.confusionFeedbackCount + a.lowEngagementCount),
      );

    return flagged.slice(0, Math.max(0, limit));
  }

  buildSessionSummary(classId: string, sessionId: string): SessionSummaryReview | null {
    const session = this.getSessionRecord(classId, sessionId);
    if (!session) {
      return null;
    }

    const key = this.keyFor(classId, sessionId);
    const cycles = [...(this.recordsBySession.get(key) ?? [])].sort(
      (a, b) => Date.parse(a.cycleTimestamp) - Date.parse(b.cycleTimestamp),
    );
    const interventions = this.listSessionInterventions(classId, sessionId, 200)
      .slice()
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const markers = this.listManualMarkers(classId, sessionId, 200)
      .slice()
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const issues = this.listSessionDataCompletenessIssues(classId, sessionId, 200)
      .slice()
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    const overallEngagementQuality = (() => {
      if (cycles.length === 0) {
        return "insufficient" as const;
      }

      const average =
        cycles.reduce((sum, cycle) => sum + cycle.classPulseSnapshot.averageEngagement, 0) / cycles.length;
      if (average >= 0.7) {
        return "high" as const;
      }
      if (average >= 0.5) {
        return "moderate" as const;
      }
      return "low" as const;
    })();

    const majorConfusionPeriods = cycles
      .filter((cycle) => cycle.classPulseSnapshot.confusionRate >= 0.35)
      .map((cycle) => ({
        timestamp: cycle.cycleTimestamp,
        confusionRate: cycle.classPulseSnapshot.confusionRate,
        averageEngagement: cycle.classPulseSnapshot.averageEngagement,
      }))
      .slice(0, 20);

    const classTrajectory = (() => {
      if (cycles.length < 2) {
        return "insufficient" as const;
      }

      const first = cycles[0].classPulseSnapshot;
      const last = cycles[cycles.length - 1].classPulseSnapshot;
      const engagementDelta = last.averageEngagement - first.averageEngagement;
      const confusionDelta = last.confusionRate - first.confusionRate;

      if (engagementDelta > 0.05 && confusionDelta < -0.05) {
        return "improved" as const;
      }
      if (engagementDelta < -0.05 || confusionDelta > 0.05) {
        return "declined" as const;
      }
      return "steady" as const;
    })();

    const markerAlignedBehaviorShifts = markers.map((marker) => {
      const markerAt = Date.parse(marker.timestamp);
      const before = cycles
        .filter((cycle) => Date.parse(cycle.cycleTimestamp) <= markerAt)
        .slice(-1)[0];
      const after = cycles.find((cycle) => Date.parse(cycle.cycleTimestamp) >= markerAt);

      if (!before || !after) {
        return {
          markerId: marker.markerId,
          markerTitle: marker.title,
          markerType: marker.markerType,
          timestamp: marker.timestamp,
          interpretation: "Insufficient surrounding pulse data to assess shift.",
        };
      }

      const engagementDelta = after.classPulseSnapshot.averageEngagement - before.classPulseSnapshot.averageEngagement;
      const confusionDelta = after.classPulseSnapshot.confusionRate - before.classPulseSnapshot.confusionRate;
      const interpretation =
        engagementDelta > 0.04 && confusionDelta < -0.04
          ? "Class behavior improved after this teaching moment."
          : engagementDelta < -0.04 || confusionDelta > 0.04
            ? "Class behavior declined after this teaching moment."
            : "Class behavior stayed broadly stable around this teaching moment.";

      return {
        markerId: marker.markerId,
        markerTitle: marker.title,
        markerType: marker.markerType,
        timestamp: marker.timestamp,
        interpretation,
      };
    });

    return {
      classId,
      sessionId,
      overallEngagementQuality,
      majorConfusionPeriods,
      classTrajectory,
      repeatedlyFlaggedStudents: this.listFlaggedStudentReview(classId, sessionId, 50),
      suggestedInterventions: interventions,
      markerAlignedBehaviorShifts,
      dataCompleteness: {
        status: issues.length > 0 ? "partial" : "complete",
        issues,
      },
    };
  }

  buildSessionPlayback(classId: string, sessionId: string, limit: number): SessionPlaybackStep[] {
    const key = this.keyFor(classId, sessionId);
    const cycles = [...(this.recordsBySession.get(key) ?? [])].sort(
      (a, b) => Date.parse(a.cycleTimestamp) - Date.parse(b.cycleTimestamp),
    );
    const derived = [...(this.derivedRecordsBySession.get(key) ?? [])].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );
    const markers = [...(this.markersBySession.get(key) ?? [])].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );
    const issues = [...(this.completenessIssuesBySession.get(key) ?? [])].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );

    const timeline = new Map<string, SessionPlaybackStep>();
    const ensureStep = (timestamp: string): SessionPlaybackStep => {
      const existing = timeline.get(timestamp);
      if (existing) {
        return existing;
      }

      const created: SessionPlaybackStep = {
        classId,
        sessionId,
        timestamp,
        cognitiveInsightMilestones: [],
        recommendationHistory: [],
        manualMarkers: [],
        behaviorShiftNotes: [],
        dataCompletenessNotices: [],
      };
      timeline.set(timestamp, created);
      return created;
    };

    let previousAlert: "green" | "yellow" | "red" | null = null;
    for (const cycle of cycles) {
      const step = ensureStep(cycle.cycleTimestamp);
      step.classPulseProgression = {
        averageEngagement: cycle.classPulseSnapshot.averageEngagement,
        confusionRate: cycle.classPulseSnapshot.confusionRate,
        activeStudentCount: cycle.classPulseSnapshot.activeStudentCount,
        alertLevel: cycle.classPulseSnapshot.alertLevel,
      };

      if (previousAlert && previousAlert !== cycle.classPulseSnapshot.alertLevel) {
        step.alertChange = `Alert changed from ${previousAlert} to ${cycle.classPulseSnapshot.alertLevel}.`;
      }
      previousAlert = cycle.classPulseSnapshot.alertLevel;
    }

    for (const entry of derived) {
      const step = ensureStep(entry.timestamp);
      if (entry.kind === "cognitive-insight-event") {
        step.cognitiveInsightMilestones.push(entry.summary);
      }

      if (entry.kind === "teacher-recommendation-event") {
        step.recommendationHistory.push({
          recommendation: entry.summary,
          reason: entry.recommendationReason ?? "No reason recorded.",
        });
      }
    }

    for (const marker of markers) {
      const step = ensureStep(marker.timestamp);
      step.manualMarkers.push({
        markerId: marker.markerId,
        title: marker.title,
        markerType: marker.markerType,
      });

      const markerAt = Date.parse(marker.timestamp);
      const before = cycles
        .filter((cycle) => Date.parse(cycle.cycleTimestamp) <= markerAt)
        .slice(-1)[0];
      const after = cycles.find((cycle) => Date.parse(cycle.cycleTimestamp) >= markerAt);

      if (before && after) {
        const engagementDelta = after.classPulseSnapshot.averageEngagement - before.classPulseSnapshot.averageEngagement;
        const confusionDelta = after.classPulseSnapshot.confusionRate - before.classPulseSnapshot.confusionRate;
        if (engagementDelta > 0.04 && confusionDelta < -0.04) {
          step.behaviorShiftNotes.push("Marker aligned with improving engagement/confusion trend.");
        } else if (engagementDelta < -0.04 || confusionDelta > 0.04) {
          step.behaviorShiftNotes.push("Marker aligned with worsening engagement/confusion trend.");
        } else {
          step.behaviorShiftNotes.push("Marker aligned with stable class behavior.");
        }
      }
    }

    for (const issue of issues) {
      const step = ensureStep(issue.timestamp);
      step.dataCompletenessNotices.push(issue.summary);
    }

    const ordered = Array.from(timeline.values()).sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );
    const safeLimit = Math.max(0, limit);
    return ordered.slice(Math.max(0, ordered.length - safeLimit));
  }
}
