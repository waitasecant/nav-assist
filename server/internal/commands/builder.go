package commands

import (
	"sort"
	"time"

	"navassist/internal/inference"
)

const speakCooldown = 3 * time.Second

// Command is a haptic or TTS instruction sent to the phone.
type Command struct {
	Action    string `json:"action"`
	Intensity string `json:"intensity,omitempty"`
	Text      string `json:"text,omitempty"`
}

// LastSpoken tracks per-connection debounce state for spoken alerts.
type LastSpoken struct {
	Tier  string
	Label string
	At    time.Time
}

var tierRank = map[string]int{
	"IMMEDIATE": 0,
	"CAUTION":   1,
	"AWARE":     2,
}

var classPriority = map[string]int{
	"person":     0,
	"car":        1,
	"bicycle":    2,
	"truck":      3,
	"bus":        4,
	"motorcycle": 5,
	"chair":      6,
}

func classPrio(label string) int {
	if p, ok := classPriority[label]; ok {
		return p
	}
	return 99
}

// prioritise returns a copy of dets sorted by tier → class priority → area ratio.
func prioritise(dets []inference.Detection) []inference.Detection {
	sorted := make([]inference.Detection, len(dets))
	copy(sorted, dets)
	sort.SliceStable(sorted, func(i, j int) bool {
		if tierRank[sorted[i].Tier] != tierRank[sorted[j].Tier] {
			return tierRank[sorted[i].Tier] < tierRank[sorted[j].Tier]
		}
		if classPrio(sorted[i].Label) != classPrio(sorted[j].Label) {
			return classPrio(sorted[i].Label) < classPrio(sorted[j].Label)
		}
		return sorted[i].AreaRatio > sorted[j].AreaRatio
	})
	return sorted
}

// Build derives haptic and TTS commands from the highest-priority detection.
// Vibrate on every IMMEDIATE/CAUTION frame.
// Speak only when tier/label changes or the cooldown has expired.
func Build(dets []inference.Detection, last *LastSpoken) []Command {
	if len(dets) == 0 {
		return nil
	}

	top := prioritise(dets)[0]
	var cmds []Command

	switch top.Tier {
	case "IMMEDIATE":
		cmds = append(cmds, Command{Action: "vibrate", Intensity: "high"})
	case "CAUTION":
		cmds = append(cmds, Command{Action: "vibrate", Intensity: "medium"})
	}

	if top.Tier == "IMMEDIATE" || top.Tier == "CAUTION" {
		if top.Tier != last.Tier || top.Label != last.Label || time.Since(last.At) >= speakCooldown {
			text := top.Label
			if top.Tier == "IMMEDIATE" {
				text += " ahead"
			}
			cmds = append(cmds, Command{Action: "speak", Text: text})
			last.Tier  = top.Tier
			last.Label = top.Label
			last.At    = time.Now()
		}
	}

	return cmds
}
