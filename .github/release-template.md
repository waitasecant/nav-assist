**Full changelog:** {{COMPARE_URL}}

---

## Installation

### Server

Download the bundle for your OS from the assets below, unzip, and run:

| Bundle | Platform |
|--------|----------|
| `navassist-server-windows-amd64.zip` | Windows laptop |
| `navassist-server-linux-amd64.zip` | Linux laptop |
| `navassist-server-linux-arm64.zip` | Raspberry Pi 4/5 |

```
navassist-server(.exe)
```

ONNX models (`yolov8n.onnx`, `midas_small.onnx`) are downloaded automatically on first launch — no manual setup needed.

### Phone

Download `navassist.apk` from the assets below and sideload it:
- Enable **Install from unknown sources** when prompted.
- Or install via ADB: `adb install navassist.apk`

---

## Connecting phone to server

**Option A — Wi-Fi / mDNS (easiest)**
Connect phone and laptop to the same Wi-Fi network. The app discovers the server automatically — no configuration needed.

**Option B — ADB Wi-Fi (lower latency)**
Enable *Wireless debugging* on the phone, pair once with `adb pair`, then `adb connect`. The server sets up the tunnel automatically.

**Option C — USB cable (lowest latency)**
Connect via USB with USB Debugging enabled. The server sets up the tunnel automatically.

In all ADB modes, leave *Server IP* blank in the app settings.

---

## Assets

| File | Description |
|------|-------------|
| `navassist-server-windows-amd64.zip` | Server binary + ORT DLL for Windows |
| `navassist-server-linux-amd64.zip` | Server binary + ORT .so for Linux x64 |
| `navassist-server-linux-arm64.zip` | Server binary + ORT .so for Linux arm64 |
| `navassist.apk` | Android app |
| `yolov8n.onnx` | YOLOv8-nano detection model |
| `midas_small.onnx` | MiDaS v2.1 depth model |
