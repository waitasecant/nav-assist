"""
One-time script: exports YOLOv8-nano to ONNX format and optionally quantizes to INT8.

On first run, ultralytics auto-downloads yolov8n.pt.
Produces model/yolov8n.onnx and model/yolov8n_int8.onnx at the project root.
Run from anywhere: python tools/export.py [--quantize]
"""

import argparse
import shutil
from pathlib import Path
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument(
    "--quantize", action="store_true", help="also produce INT8-quantized models"
)
args = parser.parse_args()

MODEL_DIR = Path(__file__).parent.parent / "model"
TARGET = MODEL_DIR / "yolov8n.onnx"

MODEL_DIR.mkdir(exist_ok=True)

if TARGET.exists():
    print(f"[✓] Already exported: {TARGET}")
else:
    print("[*] Loading YOLOv8-nano (downloads on first run)...")
    model = YOLO("yolov8n.pt")

    print("[*] Exporting to ONNX (opset 12, 320px)...")
    exported = Path(model.export(format="onnx", imgsz=320, opset=12))

    shutil.move(str(exported), str(TARGET))
    print(f"[✓] Exported to: {TARGET}")

if args.quantize:
    dst = MODEL_DIR / "yolov8n_int8.onnx"
    if dst.exists():
        print(f"[✓] Already exported: {dst}")
    else:
        print("[*] Exporting INT8 model (ultralytics native calibration on COCO)...")
        q_model = YOLO("yolov8n.pt")
        exported = Path(q_model.export(format="onnx", imgsz=320, opset=12, int8=True))
        shutil.move(str(exported), str(dst))
        size_mb = dst.stat().st_size / 1_048_576
        print(f"[✓] {dst.name}  ({size_mb:.1f} MB)")
