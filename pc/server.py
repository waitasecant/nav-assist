import asyncio
import time
import base64
import json
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from model.inference import YOLOInference

MODEL_PATH = "model/yolov8n.onnx"

app = FastAPI()
model = YOLOInference(MODEL_PATH)

TIER_ICON = {"IMMEDIATE": "🚨", "CAUTION": "⚠️ ", "AWARE": "ℹ️ "}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print("[+] Phone connected")

    frame_count = 0
    start = time.time()
    loop = asyncio.get_running_loop()

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            frame_count += 1
            fps = frame_count / (time.time() - start)

            frame_b64 = msg.get("frame", "")
            frame_bytes = base64.b64decode(frame_b64) if frame_b64 else b""

            # Run blocking ONNX inference in thread pool — keeps event loop free
            detections = await loop.run_in_executor(None, model.run, frame_bytes)

            if detections:
                top = detections[0]
                icon = TIER_ICON.get(top["tier"], "  ")
                print(
                    f"\r{icon} {top['tier']:9s} | {top['label']:16s} "
                    f"{top['area_ratio'] * 100:5.1f}% | {fps:.1f} FPS | "
                    f"frame {frame_count:04d}   ",
                    end="",
                )
            else:
                print(
                    f"\r✅ CLEAR     |                   {'':5s}  | "
                    f"{fps:.1f} FPS | frame {frame_count:04d}   ",
                    end="",
                )

            await ws.send_json(
                {
                    "received_at": time.time(),
                    "frame_count": frame_count,
                    "server_fps": round(fps, 2),
                    "detections": detections,
                }
            )

    except WebSocketDisconnect:
        print(f"\n[-] Phone disconnected after {frame_count} frames")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
