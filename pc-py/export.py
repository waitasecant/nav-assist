"""
One-time script: exports YOLOv8-nano to ONNX format.

On first run, ultralytics auto-downloads yolov8n.pt (~6 MB).
Produces yolov8n.onnx in the same directory as this script.
"""
import shutil
from pathlib import Path
from ultralytics import YOLO

MODEL_DIR = Path(__file__).parent / "model"
TARGET = MODEL_DIR / "yolov8n.onnx"

MODEL_DIR.mkdir(exist_ok=True)

if TARGET.exists():
    print(f"[✓] Already exported: {TARGET}")
else:
    print("[*] Loading YOLOv8-nano (downloads ~6 MB on first run)...")
    model = YOLO("yolov8n.pt")

    print("[*] Exporting to ONNX (opset 12)...")
    exported = Path(model.export(format="onnx", imgsz=640, opset=12))

    shutil.move(str(exported), str(TARGET))
    print(f"[✓] Exported to: {TARGET}")

print("\nNext step: python server.py")
