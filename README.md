# Survey app

A static survey site. Participants open a URL, read a welcome page and a
definitions page, then rate a random draw of passages on a 0–100 slider.
Answers are posted to a Google Sheet.

No build step, no npm, no server. It is plain HTML/CSS/JS, so it runs on
GitHub Pages as-is.

```
index.html                    the page shell — you rarely touch this
assets/app.js                 the survey runner — you rarely touch this
assets/styles.css             colours and type
surveys/manifest.json         the list of surveys, and which is the default
surveys/liberal-democracy.json  one survey: text, settings, and the 20 items
tools/csv_to_survey.py        turns a scored CSV into a survey's item list
apps-script/Code.gs           paste this into the Google Sheet
apsi_scores (3).csv           the source data for the liberal-democracy survey
```

---

## 1. Set up the Google Sheet (once)

1. Create a new Google Sheet. Name it whatever you like.
2. **Extensions → Apps Script**. Delete the placeholder code, paste in all of
   [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. **Deploy → New deployment → Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
4. Authorise it when Google asks. It will warn that the app is unverified —
   that is normal for your own scripts; continue via *Advanced → Go to …*.
5. Copy the deployment's `/exec` URL.
6. Paste that URL into `surveys/liberal-democracy.json`:

   ```json
   "submit": { "endpoint": "https://script.google.com/macros/s/AKfy.../exec" }
   ```

To check it is alive, open the `/exec` URL in a browser — it should reply
`{"ok":true,"rows":0}`.

A `responses` tab appears in the sheet on the first submission, with the
header row written automatically. **One row per rated passage**, so four rows
per participant. Columns:

| column | meaning |
| --- | --- |
| `submitted_at` | ISO timestamp, set in the participant's browser |
| `response_id` | random per participant — groups their 4 rows together |
| `survey_id` | which survey they took |
| `participant` | whatever you passed as `?p=` in the URL (blank if unused) |
| `item_order` | 1–4, the order this passage was shown in |
| `item_uid` | the passage's `uid`, joins back to your CSV |
| `lib_score`, `lib_label` | the classifier score carried through from the CSV |
| `slider_start` | where the slider opened (`lib_score` × 10, rounded) |
| `slider_value` | where they left it |
| `delta` | `slider_value − slider_start` |
| `moved` | 1 if they touched the slider at all, 0 if they left the anchor |
| `change_count` | how many slider events they generated |
| `ms_on_item` | milliseconds spent on that passage |
| `total_ms` | milliseconds for the whole session |
| `drawn_uids` | all 4 passages this participant was assigned |
| `screen_width`, `user_agent`, `referrer` | for screening out odd sessions |

> **Note on `moved`.** Because the slider opens on the classifier's score,
> `moved = 0` is ambiguous: it could mean agreement or disengagement. Use
> `ms_on_item` alongside it. If you would rather force a deliberate answer,
> set `"requireInteraction": true` in the survey's `slider` block — but that
> makes "I agree with the suggestion" impossible to express without first
> moving the slider away and back.

---

## 2. Publish it

Any static host works. For GitHub Pages, either:

**A separate repo** — push these files to a repo called e.g. `survey`, then
Settings → Pages → deploy from `main` / root. The survey lives at
`https://juangomezcruces.github.io/survey/`.

**Inside your existing site repo** — copy this folder into
`juangomezcruces.github.io` as a subfolder, e.g. `survey/`. Same URL.

Then share:

```
https://juangomezcruces.github.io/survey/
```

Everything is relative, so it works from any subfolder without edits.

### URL parameters

| parameter | what it does |
| --- | --- |
| `?s=<id>` | run a specific survey, e.g. `?s=liberal-democracy`. Defaults to `manifest.json`'s `default`. |
| `?p=<label>` | tags every row with a label. Useful for tracking where people came from: `?p=twitter`, `?p=seminar`, or a Prolific/MTurk ID. |

```
https://juangomezcruces.github.io/survey/?s=liberal-democracy&p=pilot
```

---

## 3. Edit the survey text

Everything a participant reads lives in `surveys/liberal-democracy.json`.
Three blocks are marked `PLACEHOLDER` — the welcome page and the closing
page — replace them with your own wording.

```json
"welcome":    { "eyebrow": "...", "heading": "...", "body": ["para", "para"], "button": "Begin" },
"definition": { "intro": [...], "cards": [ {"tone":"high"|"low", "title":"...", "body":"..."} ], "outro": [...] },
"done":       { "stamp": "Received", "heading": "...", "body": [...] }
```

Each string in a `body` / `intro` / `outro` array becomes one paragraph.

### Logos

Shown as a letterhead strip on the first and last pages:

```json
"logos": [
  { "src": "assets/logo-hpi.png",  "alt": "Hasso Plattner Institute", "height": 54 },
  { "src": "assets/logo-apsi.png", "alt": "APSI", "height": 46 }
]
```

`height` is in pixels on desktop; both scale down to 38px on phones. Drop new
files in `assets/` and point `src` at them. Omit the whole block for no logos.

### Fixed questions

Anything in the `questions` block is asked of **everyone**, once, on a page
between the welcome and the definitions — unlike `items`, which are drawn at
random. Use it for demographics, screeners and consent.

```json
"questions": {
  "eyebrow": "About you",
  "heading": "Your position",
  "intro": [],
  "button": "Continue",
  "items": [
    {
      "id": "position",
      "type": "one",
      "label": "What is your current academic or professional position?",
      "hint": "Please select the option that best describes you.",
      "required": true,
      "options": ["Ph.D. Candidate / Doctoral Researcher", "…"],
      "allowOther": true,
      "otherLabel": "Other (please specify)",
      "errorText": "Please select your position to continue."
    }
  ]
}
```

Two types so far:

| type | renders as |
| --- | --- |
| `one` | radio buttons, plus an optional free-text "other" via `allowOther` |
| `short` | single-line text box |

Add as many entries to `items` as you like; they all appear on the one page.
Each answer becomes a column named `q_<id>` on **every** row that person
generates, so the sheet stays one flat table. With `allowOther`, picking the
other option writes `Other` to `q_<id>` and the typed text to `q_<id>_other`.

Delete the whole `questions` block and the page is skipped entirely.

Other settings:

```json
"sampling": { "drawCount": 4 },        // how many of the 20 items each person sees
"slider": {
  "min": 0, "max": 100, "step": 1,
  "requireInteraction": false,          // true = must move the slider to continue
  "ticks": ["0 — no support", "50", "100 — full support"],
  "bands": [ { "upTo": 20, "label": "No support" }, ... ]   // the label beside the number
}
```

After editing `assets/app.js` or `assets/styles.css`, bump `?v=4` to `?v=5`
in `index.html` so returning participants do not get a cached copy.

---

## 4. Change or add items

The 20 items come from `apsi_scores (3).csv`. To regenerate them after
editing the CSV:

```bash
python3 tools/csv_to_survey.py "apsi_scores (3).csv" surveys/liberal-democracy.json
```

This replaces only the `items` array and leaves your text and settings alone.
The CSV needs the columns `uid, paragraph, lib_score, lib_label`; the slider's
starting position is `lib_score × 10`, rounded and clamped to 0–100.

You can also edit `items` by hand. Each one:

```json
{ "uid": "doc_0001", "text": "the passage…", "libScore": 7.05, "libLabel": "Strong Support", "start": 70 }
```

`start` is the only field the participant experiences; `libScore` and
`libLabel` are just carried through to the spreadsheet.

---

## 5. Add a second survey

1. Copy `surveys/liberal-democracy.json` to `surveys/my-new-survey.json`.
2. Change its `"id"` to `"my-new-survey"` (it must match the filename).
3. Rewrite the text and the `items`.
4. Add it to `surveys/manifest.json`:

   ```json
   { "id": "my-new-survey", "title": "…", "status": "open" }
   ```

5. Share `…/?s=my-new-survey`.

Surveys can share one endpoint — the `survey_id` column tells them apart —
or point at different sheets.

---

## Running it locally

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765`. Opening `index.html` as a `file://` URL
will *not* work: the browser blocks the survey JSON from loading.

## What participants experience

1. **Welcome** — your intro and consent text.
2. **Definitions** — what counts as support and what does not.
3. **Four passages**, drawn at random from the 20 (Fisher–Yates, so every
   item is equally likely). Each opens with the slider on the classifier's
   suggested score; they move it or leave it. Back works, and returning to a
   passage keeps their answer.
4. **Thank you** — sent to the sheet.

If the POST fails, nothing is lost: the participant is shown their answers as
text and asked to send them to you.

## Limits worth knowing

- **Nothing is anonymous by construction, but little is collected.** No name,
  no email, no IP. `user_agent` and `referrer` are stored; delete those
  columns from `Code.gs` if your ethics approval requires it.
- **No duplicate prevention.** One person can take it repeatedly. Use `?p=`
  with per-participant codes if that matters.
- **The endpoint URL is public**, as it must be for a static site. Someone
  who reads the page source could post junk rows. For a low-stakes academic
  survey this is normal; `response_id`, `total_ms` and `user_agent` give you
  enough to spot fake submissions.
