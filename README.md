# CognitivePulse Foundation

## Overview
CognitivePulse is an AI-powered online classroom companion with two user-facing products:
- Student Client: captures browser-local facial landmark signals and one-tap feedback actions.
- Teacher Dashboard: consumes live class signals, computes class pulse views, and surfaces alerts and suggestions.

This repository is currently in a scaffold-only phase.
No feature implementation is included yet.

## Real-Time and Privacy Baseline
- Transport: MQTT over WebSockets.
- Student browsers publish numeric engagement scores and explicit feedback events.
- Teacher dashboard subscribes to classroom topics as the intelligence consumer.
- Raw video never leaves the student browser.

## Foundation Structure
- frontend/student-client: student-side product surface.
- frontend/teacher-dashboard: teacher-side product surface.
- shared/communication/mqtt: shared real-time contracts, topics, and serializers.
- backend/services/ai-vision: AI and vision concern boundary.
- backend/services/intelligence-fusion: data fusion and intelligence concern.
- backend/services/persistence-history: persistence and history concern.
- shared/config: shared environment, MQTT, and privacy configuration boundary.
- docs: architecture and decision records.

## Reference Documents
- docs/architecture/cognitivepulse-foundation.md
- docs/architecture/cognitivepulse-modules-and-contracts.md
- docs/architecture/cognitivepulse-communication-and-intelligence-behavior.md
- docs/decisions/ADR-0001-local-vision-and-signal-only.md
- tests/README.md

## Workspace Scripts
- npm run dev:student
- npm run dev:teacher
- npm run dev:ingest
- npm run lint

## Current Status
Project structure and module boundaries are established.
Implementation modules, runtime wiring, and tests will be added in later phases.