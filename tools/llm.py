"""
Runs Phi-3-mini locally; every 5 s fetches /status from the Go server,
generates a one-sentence spatial summary, and POSTs it to /narration.

Usage:
    python tools/llm.py --model path/to/Phi-3-mini.gguf

Download a GGUF from:
    https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf
"""

import argparse
import time
import requests
from llama_cpp import Llama

SYSTEM_PROMPT = (
    "You are a navigation assistant for a visually impaired person. "
    "Given detected objects and their distances, produce exactly one short "
    "spoken sentence describing the scene. Focus on the nearest hazards. "
    "No extra text or punctuation beyond the sentence."
)


def build_user_msg(detections: list) -> str:
    if not detections:
        return "No objects detected. Scene is clear."
    parts = []
    for d in detections[:5]:
        label = d.get("label", "object")
        tier = d.get("tier", "")
        depth = d.get("depth", -1)
        dist = f"{depth:.1f} metres" if depth >= 0 else "nearby"
        parts.append(f"{label} ({tier}, {dist})")
    return "Detected: " + "; ".join(parts) + "."


def narrate(llm: Llama, detections: list) -> str:
    resp = llm.create_chat_completion(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_msg(detections)},
        ],
        max_tokens=64,
        temperature=0.3,
    )
    return resp["choices"][0]["message"]["content"].strip()


def main():
    parser = argparse.ArgumentParser(description="NavAssist LLM scene narrator")
    parser.add_argument("--model", required=True, help="Path to Phi-3-mini GGUF file")
    parser.add_argument(
        "--server", default="http://localhost:8000", help="Go server base URL"
    )
    parser.add_argument(
        "--interval", type=float, default=5.0, help="Seconds between narrations"
    )
    parser.add_argument("--ctx", type=int, default=512, help="LLM context size")
    parser.add_argument(
        "--threads", type=int, default=4, help="CPU threads for inference"
    )
    args = parser.parse_args()

    print(f"[*] Loading model: {args.model}")
    llm = Llama(
        model_path=args.model, n_ctx=args.ctx, n_threads=args.threads, verbose=False
    )
    print("[✓] Model loaded — starting narration loop")

    while True:
        try:
            status = requests.get(f"{args.server}/status", timeout=3).json()
            dets = status.get("detections") or []
            text = narrate(llm, dets)
            print(f"[narration] {text}")
            requests.post(f"{args.server}/narration", json={"text": text}, timeout=3)
        except Exception as e:
            print(f"[warn] {e}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
