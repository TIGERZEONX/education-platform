# Teacher Dashboard

## Scope
Teacher-facing browser dashboard for classroom pulse intelligence.

## Structural Modules
- src/app: dashboard shell and class session orchestration.
- src/realtime: MQTT over WebSockets subscription integration.
- src/pulse: class-level aggregation view models.
- src/alerts: live attention and confusion alert surfaces.
- src/suggestions: adaptive teaching suggestion presentation layer.
- src/state: dashboard state management.
- src/types: dashboard domain and transport types.

## Boundary
This module subscribes to student signals and renders real-time intelligence.
It does not process raw video.
