#!/usr/bin/env python3
"""
Turn a scored-paragraph CSV into the `items` array of a survey JSON file.

Usage
-----
    python3 tools/csv_to_survey.py "apsi_scores (3).csv" surveys/liberal-democracy.json

The CSV needs these columns (rename yours or edit COLUMNS below):

    uid, paragraph, lib_score, lib_label

Everything else in the survey file — title, welcome text, definitions,
how many items get drawn — is left untouched. Only `items` is replaced,
so you can re-run this whenever the CSV changes.

The slider's starting position is lib_score x 10, rounded, clamped to 0-100.
"""

import csv
import json
import sys
from pathlib import Path

COLUMNS = {
    "uid": "uid",
    "text": "paragraph",
    "score": "lib_score",
    "label": "lib_label",
}

SCORE_TO_SLIDER = 10  # lib_score is 0-10, the slider is 0-100


def build_items(csv_path: Path) -> list[dict]:
    items = []
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        for i, row in enumerate(csv.DictReader(fh), start=1):
            text = (row.get(COLUMNS["text"]) or "").strip().strip('"').strip()
            if not text:
                continue
            raw = (row.get(COLUMNS["score"]) or "").strip()
            try:
                score = float(raw)
            except ValueError:
                sys.exit(f"row {i}: '{COLUMNS['score']}' is not a number: {raw!r}")

            items.append({
                "uid": (row.get(COLUMNS["uid"]) or f"item_{i:04d}").strip(),
                "text": text,
                "libScore": round(score, 4),
                "libLabel": (row.get(COLUMNS["label"]) or "").strip(),
                "start": max(0, min(100, round(score * SCORE_TO_SLIDER))),
            })
    return items


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)

    csv_path, survey_path = Path(sys.argv[1]), Path(sys.argv[2])
    if not csv_path.exists():
        sys.exit(f"no such CSV: {csv_path}")

    items = build_items(csv_path)
    if not items:
        sys.exit("the CSV produced no usable rows")

    survey = json.loads(survey_path.read_text(encoding="utf-8")) if survey_path.exists() else {}
    survey["items"] = items
    survey_path.parent.mkdir(parents=True, exist_ok=True)
    survey_path.write_text(json.dumps(survey, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    draw = (survey.get("sampling") or {}).get("drawCount", "?")
    print(f"wrote {len(items)} items to {survey_path} (each respondent sees {draw})")


if __name__ == "__main__":
    main()
