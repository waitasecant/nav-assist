"""
Time-to-Collision (TTC) estimator.

Polls GET /frame from the Go server, computes Farneback optical flow between
consecutive frames, estimates closing speed for the nearest detected object,
and POSTs the result to /ttc every --interval seconds.

Usage:
    python tools/ttc.py [--server http://localhost:8000] [--interval 1.0]

Requires: opencv-python, numpy, requests
"""

import argparse
import time

import cv2
import numpy as np
import requests


def fetch_frame(server: str) -> np.ndarray | None:
    try:
        resp = requests.get(f"{server}/frame", timeout=2)
        resp.raise_for_status()
        arr = np.frombuffer(resp.content, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    except Exception:
        return None


def fetch_detections(server: str) -> list:
    try:
        return (
            requests.get(f"{server}/status", timeout=2).json().get("detections") or []
        )
    except Exception:
        return []


def bbox_flow_magnitude(flow: np.ndarray, dets: list) -> float:
    """Mean optical-flow magnitude inside the bounding box of the top detection."""
    if not dets:
        return 0.0
    mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
    d = dets[0]
    x1, y1, x2, y2 = (int(v) for v in d.get("bbox", [0, 0, 0, 0]))
    h, w = flow.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return float(mag.mean())
    return float(mag[y1:y2, x1:x2].mean())


def main():
    parser = argparse.ArgumentParser(description="NavAssist TTC estimator")
    parser.add_argument("--server", default="http://localhost:8000")
    parser.add_argument(
        "--interval", type=float, default=1.0, help="POST interval in seconds"
    )
    args = parser.parse_args()

    print("[*] TTC estimator started")
    prev_gray = None
    next_post = time.time()

    while True:
        gray = fetch_frame(args.server)
        if gray is None:
            time.sleep(0.1)
            continue

        if prev_gray is not None and prev_gray.shape == gray.shape:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray,
                gray,
                None,
                pyr_scale=0.5,
                levels=3,
                winsize=15,
                iterations=3,
                poly_n=5,
                poly_sigma=1.2,
                flags=0,
            )
            if time.time() >= next_post:
                dets = fetch_detections(args.server)
                speed = bbox_flow_magnitude(flow, dets)
                try:
                    requests.post(
                        f"{args.server}/ttc",
                        json={"closing_speed": speed},
                        timeout=2,
                    )
                    print(f"[ttc] closing_speed={speed:.3f}")
                except Exception as e:
                    print(f"[warn] {e}")
                next_post = time.time() + args.interval

        prev_gray = gray
        time.sleep(0.033)  # ~30 Hz polling


if __name__ == "__main__":
    main()
