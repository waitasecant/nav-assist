package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"image/jpeg"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	ort "github.com/yalue/onnxruntime_go"

	"navassist/internal/commands"
	"navassist/internal/dashboard"
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
	recordDir      string
}

func parseConfig() config {
	var cfg config
	flag.StringVar(&cfg.modelPath,      "model",       "../model/yolov8n.onnx",     "path to yolov8n.onnx")
	flag.StringVar(&cfg.depthModelPath, "depth-model", "../model/midas_small.onnx", "path to MiDaS ONNX")
	flag.StringVar(&cfg.ortLib,         "ort",         "lib/onnxruntime.dll",       "path to ORT shared library")
	flag.StringVar(&cfg.port,           "port",        "8000",                      "listen port")
	flag.StringVar(&cfg.logPath,        "log",         "session.db",                "path to SQLite session log")
	flag.StringVar(&cfg.recordDir,      "record",      "",                          "directory for frame recordings (empty = disabled)")
	flag.Parse()
	return cfg
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// connCfg holds per-connection inference thresholds sent by the client.
type connCfg struct {
	Confidence float32
	ImmClose   float32
	CautClose  float32
}

func defaultConnCfg() connCfg {
	return connCfg{Confidence: 0.40, ImmClose: 0.75, CautClose: 0.45}
}

// statusSnapshot is the latest inference result, served at /status.
type statusSnapshot struct {
	FPS        float32              `json:"fps"`
	FrameCount int64                `json:"frame_count"`
	Tier       string               `json:"tier"`
	Detections []inference.Detection `json:"detections"`
	UpdatedAt  int64                `json:"updated_at"`
}

var (
	statusMu sync.RWMutex
	latest   statusSnapshot
)

// frame store — latest JPEG served at GET /frame
var (
	frameMu   sync.RWMutex
	frameJPEG []byte
)

func storeFrame(b []byte) {
	frameMu.Lock()
	frameJPEG = b
	frameMu.Unlock()
}

// ttcStore — closing-speed estimate from tools/ttc.py
var ttcStore struct {
	mu           sync.Mutex
	closingSpeed float32
}

func setTTC(v float32) {
	ttcStore.mu.Lock()
	ttcStore.closingSpeed = v
	ttcStore.mu.Unlock()
}

// recording support
var manifestMu sync.Mutex

type manifestEntry struct {
	TS         int64                 `json:"ts"`
	FrameID    int64                 `json:"frame_id"`
	File       string                `json:"file"`
	Detections []inference.Detection `json:"detections"`
}

func saveFrame(dir string, id int64, jpegData []byte, dets []inference.Detection) {
	name := fmt.Sprintf("frame_%06d.jpg", id)
	if err := os.WriteFile(filepath.Join(dir, name), jpegData, 0644); err != nil {
		slog.Warn("frame save failed", "err", err)
		return
	}
	entry := manifestEntry{TS: time.Now().UnixMilli(), FrameID: id, File: name, Detections: dets}
	b, _ := json.Marshal(entry)
	manifestMu.Lock()
	f, err := os.OpenFile(filepath.Join(dir, "manifest.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		f.Write(append(b, '\n'))
		f.Close()
	}
	manifestMu.Unlock()
}

func updateLatest(fps float32, count int64, dets []inference.Detection) {
	tier := "CLEAR"
	if len(dets) > 0 {
		tier = dets[0].Tier
	}
	statusMu.Lock()
	latest = statusSnapshot{FPS: fps, FrameCount: count, Tier: tier, Detections: dets, UpdatedAt: time.Now().UnixMilli()}
	statusMu.Unlock()
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

	if cfg.recordDir != "" {
		if err := os.MkdirAll(cfg.recordDir, 0755); err != nil {
			slog.Error("create record dir failed", "err", err)
			return
		}
		slog.Info("recording frames", "dir", cfg.recordDir)
	}

	http.Handle("/metrics", promhttp.Handler())
	http.HandleFunc("/ws", makeHandler(model, depthModel, log, cfg.recordDir))
	http.HandleFunc("/status", statusHandler)
	http.HandleFunc("/dashboard", dashboardHandler)
	http.HandleFunc("/fall", fallHandler)
	http.HandleFunc("/frame", frameHandler)
	http.HandleFunc("/ttc", ttcHandler)
	slog.Info("server listening", "addr", "0.0.0.0:"+cfg.port+"/ws")
	if err := http.ListenAndServe(":"+cfg.port, nil); err != nil {
		slog.Error("server failed", "err", err)
	}
}

type incomingMsg struct {
	Type       string  `json:"type"`
	Frame      string  `json:"frame"`
	Confidence float32 `json:"confidence"`
	ImmClose   float32 `json:"immClose"`
	CautClose  float32 `json:"cautClose"`
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

func makeHandler(model *inference.Model, depth *inference.DepthModel, log *logger.Logger, recordDir string) http.HandlerFunc {
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
		cfg := defaultConnCfg()

		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				slog.Info("client disconnected", "remote", r.RemoteAddr)
				break
			}

			var msg incomingMsg
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}

			if msg.Type == "config" {
				if msg.Confidence > 0 { cfg.Confidence = msg.Confidence }
				if msg.ImmClose > 0   { cfg.ImmClose   = msg.ImmClose }
				if msg.CautClose > 0  { cfg.CautClose  = msg.CautClose }
				slog.Info("client config updated", "conf", cfg.Confidence, "immClose", cfg.ImmClose, "cautClose", cfg.CautClose)
				continue
			}

			if msg.Frame == "" {
				continue
			}

			jpegBytes, err := base64.StdEncoding.DecodeString(msg.Frame)
			if err != nil {
				continue
			}
			storeFrame(jpegBytes)

			inferStart := time.Now()
			dets, err := model.RunWithConf(jpegBytes, cfg.Confidence)
			if err != nil {
				slog.Warn("inference error", "err", err)
				continue
			}

			if depth != nil {
				cfg2, err := jpeg.DecodeConfig(bytes.NewReader(jpegBytes))
				if err == nil {
					if closeness, err := depth.Run(jpegBytes); err == nil {
						dets = inference.AnnotateDepthWithThresholds(dets, closeness, cfg2.Width, cfg2.Height, cfg.ImmClose, cfg.CautClose)
					} else {
						slog.Warn("depth run failed", "err", err)
					}
				}
			}

			metrics.InferenceLatency.Observe(float64(time.Since(inferStart).Milliseconds()))

			count++
			if recordDir != "" {
				go saveFrame(recordDir, count, jpegBytes, dets)
			}
			fps := float32(count) / float32(time.Since(start).Seconds())
			metrics.ServerFPS.Set(float64(fps))
			cmds := commands.Build(dets, last)
			updateLatest(fps, count, dets)

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

func frameHandler(w http.ResponseWriter, r *http.Request) {
	frameMu.RLock()
	b := frameJPEG
	frameMu.RUnlock()
	if b == nil {
		http.Error(w, "no frame yet", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(b)
}

func ttcHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ClosingSpeed float32 `json:"closing_speed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	setTTC(body.ClosingSpeed)
	slog.Info("ttc received", "closing_speed", body.ClosingSpeed)
	w.WriteHeader(http.StatusNoContent)
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	statusMu.RLock()
	snap := latest
	statusMu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(snap)
}

func fallHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Lat *float64 `json:"lat"`
		Lon *float64 `json:"lon"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	loc := "unknown location"
	if body.Lat != nil && body.Lon != nil {
		loc = fmt.Sprintf("%.6f, %.6f", *body.Lat, *body.Lon)
	}
	slog.Warn("fall unacknowledged", "location", loc)

	if sid := os.Getenv("TWILIO_SID"); sid != "" {
		go func() {
			if err := sendSMS(
				sid,
				os.Getenv("TWILIO_TOKEN"),
				os.Getenv("TWILIO_FROM"),
				os.Getenv("TWILIO_TO"),
				fmt.Sprintf("NavAssist: fall detected at %s", loc),
			); err != nil {
				slog.Error("twilio send failed", "err", err)
			}
		}()
	}
	w.WriteHeader(http.StatusNoContent)
}

func sendSMS(sid, token, from, to, body string) error {
	vals := url.Values{"To": {to}, "From": {from}, "Body": {body}}
	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", sid),
		strings.NewReader(vals.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(sid, token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("twilio %d: %s", resp.StatusCode, b)
	}
	return nil
}

func dashboardHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, dashboard.HTML)
}
