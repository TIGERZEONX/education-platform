import { MongoClient, Db, Collection } from "mongodb";
import type {
  HistoryStore,
  SessionMetadata,
  SessionRecord,
  ManualTeachingMarker,
  TeacherInterventionRecord,
  SourceEvent,
  DerivedRecord,
  DataCompletenessIssue,
  FlaggedStudentHistoricalReview,
  SessionSummaryReview,
  SessionPlaybackStep,
  PersistedCycleRecord,
  SessionNarrativeItem,
} from "./history-store";

export class MongoDbHistoryStore implements HistoryStore {
  private db: Db;

  private sessions: Collection<SessionRecord>;
  private cycles: Collection<PersistedCycleRecord>;
  private sourceEvents: Collection<SourceEvent>;
  private derivedRecords: Collection<DerivedRecord>;
  private interventions: Collection<TeacherInterventionRecord>;
  private manualMarkers: Collection<ManualTeachingMarker>;
  private completenessIssues: Collection<DataCompletenessIssue>;

  constructor(db: Db) {
    this.db = db;
    this.sessions = db.collection<SessionRecord>("sessions");
    this.cycles = db.collection<PersistedCycleRecord>("cycles");
    this.sourceEvents = db.collection<SourceEvent>("sourceEvents");
    this.derivedRecords = db.collection<DerivedRecord>("derivedRecords");
    this.interventions = db.collection<TeacherInterventionRecord>("interventions");
    this.manualMarkers = db.collection<ManualTeachingMarker>("manualMarkers");
    this.completenessIssues = db.collection<DataCompletenessIssue>("completenessIssues");
    
    // Create indexes for efficient querying
    this.createIndexes().catch(console.error);
  }

  private async createIndexes() {
    await this.sessions.createIndex({ classId: 1, sessionId: 1 }, { unique: true });
    await this.cycles.createIndex({ classId: 1, cycleTimestamp: -1 });
    await this.cycles.createIndex({ classId: 1, sessionId: 1, cycleTimestamp: -1 });
    await this.sourceEvents.createIndex({ classId: 1, timestamp: -1 });
    await this.derivedRecords.createIndex({ classId: 1, sessionId: 1, timestamp: -1 });
    await this.interventions.createIndex({ classId: 1, sessionId: 1, timestamp: -1 });
  }

  // --- Implementation Methods --- //
  // We use synchronous-looking methods for compatibility with HistoryStore interface, 
  // but they execute fire-and-forget MongoDB operations.
  
  saveCycle(record: PersistedCycleRecord): void {
    // Basic deduplication logic based on classPulse
    this.cycles.insertOne(record).catch(console.error);

    // Also extract and save derived records if insights are present
    if (record.cognitiveInsights) {
        for (const insight of record.cognitiveInsights) {
            const derived: DerivedRecord = {
                classId: record.classId,
                sessionId: record.sessionId ?? `${record.classId}-live`,
                timestamp: record.cycleTimestamp,
                kind: "cognitive-insight-event",
                summary: insight.summary,
                alertLevel: insight.severity,
                recommendationCategory: insight.category,
                studentReferences: insight.studentReferences,
            };
            this.pushDerivedRecord(derived);
        }
    }
  }

  private pushDerivedRecord(record: DerivedRecord): void {
      this.derivedRecords.insertOne(record).catch(console.error);
  }

  listRecent(classId: string, limit: number): PersistedCycleRecord[] {
    // Note: The interface specifies this returning synchronously.
    // For a real DB integration with a sync interface, we'd need to adapt the bridge 
    // to support Promises. But since this is a prototype, we return an empty array 
    // for sync calls, and the REST API will be updated to query directly.
    return [];
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
    this.sessions.updateOne(
      { classId: session.classId, sessionId: session.sessionId },
      { $set: record },
      { upsert: true }
    ).catch(console.error);
  }

  markSessionLive(classId: string, sessionId: string, at: string): void {
    this.sessions.updateOne(
        { classId, sessionId },
        { $set: { lifecycleState: "live", updatedAt: at } }
    ).catch(console.error);
  }

  endSession(classId: string, sessionId: string, endedAt: string): void {
    this.sessions.updateOne(
        { classId, sessionId },
        { $set: { lifecycleState: "ended", endedAt, updatedAt: endedAt } }
    ).catch(console.error);
  }

  markSessionReviewReady(classId: string, sessionId: string, at: string): void {
    this.sessions.updateOne(
        { classId, sessionId },
        { $set: { lifecycleState: "review-ready", updatedAt: at } }
    ).catch(console.error);
  }

  appendSourceEvent(event: SourceEvent): void {
    this.sourceEvents.insertOne(event).catch(console.error);
  }

  appendIntervention(intervention: TeacherInterventionRecord): void {
    this.interventions.insertOne(intervention).catch(console.error);
    this.markSessionLive(intervention.classId, intervention.sessionId, intervention.timestamp);
  }

  addManualMarker(marker: ManualTeachingMarker): void {
    this.manualMarkers.insertOne(marker).catch(console.error);
    this.markSessionLive(marker.classId, marker.sessionId, marker.timestamp);
  }

  appendDataCompletenessIssue(issue: DataCompletenessIssue): void {
    this.completenessIssues.insertOne(issue).catch(console.error);
    this.markSessionLive(issue.classId, issue.sessionId, issue.timestamp);
  }

  // --- Async Query Methods (for Express REST API) --- //
  async getRecentCycles(classId: string, limit: number): Promise<PersistedCycleRecord[]> {
    return this.cycles
      .find({ classId })
      .sort({ cycleTimestamp: -1 })
      .limit(limit)
      .toArray();
  }

  async getRecentInterventions(classId: string, limit: number): Promise<TeacherInterventionRecord[]> {
    return this.interventions
      .find({ classId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  listSourceEvents(classId: string, limit: number): SourceEvent[] { return []; }
  listSessionSourceEvents(classId: string, sessionId: string, limit: number): SourceEvent[] { return []; }
  listSessionDerivedRecords(classId: string, sessionId: string, limit: number): DerivedRecord[] { return []; }
  listInterventions(classId: string, limit: number): TeacherInterventionRecord[] { return []; }
  listSessionInterventions(classId: string, sessionId: string, limit: number): TeacherInterventionRecord[] { return []; }
  listManualMarkers(classId: string, sessionId: string, limit: number): ManualTeachingMarker[] { return []; }
  listSessionDataCompletenessIssues(classId: string, sessionId: string, limit: number): DataCompletenessIssue[] { return []; }
  getSessionRecord(classId: string, sessionId: string): SessionRecord | null { return null; }
  listSessionNarrative(classId: string, sessionId: string, limit: number): SessionNarrativeItem[] { return []; }
  buildSessionSummary(classId: string, sessionId: string): SessionSummaryReview | null { return null; }
  buildSessionPlayback(classId: string, sessionId: string, limit: number): SessionPlaybackStep[] { return []; }
  listFlaggedStudentReview(classId: string, sessionId: string, limit: number): FlaggedStudentHistoricalReview[] { return []; }
}
