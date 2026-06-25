package commands

import (
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

// Build derives haptic and TTS commands from the top detection.
// Vibrate on every IMMEDIATE/CAUTION frame.
// Speak only when tier/label changes or the cooldown has expired.
func Build(dets []inference.Detection, last *LastSpoken) []Command {
	if len(dets) == 0 {
		return nil
	}

	top := dets[0]
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
