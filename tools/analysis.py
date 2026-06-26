"""
Post-session spatial analysis.

Loads the SQLite session log and writes a standalone HTML report containing:
  - Tier distribution table
  - Top-10 hazard labels
  - Recent event timeline
  - Folium heatmap (only when events table has lat/lon columns)

Usage:
    python tools/analysis.py --db session.db --out report.html
"""

import argparse
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path

TEMPLATE = Path(__file__).parent / "report_template.html"


def load_events(db_path: str) -> tuple[list[dict], bool]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cols = {row[1] for row in cur.execute("PRAGMA table_info(events)")}
    has_gps = "lat" in cols and "lon" in cols
    select = "SELECT ts, tier, label, depth" + (", lat, lon" if has_gps else "")
    rows = [dict(r) for r in cur.execute(f"{select} FROM events ORDER BY ts")]
    conn.close()
    return rows, has_gps


def heatmap_html(events: list[dict]) -> str:
    try:
        import folium
        from folium.plugins import HeatMap

        points = [
            (e["lat"], e["lon"])
            for e in events
            if e.get("lat") is not None and e.get("lon") is not None
        ]
        if not points:
            return ""
        m = folium.Map(location=points[0], zoom_start=16)
        HeatMap(points).add_to(m)
        return m._repr_html_()
    except ImportError:
        return ""


def build_report(events: list[dict], has_gps: bool, out_path: str):
    if not events:
        Path(out_path).write_text("<p>No events found.</p>", encoding="utf-8")
        print("[warn] No events in database.")
        return

    tier_counts = Counter(e["tier"] for e in events)
    top_labels = Counter(e["label"] for e in events).most_common(10)

    tier_rows = "".join(
        f"<tr><td>{t}</td><td>{c}</td></tr>" for t, c in tier_counts.items()
    )
    label_rows = "".join(f"<tr><td>{l}</td><td>{c}</td></tr>" for l, c in top_labels)
    event_rows = "".join(
        f"<tr><td>{datetime.fromtimestamp(e['ts']/1000).strftime('%H:%M:%S')}</td>"
        f"<td>{e['tier']}</td><td>{e['label']}</td><td>{e['depth']:.2f}</td></tr>"
        for e in reversed(events[-20:])
    )

    map_section = ""
    if has_gps:
        html = heatmap_html(events)
        if html:
            map_section = f"<h2>Location Heatmap</h2><div class='map'>{html}</div>"

    report = (
        TEMPLATE.read_text(encoding="utf-8")
        .replace("{EVENT_COUNT}", str(len(events)))
        .replace("{TIER_ROWS}", tier_rows)
        .replace("{LABEL_ROWS}", label_rows)
        .replace("{EVENT_ROWS}", event_rows)
        .replace("{MAP_SECTION}", map_section)
    )

    Path(out_path).write_text(report, encoding="utf-8")
    print(f"[✓] Report written to {out_path}")


def main():
    parser = argparse.ArgumentParser(description="NavAssist session analysis")
    parser.add_argument("--db", default="session.db", help="Path to SQLite session log")
    parser.add_argument("--out", default="report.html", help="Output HTML file")
    args = parser.parse_args()

    events, has_gps = load_events(args.db)
    print(f"[*] Loaded {len(events)} events from {args.db}")
    build_report(events, has_gps, args.out)


if __name__ == "__main__":
    main()
