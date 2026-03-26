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


def load_scoring_criteria() -> Dict[str, Any]:
    criteria_path = os.environ.get(
        "ENGAGEMENT_SCORING_CRITERIA_PATH",
        os.path.join(os.path.dirname(__file__), "scoring_criteria.json"),
    )

    with open(criteria_path, "r", encoding="utf-8") as fp:
        criteria = json.load(fp)

    validate_scoring_criteria(criteria)
    return criteria


def validate_scoring_criteria(criteria: Dict[str, Any]) -> None:
    required_top_keys = [
        "weights",
        "signalValues",
        "headPoseThresholds",
        "score",
        "signalQualityThresholds",
        "faceWidth",
        "modelConfidenceBlend",
    ]
    for key in required_top_keys:
        if key not in criteria:
            raise ValueError(f"missing scoring criteria key: {key}")

    weights = criteria["weights"]
    required_weights = ["eyeState", "gazeDirection", "headPose", "faceWidthRatio", "detectionStability"]
    for key in required_weights:
        value = float(weights.get(key, -1.0))
        if value < 0.0 or value > 1.0:
            raise ValueError(f"invalid weight for {key}: {value}")

    total = sum(float(weights[key]) for key in required_weights)
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"weights must sum to 1.0, got {total}")

    score_cfg = criteria["score"]
    score_min = int(score_cfg["min"])
    score_max = int(score_cfg["max"])
    if score_min < 0 or score_max > 100 or score_min >= score_max:
        raise ValueError("score min/max criteria are invalid")

    thresholds = score_cfg["categoryThresholds"]
    engaged_min = int(thresholds["engagedMin"])
    neutral_min = int(thresholds["neutralMin"])
    if not (score_min <= neutral_min <= engaged_min <= score_max):
        raise ValueError("category thresholds are out of order")


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


def infer_from_face_and_eyes(models: AnalyzerModels, img: Optional[np.ndarray], criteria: Dict[str, Any]) -> Dict[str, Any]:
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
    stable_cfg = criteria["headPoseThresholds"]["stable"]
    tilted_cfg = criteria["headPoseThresholds"]["tilted"]

    if face_conf >= float(stable_cfg["minFaceConfidence"]) and face_width_ratio >= float(stable_cfg["minFaceWidthRatio"]):
        head_pose = "stable"
    elif face_conf >= float(tilted_cfg["minFaceConfidence"]) and face_width_ratio >= float(tilted_cfg["minFaceWidthRatio"]):
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


def signal_value_from_eye_state(state: str, criteria: Dict[str, Any]) -> float:
    return float(criteria["signalValues"]["eyeState"].get(state, 0.0))


def signal_value_from_gaze(direction: str, criteria: Dict[str, Any]) -> float:
    return float(criteria["signalValues"]["gazeDirection"].get(direction, 0.0))


def signal_value_from_pose(pose: str, criteria: Dict[str, Any]) -> float:
    return float(criteria["signalValues"]["headPose"].get(pose, 0.0))


def category_for_score(score: int, criteria: Dict[str, Any]) -> str:
    thresholds = criteria["score"]["categoryThresholds"]
    if score >= int(thresholds["engagedMin"]):
        return "engaged"
    if score >= int(thresholds["neutralMin"]):
        return "neutral"
    return "disengaged"


def analyze(payload: Dict[str, Any], models: AnalyzerModels, criteria: Dict[str, Any]) -> Dict[str, Any]:
    t0 = time.perf_counter()
    img = decode_data_url(payload.get("faceCropDataUrl"))
    detector_features = infer_from_face_and_eyes(models, img, criteria)

    face_width_cfg = criteria["faceWidth"]
    confidence = float(clamp(float(payload.get("confidence", 0.0)), 0.0, 1.0))
    incoming_width_ratio = float(
        clamp(
            float(payload.get("faceWidthRatio", 0.16)),
            float(face_width_cfg["min"]),
            float(face_width_cfg["max"]),
        )
    )
    detected_width_ratio = float(
        clamp(
            float(detector_features.get("face_width_ratio", incoming_width_ratio)),
            float(face_width_cfg["min"]),
            float(face_width_cfg["max"]),
        )
    )
    face_width_ratio = (
        incoming_width_ratio * float(face_width_cfg["incomingBlend"])
        + detected_width_ratio * float(face_width_cfg["detectedBlend"])
    )
    detection_stability = float(clamp(float(payload.get("detectionStability", confidence)), 0.0, 1.0))

    eye_state = detector_features["eye_state"]
    gaze_direction = detector_features["gaze_direction"]
    head_pose = detector_features["head_pose"]
    face_confidence = float(detector_features.get("face_confidence", 0.0))
    eye_confidence = float(detector_features.get("eye_confidence", 0.0))
    model_confidence_cfg = criteria["modelConfidenceBlend"]
    model_confidence = (
        face_confidence * float(model_confidence_cfg["faceWeight"])
        + eye_confidence * float(model_confidence_cfg["eyeWeight"])
    )

    weights = criteria["weights"]

    normalized = (
        signal_value_from_eye_state(eye_state, criteria) * float(weights["eyeState"])
        + signal_value_from_gaze(gaze_direction, criteria) * float(weights["gazeDirection"])
        + signal_value_from_pose(head_pose, criteria) * float(weights["headPose"])
        + (face_width_ratio / float(face_width_cfg["normalizationMax"])) * float(weights["faceWidthRatio"])
        + detection_stability * float(weights["detectionStability"])
    )

    score = int(round(clamp(normalized, 0.0, 1.0) * 100.0))
    score_cfg = criteria["score"]
    score = max(int(score_cfg["min"]), min(int(score_cfg["max"]), score))

    signal_quality = "stable"
    quality_cfg = criteria["signalQualityThresholds"]
    if not payload.get("facePresent", False) or confidence < float(quality_cfg["insufficientConfidenceMax"]):
        signal_quality = "insufficient"
    elif confidence < float(quality_cfg["unstableConfidenceMax"]):
        signal_quality = "unstable"

    latency_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "engagementScore": score,
        "category": category_for_score(score, criteria),
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
    criteria = load_scoring_criteria()
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
                    "result": analyze(payload, models, criteria),
                }
            else:
                response = {"id": req_id, "ok": False, "error": "unsupported-message"}
        except Exception as ex:
            response = {"id": None, "ok": False, "error": str(ex)}

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
