# CognitivePulse Communication and Intelligence Behavior

## Scope
This document defines the communication and intelligence behavior in detail.
It is the implementation-aligned reference for runtime behavior.

## MQTT Communication Behavior

### Namespace and Topic Hierarchy
Root namespace: cognitivepulse

Class-scoped paths:
- Class namespace:
  - cognitivepulse/class/{classId}
- Student engagement:
  - cognitivepulse/class/{classId}/student/{studentId}/engagement
- Student operational status:
  - cognitivepulse/class/{classId}/student/{studentId}/status
- Student feedback by type:
  - cognitivepulse/class/{classId}/feedback/confused
  - cognitivepulse/class/{classId}/feedback/repeat
  - cognitivepulse/class/{classId}/feedback/understood
- Session information:
  - cognitivepulse/class/{classId}/session/info
- Class pulse aggregate:
  - cognitivepulse/class/{classId}/pulse
- Cognitive map insight:
  - cognitivepulse/class/{classId}/cognitive-map
- Teacher nudges:
  - cognitivepulse/class/{classId}/teacher/nudges

Teacher class-first subscription wildcard:
- cognitivepulse/class/{classId}/#

Optional teacher student drill-down wildcard:
- cognitivepulse/class/{classId}/student/{studentId}/#

Source versus derived channels:
- Source channels (student-originated): engagement, status, feedback, session heartbeat/status.
- Derived channels (backend-originated): class pulse, cognitive map, teacher nudges.

### Payload Requirements
Every published message must contain:
- identifiers
  - classId (required)
  - studentId (required for student-originated messages)
- typed value
  - valueType (string discriminator)
  - value (typed payload value)
- timestamp
  - ISO-8601 timestamp

### Transport Envelope
Envelope fields for each MQTT publication:
- messageId
- schemaVersion
- source
- payloadType
- payload

### Client Connectivity Behavior
Student client:
- Connects with a unique client identifier per browser session.
- Publishes engagement scores at regular interval (default 5000 ms).
- Publishes feedback events on user interaction.

Teacher dashboard:
- Connects with a class-scoped client identifier.
- Subscribes to the class wildcard topic and consumes all class channels.

Backend ingestion:
- Connects with a class-scoped backend client identifier.
- Validates and routes envelopes for downstream fusion and persistence.

## Data Fusion Engine Behavior

### Aggregation Inputs
- Rolling window duration: configurable (windowDurationMs).
- Active student threshold: configurable (activeStudentThresholdMs).
- Input stream: engagement and feedback events within current rolling window.

### Active Student Definition
A student is active when their most recent engagement signal timestamp is within activeStudentThresholdMs from the aggregation cycle timestamp.

### Metrics
Average engagement:
- Mean of latest engagementScore values across active students only.
- If no active students, value is 0.0.

Confusion rate:
- confused events within rolling window divided by activeStudentCount.
- If no active students, value is 0.0.

### Alert Levels
Green:
- high engagement and low confusion
- default thresholds:
  - averageEngagement >= 0.70
  - confusionRate <= 0.15

Yellow:
- moderate decline or moderate confusion
- default thresholds:
  - averageEngagement >= 0.45 and < 0.70, or
  - confusionRate > 0.15 and <= 0.35

Red:
- low engagement or sharp confusion spike
- default thresholds:
  - averageEngagement < 0.45, or
  - confusionRate > 0.35

### Output
Data fusion emits:
- class pulse snapshot on pulse topic
- derived values for downstream cognitive map processing

## Cognitive Map Engine Behavior

### Rule Set
Confusion spike near topic transition:
- Trigger when confused feedback rises sharply in the current window and the same window is marked with a content transition marker.
- Produces a confusion-spike-topic-transition trigger.

Sustained engagement decline:
- Trigger when engagement trend over the current rolling window is consistently downward over configured sub-intervals.
- Produces a sustained-engagement-decline trigger.

Silent student pattern:
- Trigger when active class roster indicates expected students but one or more students have no signal during an extended portion of current window.
- Produces a silent-student-pattern trigger.

### Output
Cognitive map emits:
- cognitive map snapshot
- ordered trigger list with timestamps and affected students

## Teacher Nudge Behavior

### Trigger to Recommendation Mapping
confusion-spike-topic-transition:
- "Confusion just spiked near a topic change. Recap with a simpler example."

sustained-engagement-decline:
- "Engagement is trending down. Run a quick interactive check-in now."

silent-student-pattern:
- "Some students are silent. Ask a gentle low-pressure group question."

### Priority and Refresh Rules
- Nudges refresh on every aggregation pass.
- Rule selection is stateless per aggregation cycle.
- If multiple rules trigger in one cycle, the most recently triggered rule has priority as primary nudge.
- Non-primary triggered rules may still appear as secondary nudges.

## Stateless Intelligence Constraint
All intelligence behavior must be computed per aggregation cycle using only the current rolling window inputs for that cycle.
No state may be carried across cycles beyond data included in the current window payload.
