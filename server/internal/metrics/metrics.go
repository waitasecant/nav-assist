package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	InferenceLatency = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "navassist_inference_ms",
		Help:    "YOLO+depth inference latency in milliseconds",
		Buckets: []float64{10, 25, 50, 100, 200, 500},
	})

	ServerFPS = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "navassist_fps",
		Help: "Server-side inference frames per second",
	})

	TierTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "navassist_tier_total",
		Help: "Detection count by tier",
	}, []string{"tier"})
)
