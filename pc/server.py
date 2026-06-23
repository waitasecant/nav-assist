import time
import base64
import json
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

connected_clients: list[WebSocket] = []


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)
    print("[+] Phone connected")

    frame_count = 0
    start = time.time()

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            frame_count += 1
            elapsed = time.time() - start
            fps = frame_count / elapsed if elapsed > 0 else 0

            frame_b64 = msg.get("frame", "")
            frame_bytes = len(base64.b64decode(frame_b64)) if frame_b64 else 0

            print(
                f"Frame {frame_count:04d} | {frame_bytes / 1024:.1f} KB | {fps:.1f} FPS",
                end="\r",
            )

            # Echo back ack so phone can compute round-trip latency
            await ws.send_json(
                {
                    "received_at": time.time(),
                    "frame_size_bytes": frame_bytes,
                    "frame_count": frame_count,
                    "server_fps": round(fps, 2),
                }
            )

    except WebSocketDisconnect:
        connected_clients.remove(ws)
        print(f"\n[-] Phone disconnected after {frame_count} frames")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
