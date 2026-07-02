"""
One-time script: exports YOLOv8-nano and MiDaS-small to ONNX format.

On first run, ultralytics auto-downloads yolov8n.pt (~6 MB) and
torch.hub downloads MiDaS_small weights (~80 MB).
Produces model/yolov8n.onnx and model/midas_small.onnx at the project root.
Run from anywhere: python tools/export.py
"""

import shutil
from pathlib import Path
import torch
from ultralytics import YOLO

MODEL_DIR = Path(__file__).parent.parent / "model"
MODEL_DIR.mkdir(exist_ok=True)

# YOLOv8-nano
yolo_target = MODEL_DIR / "yolov8n.onnx"
if yolo_target.exists():
    print(f"[✓] Already exported: {yolo_target}")
else:
    print("[*] Loading YOLOv8-nano (downloads ~6 MB on first run)...")
    yolo = YOLO("yolov8n.pt")
    print("[*] Exporting to ONNX (opset 12)...")
    exported = Path(yolo.export(format="onnx", imgsz=640, opset=12))
    shutil.move(str(exported), str(yolo_target))
    print(f"[✓] Exported to: {yolo_target}")

# MiDaS-small
midas_target = MODEL_DIR / "midas_small.onnx"
if midas_target.exists():
    print(f"[✓] Already exported: {midas_target}")
else:
    print("[*] Loading MiDaS-small (downloads ~80 MB on first run)...")
    midas = torch.hub.load("intel-isl/MiDaS", "MiDaS_small", pretrained=True, trust_repo=True)
    midas.eval()
    dummy = torch.zeros(1, 3, 256, 256)
    print("[*] Exporting to ONNX (opset 12)...")
    torch.onnx.export(
        midas,
        dummy,
        str(midas_target),
        opset_version=12,
        input_names=["input"],
        output_names=["output"],
    )
    print(f"[✓] Exported to: {midas_target}")
