"""
Smoke test for ONNX models used by the NavAssist server.
Loads each model, runs a blank input, and asserts output shapes.
"""

from pathlib import Path
import numpy as np
import onnxruntime as ort

MODEL_DIR = Path(__file__).parent.parent / "model"


def test_yolo():
    path = MODEL_DIR / "yolov8n.onnx"
    assert path.exists(), f"Model not found: {path}"

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    dummy = np.zeros((1, 3, 640, 640), dtype=np.float32)
    outputs = session.run(None, {input_name: dummy})

    # YOLOv8-nano: [1, 84, 8400]  (4 box coords + 80 classes, 8400 anchors)
    shape = tuple(outputs[0].shape)
    assert shape == (1, 84, 8400), f"Unexpected YOLO output shape: {shape}"
    print(f"[✓] yolov8n.onnx  output shape: {shape}")


def test_midas():
    path = MODEL_DIR / "midas_small.onnx"
    assert path.exists(), f"Model not found: {path}"

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    inp = session.get_inputs()[0]
    # MiDaS small expects (1, 3, 256, 256)
    dummy = np.zeros((1, 3, 256, 256), dtype=np.float32)
    outputs = session.run(None, {inp.name: dummy})

    h, w = outputs[0].shape[-2], outputs[0].shape[-1]
    assert h > 0 and w > 0, f"Unexpected MiDaS output shape: {outputs[0].shape}"
    print(f"[✓] midas_small.onnx output shape: {tuple(outputs[0].shape)}")


if __name__ == "__main__":
    test_yolo()
    test_midas()
    print("[✓] All smoke tests passed")
