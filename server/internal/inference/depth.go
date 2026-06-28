package inference

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"sync"

	ort "github.com/yalue/onnxruntime_go"
	"golang.org/x/image/draw"
)

const depthSize = 256

var (
	imagenetMean = [3]float32{0.485, 0.456, 0.406}
	imagenetStd  = [3]float32{0.229, 0.224, 0.225}
)

// DepthModel wraps a MiDaS ORT session for monocular depth estimation.
type DepthModel struct {
	session      *ort.AdvancedSession
	inputTensor  *ort.Tensor[float32]
	outputTensor *ort.Tensor[float32]
	mu           sync.Mutex
}

// NewDepth loads a MiDaS v2.1 small ONNX model.
func NewDepth(modelPath string) (*DepthModel, error) {
	inShape  := ort.NewShape(1, 3, depthSize, depthSize)
	outShape := ort.NewShape(1, depthSize, depthSize)

	inTensor, err := ort.NewEmptyTensor[float32](inShape)
	if err != nil {
		return nil, fmt.Errorf("depth input tensor: %w", err)
	}

	outTensor, err := ort.NewEmptyTensor[float32](outShape)
	if err != nil {
		_ = inTensor.Destroy()
		return nil, fmt.Errorf("depth output tensor: %w", err)
	}

	session, err := ort.NewAdvancedSession(
		modelPath,
		[]string{"0"}, []string{"797"},
		[]ort.ArbitraryTensor{inTensor},
		[]ort.ArbitraryTensor{outTensor},
		nil,
	)
	if err != nil {
		_ = inTensor.Destroy()
		_ = outTensor.Destroy()
		return nil, fmt.Errorf("create depth session: %w", err)
	}

	return &DepthModel{
		session:      session,
		inputTensor:  inTensor,
		outputTensor: outTensor,
	}, nil
}

// Close releases all ORT resources.
func (m *DepthModel) Close() {
	_ = m.session.Destroy()
	_ = m.inputTensor.Destroy()
	_ = m.outputTensor.Destroy()
}

// Run returns a normalized closeness map (0=far, 1=closest) of size depthSize×depthSize.
func (m *DepthModel) Run(jpegBytes []byte) ([]float32, error) {
	img, err := jpeg.Decode(bytes.NewReader(jpegBytes))
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	preprocessDepth(img, m.inputTensor.GetData())
	if err := m.session.Run(); err != nil {
		return nil, fmt.Errorf("depth ort run: %w", err)
	}

	return normalizeCloseness(m.outputTensor.GetData()), nil
}

func preprocessDepth(img image.Image, buf []float32) {
	dst := image.NewRGBA(image.Rect(0, 0, depthSize, depthSize))
	draw.BiLinear.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)

	pix   := dst.Pix
	plane := depthSize * depthSize
	for i := 0; i < plane; i++ {
		base := i * 4
		r := float32(pix[base])   / 255.0
		g := float32(pix[base+1]) / 255.0
		b := float32(pix[base+2]) / 255.0
		buf[i]         = (r - imagenetMean[0]) / imagenetStd[0]
		buf[plane+i]   = (g - imagenetMean[1]) / imagenetStd[1]
		buf[2*plane+i] = (b - imagenetMean[2]) / imagenetStd[2]
	}
}

// normalizeCloseness converts raw MiDaS inverse-depth output to [0,1]
// where 1 = closest point in the frame.
func normalizeCloseness(raw []float32) []float32 {
	var maxVal float32
	for _, v := range raw {
		if v > maxVal {
			maxVal = v
		}
	}
	if maxVal == 0 {
		return make([]float32, len(raw))
	}
	out := make([]float32, len(raw))
	for i, v := range raw {
		out[i] = v / maxVal
	}
	return out
}
