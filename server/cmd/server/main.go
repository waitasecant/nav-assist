package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	ort "github.com/yalue/onnxruntime_go"

	"navassist/internal/commands"
	"navassist/internal/inference"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	modelPath := flag.String("model", "../model/yolov8n.onnx", "path to yolov8n.onnx")
	ortLib    := flag.String("ort", "lib/onnxruntime.dll", "path to ORT shared library")
	port      := flag.String("port", "8000", "listen port")
	flag.Parse()

	ort.SetSharedLibraryPath(*ortLib)
	if err := ort.InitializeEnvironment(); err != nil {
		log.Fatalf("ort init: %v", err)
	}
	defer ort.DestroyEnvironment()

	model, err := inference.New(*modelPath)
	if err != nil {
		log.Fatalf("load model: %v", err)
	}
	defer model.Close()

	fmt.Printf("[YOLO] model: %s\n", *modelPath)
	fmt.Printf("[server] listening on 0.0.0.0:%s/ws\n", *port)

	http.HandleFunc("/ws", makeHandler(model))
	log.Fatal(http.ListenAndServe(":"+*port, nil))
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
			log.Printf("upgrade: %v", err)
			return
		}
		defer conn.Close()

		fmt.Println("[+] Phone connected")
		start := time.Now()
		var count int64
		last := &commands.LastSpoken{}

		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
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
				log.Printf("inference: %v", err)
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
