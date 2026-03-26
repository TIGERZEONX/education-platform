# Teacher Dashboard Responsibility Map

## Goal
The Teacher Dashboard is a class-first decision-support surface for one live class session at a time.
It is designed as a teaching assistant layer that helps teachers respond quickly, not a surveillance console.

## Core Responsibilities
- Session awareness:
  - Identify current class session status and staleness of live signals.
- Class pulse:
  - Show current class engagement pulse, active student count, and class-level alert state.
- Alerting:
  - Convert incoming class signals into intervention urgency (green, yellow, red).
- Trend visibility:
  - Surface confusion trend and class trend direction for recent windows.
- Cognitive insights:
  - Present latest interpretable cognitive insight summary.
- Teacher recommendations:
  - Keep a concise recommendation stack mapped to intervention categories.
- Optional flagged-student inspection:
  - Provide on-demand student drill-down for only flagged conditions.
- Side history access:
  - Read recent cycle history and intervention history without blocking live path.

## State Model
- Session mode:
  - awaiting-signals
  - live
- Class alert severity:
  - unknown
  - green
  - yellow
  - red
- Trend states:
  - confusion trend: rising | stable | falling | unknown
  - class trend: up | flat | down | unknown
- Flagged-student states:
  - silent-student indicator
  - repeated confusion pattern
  - low engagement signal

## Journey Map
- Step 1: Session aware startup
  - Dashboard enters awaiting-signals mode.
- Step 2: Class-first live updates
  - Pulse, alerting, trends, and latest recommendations update continuously.
- Step 3: Action support
  - Teacher receives category-level recommendations (slow-down, repeat, interact, quick-poll).
- Step 4: Optional drill-down
  - Teacher inspects only flagged students when deeper context is needed.
- Step 5: Side history access
  - Teacher opens recent cycle and intervention history as secondary context.

## Event Consumption Inventory
- Derived class channels:
  - class-pulse-snapshot
  - cognitive-map-snapshot
  - teacher-nudge
- Source channels for optional drill-down:
  - engagement-signal
  - student-status-event
  - feedback-event
- Side history channels:
  - persisted cycle history
  - intervention history

## Design Posture
- Default perspective remains class-level and intervention-oriented.
- Student-level inspection is optional and flagged-first, not always-on monitoring.
- Interface language and model outputs emphasize instructional support and communication quality.
