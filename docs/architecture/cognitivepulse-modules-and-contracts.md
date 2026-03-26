# CognitivePulse Modules, Contracts, and Relationships

## Scope
This document defines responsibilities, input/output contracts, and inter-module relationships.
It intentionally excludes implementation logic.

## 1) AI Vision Module (Student Browser)
### Responsibility
- Run facial landmark detection locally in the browser.
- Convert landmark dynamics into a smoothed engagement score in range 0.0 to 1.0.
- Emit periodic engagement signals only.

### Input Contract
- studentId: string
- classId: string
- cameraState: starting | streaming | stopped
- landmarkFrameTimestamp: ISO-8601 string

### Output Contract
- EngagementSignal
  - studentId: string
  - classId: string
  - valueType: engagement-score
  - value: number
  - engagementScore: number (0.0 to 1.0)
  - cameraStatus: active | blocked | unavailable
  - timestamp: ISO-8601 string

## 2) Feedback Input Module (Student Browser)
### Responsibility
- Capture one-tap student feedback interactions.
- Emit structured feedback events.

### Input Contract
- studentId: string
- classId: string
- interaction: confused | repeat | understood
- occurredAt: ISO-8601 string

### Output Contract
- FeedbackEvent
  - studentId: string
  - classId: string
  - valueType: feedback-type
  - value: confused | repeat | understood
  - feedbackType: confused | repeat | understood
  - timestamp: ISO-8601 string

## 3) Real-Time Messaging Layer (MQTT over WebSockets)
### Responsibility
- Transport typed events between publishers and subscribers with class-scoped routing.
- Preserve privacy by carrying only numeric engagement and explicit feedback events.

### Topic Contract
- Per-student engagement:
  - cognitivepulse/class/{classId}/student/{studentId}/engagement
- Feedback topics by type:
  - cognitivepulse/class/{classId}/feedback/confused
  - cognitivepulse/class/{classId}/feedback/repeat
  - cognitivepulse/class/{classId}/feedback/understood
- Aggregated class pulse:
  - cognitivepulse/class/{classId}/pulse
- Teacher nudges:
  - cognitivepulse/class/{classId}/teacher/nudges

### Envelope Contract
- messageId: string
- schemaVersion: 1.0.0
- source: student-client | teacher-dashboard | backend
- payloadType: engagement-signal | feedback-event | class-pulse-snapshot | teacher-nudge | cognitive-map-snapshot
- payload: typed event payload

Each payload includes identifiers, valueType, value, and timestamp.

## 4) Data Fusion Engine (Teacher Side Intelligence)
### Responsibility
- Maintain a sliding window of recent engagement and feedback events.
- Derive average engagement and confusion rate for active students.
- Determine alert level with thresholds mapped to green, yellow, red.

### Input Contract
- DataFusionWindowState
  - classId: string
  - windowStart: ISO-8601 string
  - windowEnd: ISO-8601 string
  - recentEngagement: EngagementSignal[]
  - recentFeedback: FeedbackEvent[]

### Output Contract
- ClassPulseSnapshot
  - classId: string
  - averageEngagement: number
  - confusionRate: number
  - activeStudentCount: number
  - alertLevel: green | yellow | red
  - windowStart: ISO-8601 string
  - windowEnd: ISO-8601 string
  - computedAt: ISO-8601 string

## 5) Cognitive Map Engine
### Responsibility
- Interpret fused pulse metrics over time.
- Identify confusion zones, learning-gap indicators, and trend direction.

### Input Contract
- classPulseHistory: ClassPulseSnapshot[]
- feedbackHistory: FeedbackEvent[]

### Output Contract
- CognitiveMapSnapshot
  - classId: string
  - confusionZones: string[]
  - learningGapIndicators: string[]
  - trendDirection: up | flat | down
  - basedOnWindowStart: ISO-8601 string
  - basedOnWindowEnd: ISO-8601 string
  - generatedAt: ISO-8601 string
- TeacherNudge[]
  - classId: string
  - alertLevel: green | yellow | red
  - nudgeId: string
  - title: string
  - suggestion: string
  - generatedAt: ISO-8601 string

## 6) Teacher Dashboard
### Responsibility
- Consume class pulse, cognitive map, nudges, and activity feed in real time.
- Render class pulse indicator, confusion timeline, student activity list, and nudge panel.

### Input Contract
- classPulse: ClassPulseSnapshot
- cognitiveMap: CognitiveMapSnapshot
- teacherNudges: TeacherNudge[]
- activityFeed: (EngagementSignal | FeedbackEvent)[]

### Output Contract (View Model)
- classPulseIndicator
  - alertLevel: green | yellow | red
  - averageEngagement: number
  - confusionRate: number
- confusionTimeline
  - timestamp: ISO-8601 string
  - confusionRate: number
- studentActivityList
  - studentId: string
  - latestEventType: engagement-signal | feedback-event
  - latestTimestamp: ISO-8601 string
- nudgePanel: TeacherNudge[]

## 7) Persistence Layer
### Responsibility
- Log all MQTT events.
- Store end-of-session class summaries for review.

### Input Contract
- mqttEvent: EngagementSignal | FeedbackEvent | ClassPulseSnapshot | CognitiveMapSnapshot | TeacherNudge

### Output Contract
- eventLogAck
  - stored: boolean
  - storedAt: ISO-8601 string
- sessionSummary (nullable)
  - classId: string
  - sessionStart: ISO-8601 string
  - sessionEnd: ISO-8601 string
  - averageEngagement: number
  - peakConfusionRate: number
  - dominantTrendDirection: up | flat | down

## Relationships
- AI Vision Module -> Real-Time Messaging Layer -> Data Fusion Engine
- Feedback Input Module -> Real-Time Messaging Layer -> Data Fusion Engine
- Data Fusion Engine -> Real-Time Messaging Layer (class pulse topic) -> Teacher Dashboard
- Data Fusion Engine -> Cognitive Map Engine -> Teacher Dashboard
- Cognitive Map Engine -> Real-Time Messaging Layer (teacher nudges topic) -> Teacher Dashboard
- Real-Time Messaging Layer -> Persistence Layer (all event streams)
