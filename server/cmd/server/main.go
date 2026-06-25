package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"image/jpeg"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	ort "github.com/yalue/onnxruntime_go"

	"navassist/internal/commands"
	"navassist/internal/inference"
	"navassist/internal/logger"
	"navassist/internal/metrics"
)

type config struct {
	modelPath      string
	depthModelPath string
	ortLib         string
	port           string
	logPath        string
}

func parseConfig() config {
	var cfg config
	flag.StringVar(&cfg.modelPath,      "model",       "../model/yolov8n.onnx",     "path to yolov8n.onnx")
	flag.StringVar(&cfg.depthModelPath, "depth-model", "../model/midas_small.onnx", "path to MiDaS ONNX")
	flag.StringVar(&cfg.ortLib,         "ort",         "lib/onnxruntime.dll",       "path to ORT shared library")
	flag.StringVar(&cfg.port,           "port",        "8000",                      "listen port")
	flag.StringVar(&cfg.logPath,        "log",         "session.db",                "path to SQLite session log")
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

	var depthModel *inference.DepthModel
	if dm, err := inference.NewDepth(cfg.depthModelPath); err != nil {
		slog.Warn("depth model unavailable, falling back to area ratio", "err", err)
	} else {
		depthModel = dm
		defer depthModel.Close()
		slog.Info("depth model loaded", "path", cfg.depthModelPath)
	}

	slog.Info("model loaded", "path", cfg.modelPath)

	log, err := logger.New(cfg.logPath)
	if err != nil {
		slog.Warn("session logger unavailable", "err", err)
	} else {
		defer log.Close()
		slog.Info("session log opened", "path", cfg.logPath)
	}

	http.Handle("/metrics", promhttp.Handler())
	http.HandleFunc("/ws", makeHandler(model, depthModel, log))
	slog.Info("server listening", "addr", "0.0.0.0:"+cfg.port+"/ws")
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

func makeHandler(model *inference.Model, depth *inference.DepthModel, log *logger.Logger) http.HandlerFunc {
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

			inferStart := time.Now()
			dets, err := model.Run(jpegBytes)
			if err != nil {
				slog.Warn("inference error", "err", err)
				continue
			}

			if depth != nil {
				cfg2, err := jpeg.DecodeConfig(bytes.NewReader(jpegBytes))
				if err == nil {
					if closeness, err := depth.Run(jpegBytes); err == nil {
						dets = inference.AnnotateDepth(dets, closeness, cfg2.Width, cfg2.Height)
					} else {
						slog.Warn("depth run failed", "err", err)
					}
				}
			}

			metrics.InferenceLatency.Observe(float64(time.Since(inferStart).Milliseconds()))

			count++
			fps := float32(count) / float32(time.Since(start).Seconds())
			metrics.ServerFPS.Set(float64(fps))
			cmds := commands.Build(dets, last)

			if len(dets) > 0 {
				top := dets[0]
				metrics.TierTotal.WithLabelValues(top.Tier).Inc()
				if log != nil && top.Tier != "AWARE" {
					log.LogEvent(top.Tier, top.Label, top.Depth)
				}
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
