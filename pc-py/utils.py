"""Command-building utilities: derives haptic/TTS commands from inference detections."""

import time

SPEAK_COOLDOWN = 3.0  # seconds between spoken alerts


def build_commands(detections: list[dict], last_spoken: dict) -> list[dict]:
    """Derive haptic + TTS commands from the top detection.
    Vibrate on every IMMEDIATE/CAUTION frame.
    Speak only when tier/label changes or cooldown expires.
    """
    if not detections:
        return []

    top = detections[0]
    tier, label, now = top["tier"], top["label"], time.time()
    commands = []

    if tier == "IMMEDIATE":
        commands.append({"action": "vibrate", "intensity": "high"})
    elif tier == "CAUTION":
        commands.append({"action": "vibrate", "intensity": "medium"})

    if tier in ("IMMEDIATE", "CAUTION"):
        tier_changed = tier != last_spoken["tier"]
        label_changed = label != last_spoken["label"]
        cooldown_ok = (now - last_spoken["at"]) >= SPEAK_COOLDOWN

        if tier_changed or label_changed or cooldown_ok:
            text = f"{label} ahead" if tier == "IMMEDIATE" else label
            commands.append({"action": "speak", "text": text})
            last_spoken.update({"tier": tier, "label": label, "at": now})

    return commands
