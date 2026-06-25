package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	ort "github.com/yalue/onnxruntime_go"

	"navassist/internal/commands"
	"navassist/internal/inference"
)

type config struct {
	modelPath string
	ortLib    string
	port      string
}

func parseConfig() config {
	var cfg config
	flag.StringVar(&cfg.modelPath, "model", "../model/yolov8n.onnx", "path to yolov8n.onnx")
	flag.StringVar(&cfg.ortLib,    "ort",   "lib/onnxruntime.dll",   "path to ORT shared library")
	flag.StringVar(&cfg.port,      "port",  "8000",                  "listen port")
	flag.Parse()
	return cfg
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	cfg := parseConfig()

	ort.SetSharedLibraryPath(cfg.ortLib)
	if err := ort.InitializeEnvironment(); err != nil {
		slog.Error("ort init failed", "err", err)
		return
	}
	defer ort.DestroyEnvironment()

	model, err := inference.New(cfg.modelPath)
	if err != nil {
		slog.Error("load model failed", "path", cfg.modelPath, "err", err)
		return
	}
	defer model.Close()

	slog.Info("model loaded", "path", cfg.modelPath)
	slog.Info("server listening", "addr", "0.0.0.0:"+cfg.port+"/ws")

	http.HandleFunc("/ws", makeHandler(model))
	if err := http.ListenAndServe(":"+cfg.port, nil); err != nil {
		slog.Error("server failed", "err", err)
	}
}

type frameMsg struct {
	Frame string `json:"frame"`
}

type responseMsg struct {
	ReceivedAt float64               `json:"received_at"`
	FrameCount int64                 `json:"frame_count"`
	ServerFPS  float32               `json:"server_fps"`
	Detections []inference.Detection `json:"detections"`
	Commands   []commands.Command    `json:"commands"`
}

func tierIcon(tier string) string {
	switch tier {
	case "IMMEDIATE":
		return "🚨"
	case "CAUTION":
		return "⚠️ "
	default:
		return "ℹ️ "
	}
}

func makeHandler(model *inference.Model) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Error("ws upgrade failed", "err", err)
			return
		}
		defer conn.Close()

		slog.Info("client connected", "remote", r.RemoteAddr)
		start := time.Now()
		var count int64
		last := &commands.LastSpoken{}

		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				slog.Info("client disconnected", "remote", r.RemoteAddr)
				break
			}

			var msg frameMsg
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}

			jpegBytes, err := base64.StdEncoding.DecodeString(msg.Frame)
			if err != nil {
				continue
			}

			dets, err := model.Run(jpegBytes)
			if err != nil {
				slog.Warn("inference error", "err", err)
				continue
			}

			count++
			fps := float32(count) / float32(time.Since(start).Seconds())
			cmds := commands.Build(dets, last)

			if len(dets) > 0 {
				top := dets[0]
				fmt.Printf("\r%s %-9s | %-16s area: %5.1f%% | %.1f FPS | frame %04d   ",
					tierIcon(top.Tier), top.Tier, top.Label, top.AreaRatio*100, fps, count)
			} else {
				fmt.Printf("\r✅ CLEAR     |                  area:   0.0%% | %.1f FPS | frame %04d   ",
					fps, count)
			}

			resp := responseMsg{
				ReceivedAt: float64(time.Now().UnixMilli()) / 1000.0,
				FrameCount: count,
				ServerFPS:  fps,
				Detections: dets,
				Commands:   cmds,
			}
			if err := conn.WriteJSON(resp); err != nil {
				break
			}
		}
		fmt.Printf("\n[-] Phone disconnected after %d frames\n", count)
	}
}
