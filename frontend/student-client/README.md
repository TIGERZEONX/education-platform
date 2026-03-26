# Student Client

## Scope
Student-side browser client for CognitivePulse.

## Structural Modules
- src/app: app shell and session lifecycle wiring.
- src/vision: browser-local vision capture and landmark processing adapters.
- src/feedback: one-tap explicit feedback actions (confused, repeat, understood).
- src/realtime: MQTT over WebSockets publishing integration.
- src/state: client state containers and selectors.
- src/types: student-side domain and transport types.

## Boundary
This module publishes normalized numeric engagement and explicit feedback events only.
No raw video leaves the browser.
