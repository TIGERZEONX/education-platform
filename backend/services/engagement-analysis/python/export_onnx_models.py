import os
from ultralytics import YOLO


def export_model(pt_path: str, onnx_path: str) -> None:
    model = YOLO(pt_path)
    model.export(format="onnx", simplify=True, opset=12, imgsz=640)

    default_export = os.path.splitext(pt_path)[0] + ".onnx"
    if os.path.exists(default_export) and default_export != onnx_path:
        os.replace(default_export, onnx_path)


def main() -> None:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    models_dir = os.path.join(root, "models")

    face_pt = os.path.join(models_dir, "yolov8-face.pt")
    eye_pt = os.path.join(models_dir, "yolov8-eye.pt")
    face_onnx = os.path.join(models_dir, "yolov8-face.onnx")
    eye_onnx = os.path.join(models_dir, "yolov8-eye.onnx")

    if not os.path.exists(face_pt) or not os.path.exists(eye_pt):
        raise FileNotFoundError("Missing YOLO .pt model files in backend/services/engagement-analysis/models")

    export_model(face_pt, face_onnx)
    export_model(eye_pt, eye_onnx)

    print("[export-onnx] generated:", face_onnx)
    print("[export-onnx] generated:", eye_onnx)


if __name__ == "__main__":
    main()
