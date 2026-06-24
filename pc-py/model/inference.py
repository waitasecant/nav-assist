"""
Pure onnxruntime inference module for YOLOv8-nano.
Execution provider priority: CUDA > DirectML (Windows GPU) > CPU
"""
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

# COCO class names (80 classes)
COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
    "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag",
    "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard",
    "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon",
    "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot",
    "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
    "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
    "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
]

# Hazard thresholds (fraction of total frame area)
IMMEDIATE_THRESHOLD = 0.45   # > 45 % → IMMEDIATE_HAZARD
CAUTION_THRESHOLD   = 0.15   # 15–45 % → CAUTION
                             # < 15 % → AWARE

CONF_THRESH  = 0.40
IOU_THRESH   = 0.45
INPUT_SIZE   = 640


def _classify_tier(area_ratio: float) -> str:
    if area_ratio > IMMEDIATE_THRESHOLD:
        return "IMMEDIATE"
    if area_ratio > CAUTION_THRESHOLD:
        return "CAUTION"
    return "AWARE"


class YOLOInference:
    """Loads a YOLOv8 ONNX model and runs inference on raw JPEG bytes."""

    def __init__(self, model_path: str) -> None:
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(
                f"Model not found: {path}\n"
                "Run:  python export.py"
            )

        # Prefer GPU providers when available; fall back to CPU
        desired = [
            "CUDAExecutionProvider",
            "DmlExecutionProvider",      # DirectML — any Windows GPU
            "CPUExecutionProvider",
        ]
        available = set(ort.get_available_providers())
        providers = [p for p in desired if p in available]

        self._session = ort.InferenceSession(str(path), providers=providers)
        self._input_name = self._session.get_inputs()[0].name
        active_ep = self._session.get_providers()[0]
        print(f"[YOLO] Model: {path.name}  |  EP: {active_ep}")

    def run(self, frame_bytes: bytes) -> list[dict]:
        """
        Args:
            frame_bytes: raw JPEG bytes from the phone.
        Returns:
            List of detections sorted by area_ratio descending (closest first).
            Each item: {label, conf, area_ratio, tier}
        """
        arr = np.frombuffer(frame_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return []

        orig_h, orig_w = img.shape[:2]
        tensor, sx, sy = self._preprocess(img)

        output = self._session.run(None, {self._input_name: tensor})[0]  # [1,84,8400]

        return self._postprocess(output, sx, sy, orig_w * orig_h)

    @staticmethod
    def _preprocess(img: np.ndarray) -> tuple[np.ndarray, float, float]:
        """Resize, normalise, convert to NCHW float32. Returns (tensor, sx, sy)."""
        orig_h, orig_w = img.shape[:2]
        resized = cv2.resize(img, (INPUT_SIZE, INPUT_SIZE))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        tensor = (rgb.astype(np.float32) / 255.0).transpose(2, 0, 1)[np.newaxis]
        return tensor, orig_w / INPUT_SIZE, orig_h / INPUT_SIZE

    @staticmethod
    def _postprocess(
        output: np.ndarray,
        sx: float,
        sy: float,
        frame_area: int,
    ) -> list[dict]:
        """
        Decode YOLOv8 ONNX output [1, 84, 8400].
        Columns 0-3: cx, cy, w, h (in INPUT_SIZE coords)
        Columns 4-83: class probabilities
        """
        preds = output[0].T  # → [8400, 84]

        class_scores = preds[:, 4:]
        confidences  = class_scores.max(axis=1)
        class_ids    = class_scores.argmax(axis=1)

        mask = confidences > CONF_THRESH
        if not mask.any():
            return []

        cx = preds[mask, 0] * sx
        cy = preds[mask, 1] * sy
        bw = preds[mask, 2] * sx
        bh = preds[mask, 3] * sy
        confs    = confidences[mask]
        cls_ids  = class_ids[mask]

        # NMS expects [x, y, w, h] with x,y as top-left
        boxes_xywh = np.stack([cx - bw / 2, cy - bh / 2, bw, bh], axis=1).tolist()
        indices = cv2.dnn.NMSBoxes(
            boxes_xywh, confs.tolist(), CONF_THRESH, IOU_THRESH
        )

        if len(indices) == 0:
            return []

        results = []
        for i in indices.flatten():
            area_ratio = float(bw[i] * bh[i]) / frame_area
            results.append({
                "label":      COCO_CLASSES[int(cls_ids[i])],
                "conf":       round(float(confs[i]), 2),
                "area_ratio": round(area_ratio, 4),
                "tier":       _classify_tier(area_ratio),
            })

        results.sort(key=lambda d: d["area_ratio"], reverse=True)
        return results
