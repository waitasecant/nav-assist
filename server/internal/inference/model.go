package inference

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"sort"
	"sync"

	ort "github.com/yalue/onnxruntime_go"
	"golang.org/x/image/draw"
)

const (
	inputSize  = 640
	numClasses = 80
	numAnchors = 8400
	confThresh = float32(0.40)
	iouThresh  = float32(0.45)
	immThresh  = float32(0.45)
	cautThresh = float32(0.15)
)

// Detection holds a single YOLO detection result.
type Detection struct {
	Label     string  `json:"label"`
	Conf      float32 `json:"conf"`
	AreaRatio float32 `json:"area_ratio"`
	Tier      string  `json:"tier"`
}

// Model wraps an ORT session for YOLOv8-nano inference.
type Model struct {
	session      *ort.AdvancedSession
	inputTensor  *ort.Tensor[float32]
	outputTensor *ort.Tensor[float32]
	mu           sync.Mutex
}

// New loads a YOLOv8 ONNX model. Call ort.InitializeEnvironment before New.
func New(modelPath string) (*Model, error) {
	inShape  := ort.NewShape(1, 3, inputSize, inputSize)
	outShape := ort.NewShape(1, numClasses+4, numAnchors)

	inTensor, err := ort.NewEmptyTensor[float32](inShape)
	if err != nil {
		return nil, fmt.Errorf("input tensor: %w", err)
	}

	outTensor, err := ort.NewEmptyTensor[float32](outShape)
	if err != nil {
		inTensor.Destroy()
		return nil, fmt.Errorf("output tensor: %w", err)
	}

	session, err := ort.NewAdvancedSession(
		modelPath,
		[]string{"images"}, []string{"output0"},
		[]ort.ArbitraryTensor{inTensor},
		[]ort.ArbitraryTensor{outTensor},
		nil,
	)
	if err != nil {
		inTensor.Destroy()
		outTensor.Destroy()
		return nil, fmt.Errorf("create session: %w", err)
	}

	return &Model{
		session:      session,
		inputTensor:  inTensor,
		outputTensor: outTensor,
	}, nil
}

// Close releases all ORT resources.
func (m *Model) Close() {
	m.session.Destroy()
	m.inputTensor.Destroy()
	m.outputTensor.Destroy()
}

// Run decodes a JPEG frame and returns detections sorted by area ratio descending.
func (m *Model) Run(jpegBytes []byte) ([]Detection, error) {
	img, err := jpeg.Decode(bytes.NewReader(jpegBytes))
	if err != nil {
		return nil, err
	}
	origW := img.Bounds().Dx()
	origH := img.Bounds().Dy()

	m.mu.Lock()
	defer m.mu.Unlock()

	preprocess(img, m.inputTensor.GetData())
	if err := m.session.Run(); err != nil {
		return nil, fmt.Errorf("ort run: %w", err)
	}

	sx := float32(origW) / inputSize
	sy := float32(origH) / inputSize
	return postprocess(m.outputTensor.GetData(), sx, sy, origW*origH), nil
}

// preprocess resizes img to inputSize×inputSize and writes an NCHW float32
// tensor (normalised to [0,1]) into buf.
func preprocess(img image.Image, buf []float32) {
	dst := image.NewRGBA(image.Rect(0, 0, inputSize, inputSize))
	draw.BiLinear.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)

	pix   := dst.Pix
	plane := inputSize * inputSize
	for i := 0; i < plane; i++ {
		base := i * 4
		buf[i]          = float32(pix[base])   / 255.0 // R
		buf[plane+i]    = float32(pix[base+1]) / 255.0 // G
		buf[2*plane+i]  = float32(pix[base+2]) / 255.0 // B
	}
}

// postprocess decodes the YOLOv8 output tensor [1, 84, 8400], applies
// confidence filtering + NMS, and returns detections.
func postprocess(raw []float32, sx, sy float32, frameArea int) []Detection {
	type cand struct {
		box   [4]float32 // x1, y1, w, h in original image coords
		conf  float32
		class int
	}

	cands := make([]cand, 0, 64)

	for a := 0; a < numAnchors; a++ {
		// Find the highest-scoring class for this anchor
		var maxScore float32
		maxClass := 0
		for c := 0; c < numClasses; c++ {
			if s := raw[(4+c)*numAnchors+a]; s > maxScore {
				maxScore = s
				maxClass = c
			}
		}
		if maxScore < confThresh {
			continue
		}

		cx := raw[0*numAnchors+a] * sx
		cy := raw[1*numAnchors+a] * sy
		bw := raw[2*numAnchors+a] * sx
		bh := raw[3*numAnchors+a] * sy

		cands = append(cands, cand{
			box:   [4]float32{cx - bw/2, cy - bh/2, bw, bh},
			conf:  maxScore,
			class: maxClass,
		})
	}
	if len(cands) == 0 {
		return nil
	}

	boxes  := make([][4]float32, len(cands))
	scores := make([]float32, len(cands))
	for i, c := range cands {
		boxes[i]  = c.box
		scores[i] = c.conf
	}

	dets := make([]Detection, 0, len(cands))
	for _, i := range nmsIndices(boxes, scores, iouThresh) {
		c := cands[i]
		ratio := (c.box[2] * c.box[3]) / float32(frameArea)
		dets = append(dets, Detection{
			Label:     cocoClasses[c.class],
			Conf:      c.conf,
			AreaRatio: ratio,
			Tier:      classifyTier(ratio),
		})
	}

	sort.Slice(dets, func(i, j int) bool {
		return dets[i].AreaRatio > dets[j].AreaRatio
	})
	return dets
}

func classifyTier(ratio float32) string {
	if ratio > immThresh {
		return "IMMEDIATE"
	}
	if ratio > cautThresh {
		return "CAUTION"
	}
	return "AWARE"
}
