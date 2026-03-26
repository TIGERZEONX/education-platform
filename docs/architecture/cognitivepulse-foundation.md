# CognitivePulse Foundation Architecture

## Purpose
This document defines the structural baseline for CognitivePulse.
The current phase initializes the implementation foundation for a single live class session.

## Product Sides
- Student Client: browser app that runs local webcam landmark processing and captures one-tap feedback events using real student names.
- Teacher Dashboard: browser app that subscribes to class signals, computes class pulse views, and surfaces instructional alerts with class-first defaults.

## Real-Time Backbone
- Transport: MQTT over WebSockets.
- Student browsers publish normalized engagement scores and explicit feedback events.
- Teacher dashboard subscribes to class streams and derived pulse channels, with optional student-level drill-down when explicitly needed.
- Raw video frames never leave the student browser.

## Concerns and Module Boundaries
- Student Client concern: frontend/student-client handles local engagement sensing and feedback capture.
- AI Vision Module concern: frontend/student-client/src/vision and backend/services/ai-vision handle vision contracts, compatibility, and policy boundaries.
- Feedback Input Module concern: frontend/student-client input handlers normalize explicit feedback events.
- Real-Time Messaging Layer concern: shared/communication/mqtt and backend/services/realtime-messaging provide typed MQTT topics, envelopes, and publish/subscribe runtime helpers.
- Data Fusion Engine concern: backend/services/intelligence-fusion computes rolling class pulse metrics from engagement and feedback signals.
- Cognitive Map Engine concern: backend/services/intelligence-fusion derives learning-gap indicators and trigger rules separately from fusion.
- Teacher Dashboard concern: frontend/teacher-dashboard presents class-level insights first and supports drill-down only as needed.
- Database/History side module concern: backend/services/persistence-history stores cycle outputs and source-signal references.
- Configuration and documentation concern: shared/config and docs define non-runtime policy and architecture guidance.

## Non-Functional Rules Captured by Structure
- Privacy-first local processing on student devices.
- Typed shared message contracts across publisher and subscriber clients.
- Separation between ingest, fusion, cognitive mapping, persistence, and presentation concerns.
- Educational support posture focused on teacher assistance and adaptive instruction, not surveillance.
- Test layout aligned to frontend, backend, and end-to-end integration levels.
