import { useEffect, useRef, useState } from "react";
import { Accelerometer } from "expo-sensors";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

// Thresholds (tunable in Phase 5)
const SPIKE_G        = 2.5;   // impact magnitude to start detection
const SPIKE_MS       = 50;    // spike must sustain this long
const STILL_G        = 0.3;   // post-impact low-g to confirm fall
const STILL_MS       = 1000;  // low-g must sustain this long
const IMPACT_WINDOW  = 3000;  // max ms to wait for still phase after spike

type State = "idle" | "impact";

export function useFallDetector() {
  const [fallDetected, setFallDetected] = useState(false);

  const state       = useRef<State>("idle");
  const spikeStart  = useRef<number | null>(null);
  const impactAt    = useRef<number | null>(null);
  const stillStart  = useRef<number | null>(null);

  useEffect(() => {
    Accelerometer.setUpdateInterval(10); // 100 Hz

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const mag = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (state.current === "idle") {
        if (mag > SPIKE_G) {
          if (spikeStart.current === null) {
            spikeStart.current = now;
          } else if (now - spikeStart.current >= SPIKE_MS) {
            state.current   = "impact";
            impactAt.current = now;
            spikeStart.current = null;
            stillStart.current = null;
          }
        } else {
          spikeStart.current = null;
        }
      } else if (state.current === "impact") {
        // Impact window expired — reset
        if (now - impactAt.current! > IMPACT_WINDOW) {
          state.current = "idle";
          stillStart.current = null;
          return;
        }

        if (mag < STILL_G) {
          if (stillStart.current === null) {
            stillStart.current = now;
          } else if (now - stillStart.current >= STILL_MS) {
            state.current      = "idle";
            impactAt.current   = null;
            stillStart.current = null;
            onFallConfirmed();
          }
        } else {
          stillStart.current = null;
        }
      }
    });

    return () => sub.remove();
  }, []);

  function onFallConfirmed() {
    setFallDetected(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Speech.speak("Fall detected. Are you okay?", { rate: 1.0, language: "en" });
  }

  function dismiss() {
    setFallDetected(false);
  }

  return { fallDetected, dismiss };
}
