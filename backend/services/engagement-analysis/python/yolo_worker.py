import base64
import contextlib
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import cv2
import numpy as np
from ultralytics import YOLO


@dataclass
class AnalyzerModels:
    face_model: YOLO
    eye_model: YOLO


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def decode_data_url(data_url: Optional[str]) -> Optional[np.ndarray]:
    if not data_url or "," not in data_url:
        return None

    try:
        _, payload = data_url.split(",", 1)
        binary = base64.b64decode(payload)
        arr = np.frombuffer(binary, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def infer_from_face_and_eyes(models: AnalyzerModels, img: Optional[np.ndarray]) -> Dict[str, Any]:
    if img is None:
        return {
            "face_confidence": 0.0,
            "eye_confidence": 0.0,
            "eye_state": "unstable",
            "gaze_direction": "distracted",
            "head_pose": "extreme",
            "face_present": False,
            "face_width_ratio": 0.0,
        }

    face_result = models.face_model.predict(img, verbose=False, imgsz=640, conf=0.2, max_det=1)
    if not face_result:
        return {
            "face_confidence": 0.0,
            "eye_confidence": 0.0,
            "eye_state": "unstable",
            "gaze_direction": "distracted",
            "head_pose": "extreme",
            "face_present": False,
            "face_width_ratio": 0.0,
        }

    pred = face_result[0]
    boxes = pred.boxes

    if boxes is None or len(boxes) == 0:
        return {
            "face_confidence": 0.0,
            "eye_confidence": 0.0,
            "eye_state": "unstable",
            "gaze_direction": "distracted",
            "head_pose": "extreme",
            "face_present": False,
            "face_width_ratio": 0.0,
        }

    face_conf = float(boxes.conf[0].item()) if boxes.conf is not None else 0.0
    xyxy = boxes.xyxy[0].cpu().numpy()
    x1, y1, x2, y2 = [int(v) for v in xyxy]

    h, w = img.shape[:2]
    x1 = max(0, min(x1, w - 1))
    x2 = max(1, min(x2, w))
    y1 = max(0, min(y1, h - 1))
    y2 = max(1, min(y2, h))
    if x2 <= x1 or y2 <= y1:
        return {
            "face_confidence": face_conf,
            "eye_confidence": 0.0,
            "eye_state": "unstable",
            "gaze_direction": "distracted",
            "head_pose": "extreme",
            "face_present": False,
            "face_width_ratio": 0.0,
        }

    face_crop = img[y1:y2, x1:x2]
    face_width_ratio = (x2 - x1) / max(w, 1)

    eye_result = models.eye_model.predict(face_crop, verbose=False, imgsz=320, conf=0.2, max_det=2)
    eye_centers = []
    eye_confs = []
    if eye_result:
                eye_pred = eye_result[0]
                eye_boxes = eye_pred.boxes
                if eye_boxes is not None and len(eye_boxes) > 0:
                        for i in range(min(2, len(eye_boxes))):
                                ex1, ey1, ex2, ey2 = eye_boxes.xyxy[i].cpu().numpy()
                                eye_centers.append(((ex1 + ex2) / 2.0, (ey1 + ey2) / 2.0))
                                eye_confs.append(float(eye_boxes.conf[i].item()) if eye_boxes.conf is not None else 0.0)

    eye_conf = float(np.mean(eye_confs)) if eye_confs else 0.0

    if len(eye_centers) >= 2:
        eye_centers = sorted(eye_centers, key=lambda p: p[0])
        left_eye, right_eye = eye_centers[0], eye_centers[1]
        face_center_x = (face_crop.shape[1]) / 2.0
        eyes_center_x = (left_eye[0] + right_eye[0]) / 2.0
        eye_span = max(1.0, abs(right_eye[0] - left_eye[0]))
        gaze_offset = abs(eyes_center_x - face_center_x) / eye_span
        gaze_direction = "focused" if gaze_offset < 0.4 else "distracted"
        eye_state = "open" if eye_conf >= 0.35 else "unstable"
    elif len(eye_centers) == 1:
        gaze_direction = "distracted"
        eye_state = "closed" if eye_conf >= 0.35 else "unstable"
    else:
        gaze_direction = "distracted"
        eye_state = "unstable"

    # Use dedicated face detector geometry and confidence to infer head pose class.
    if face_conf >= 0.7 and face_width_ratio >= 0.14:
        head_pose = "stable"
    elif face_conf >= 0.45 and face_width_ratio >= 0.1:
        head_pose = "tilted"
    else:
        head_pose = "extreme"

    return {
        "face_confidence": clamp(face_conf, 0.0, 1.0),
        "eye_confidence": clamp(eye_conf, 0.0, 1.0),
        "eye_state": eye_state,
        "gaze_direction": gaze_direction,
        "head_pose": head_pose,
        "face_present": True,
        "face_width_ratio": clamp(face_width_ratio, 0.0, 1.0),
    }


def signal_value_from_eye_state(state: str) -> float:
    if state == "open":
        return 1.0
    if state == "unstable":
        return 0.42
    return 0.22


def signal_value_from_gaze(direction: str) -> float:
    return 1.0 if direction == "focused" else 0.25


def signal_value_from_pose(pose: str) -> float:
    if pose == "stable":
        return 1.0
    if pose == "tilted":
        return 0.56
    return 0.2


def category_for_score(score: int) -> str:
    if score >= 67:
        return "engaged"
    if score >= 34:
        return "neutral"
    return "disengaged"


def analyze(payload: Dict[str, Any], models: AnalyzerModels) -> Dict[str, Any]:
    t0 = time.perf_counter()
    img = decode_data_url(payload.get("faceCropDataUrl"))
    detector_features = infer_from_face_and_eyes(models, img)

    confidence = float(clamp(float(payload.get("confidence", 0.0)), 0.0, 1.0))
    incoming_width_ratio = float(clamp(float(payload.get("faceWidthRatio", 0.16)), 0.08, 0.40))
    detected_width_ratio = float(clamp(float(detector_features.get("face_width_ratio", incoming_width_ratio)), 0.08, 0.40))
    face_width_ratio = (incoming_width_ratio * 0.3) + (detected_width_ratio * 0.7)
    detection_stability = float(clamp(float(payload.get("detectionStability", confidence)), 0.0, 1.0))

    eye_state = detector_features["eye_state"]
    gaze_direction = detector_features["gaze_direction"]
    head_pose = detector_features["head_pose"]
    face_confidence = float(detector_features.get("face_confidence", 0.0))
    eye_confidence = float(detector_features.get("eye_confidence", 0.0))
    model_confidence = (face_confidence * 0.65) + (eye_confidence * 0.35)

    normalized = (
        signal_value_from_eye_state(eye_state) * 0.25
        + signal_value_from_gaze(gaze_direction) * 0.35
        + signal_value_from_pose(head_pose) * 0.15
        + (face_width_ratio / 0.40) * 0.10
        + detection_stability * 0.15
    )

    score = int(round(clamp(normalized, 0.0, 1.0) * 100.0))
    score = max(1, min(100, score))

    signal_quality = "stable"
    if not payload.get("facePresent", False) or confidence < 0.35:
        signal_quality = "insufficient"
    elif confidence < 0.6:
        signal_quality = "unstable"

    latency_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "engagementScore": score,
        "category": category_for_score(score),
        "confidence": confidence,
        "eyeState": eye_state,
        "gazeDirection": gaze_direction,
        "headPose": head_pose,
        "signalQuality": signal_quality,
        "modelVersion": "yolov8-face-eye-v1",
        "analysisLatencyMs": round(latency_ms, 2),
        "inferenceFps": round(1000.0 / max(latency_ms, 1.0), 2),
        "backendModel": "hf:arnabdhar/YOLOv8-Face-Detection + hf:hugolb/yolo8-eyes",
        "modelConfidence": round(float(model_confidence), 3),
    }


def main() -> None:
    os.environ.setdefault("YOLO_VERBOSE", "False")
    face_model_path = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "models",
            "yolov8-face.pt",
        )
    )
    eye_model_path = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "models",
            "yolov8-eye.pt",
        )
    )
    with contextlib.redirect_stdout(sys.stderr):
        models = AnalyzerModels(
            face_model=YOLO(face_model_path),
            eye_model=YOLO(eye_model_path),
        )

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
            req_id = message.get("id")
            msg_type = message.get("type")

            if msg_type == "health":
                response = {
                    "id": req_id,
                    "ok": True,
                    "result": {
                        "ready": True,
                        "modelVersion": "yolov8-face-eye-v1",
                        "backendModel": "hf:arnabdhar/YOLOv8-Face-Detection + hf:hugolb/yolo8-eyes",
                    },
                }
            elif msg_type == "analyze":
                payload = message.get("payload", {})
                response = {
                    "id": req_id,
                    "ok": True,
                    "result": analyze(payload, models),
                }
            else:
                response = {"id": req_id, "ok": False, "error": "unsupported-message"}
        except Exception as ex:
            response = {"id": None, "ok": False, "error": str(ex)}

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
