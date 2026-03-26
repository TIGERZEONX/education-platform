# ADR-0001: Local Vision Processing and Signal-Only Transmission

## Status
Accepted

## Context
CognitivePulse uses webcam-derived engagement cues in live classroom sessions.
The platform must preserve student privacy while still enabling real-time instructional awareness for teachers.

## Decision
- All video and landmark extraction runs locally in the student browser.
- Only numeric engagement scores and explicit feedback events are published.
- MQTT over WebSockets is used as the real-time transport for classroom pulse signals.

## Consequences
- Student privacy risk is reduced because no raw video stream is transmitted.
- Shared schemas for event payloads become a critical cross-client contract.
- Fusion and persistence services operate on normalized signals, not media artifacts.
