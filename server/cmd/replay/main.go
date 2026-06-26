// replay re-runs YOLO inference on a recording produced by the server's
// --record flag and prints per-frame comparisons against the recorded detections.
//
// Usage:
//
//	cd server
//	go run ./cmd/replay -dir ../recordings/20260627_120000 [-model ...] [-ort ...]
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"navassist/internal/inference"

	ort "github.com/yalue/onnxruntime_go"
)

type manifestEntry struct {
	TS         int64                 `json:"ts"`
	FrameID    int64                 `json:"frame_id"`
	File       string                `json:"file"`
	Detections []inference.Detection `json:"detections"`
}

func main() {
	modelPath := flag.String("model", "../../model/yolov8n.onnx", "path to yolov8n.onnx")
	ortLib := flag.String("ort", "lib/onnxruntime.dll", "path to ORT shared library")
	dir := flag.String("dir", "", "recording directory (required)")
	conf := flag.Float64("conf", 0.40, "confidence threshold")
	flag.Parse()

	if *dir == "" {
		fmt.Fprintln(os.Stderr, "usage: replay -dir <recording_dir> [-model ...] [-ort ...]")
		os.Exit(1)
	}

	ort.SetSharedLibraryPath(*ortLib)
	if err := ort.InitializeEnvironment(); err != nil {
		slog.Error("ort init failed", "err", err)
		return
	}
	defer ort.DestroyEnvironment()

	model, err := inference.New(*modelPath)
	if err != nil {
		slog.Error("load model failed", "err", err)
		return
	}
	defer model.Close()

	f, err := os.Open(filepath.Join(*dir, "manifest.jsonl"))
	if err != nil {
		slog.Error("open manifest failed", "err", err)
		return
	}
	defer f.Close()

	var total, matched int
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var entry manifestEntry
		if err := json.Unmarshal(sc.Bytes(), &entry); err != nil {
			continue
		}
		jpegBytes, err := os.ReadFile(filepath.Join(*dir, entry.File))
		if err != nil {
			slog.Warn("read frame failed", "file", entry.File, "err", err)
			continue
		}
		dets, err := model.RunWithConf(jpegBytes, float32(*conf))
		if err != nil {
			slog.Warn("inference failed", "frame", entry.FrameID, "err", err)
			continue
		}
		total++

		recLabel := ""
		if len(entry.Detections) > 0 {
			recLabel = entry.Detections[0].Label
		}
		repLabel := ""
		if len(dets) > 0 {
			repLabel = dets[0].Label
		}
		icon := "✓"
		if recLabel == repLabel {
			matched++
		} else {
			icon = "✗"
		}
		fmt.Printf("[%s] frame %06d  recorded=%-14s  replayed=%-14s  (%d dets)\n",
			icon, entry.FrameID, recLabel, repLabel, len(dets))
	}

	if total > 0 {
		fmt.Printf("\nTotal: %d frames | Top-label match: %d/%d (%.0f%%)\n",
			total, matched, total, 100*float64(matched)/float64(total))
	}
}
