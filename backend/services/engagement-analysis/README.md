# Engagement Analysis Service (YOLOv8)

This service runs backend engagement analysis behind `POST /api/analyze-engagement`.

## Runtime Path

- Node server endpoint calls a persistent Python worker.
- Worker loads dedicated `ultralytics` YOLOv8 face and eye models:
  - `backend/services/engagement-analysis/models/yolov8-face.pt`
  - `backend/services/engagement-analysis/models/yolov8-eye.pt`
- Per frame, it infers eye/gaze/head-pose states from those dedicated detections and returns:
  - `engagementScore` (1-100)
  - `category` (`engaged|neutral|disengaged`)
  - signal quality + model telemetry (`analysisLatencyMs`, `inferenceFps`, `modelConfidence`).

The runtime is strict YOLO-only and does not use heuristic fallback scoring.

## Setup

1. Install Python dependencies:

```bash
npm run setup:ml
```

2. Start server:

```bash
npm run start:server
```

3. Verify model health + telemetry:

```bash
npm run check:ml
```

## API Endpoints

- `POST /api/analyze-engagement`
- `GET /api/analyze-engagement/health`
- `GET /api/analyze-engagement/telemetry`
