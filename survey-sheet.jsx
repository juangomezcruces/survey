import React, { useState, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Storage helpers — everything is shared, so all visitors see the     */
/*  same form and the same pile of collected sheets.                    */
/* ------------------------------------------------------------------ */

const CONFIG_KEY = "survey:config";
const RESP_PREFIX = "resp:";

async function loadConfig() {
  try {
    const r = await window.storage.get(CONFIG_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}

async function saveConfig(cfg) {
  const r = await window.storage.set(CONFIG_KEY, JSON.stringify(cfg), true);
  if (!r) throw new Error("write failed");
  return r;
}

async function loadResponses() {
  const listed = await window.storage.list(RESP_PREFIX, true);
  const raw = listed?.keys || [];
  const keys = raw.map((k) => (typeof k === "string" ? k : k?.key)).filter(Boolean);
  const rows = await Promise.all(
    keys.map(async (key) => {
      try {
        const r = await window.storage.get(key, true);
        return { key, ...JSON.parse(r.value) };
      } catch {
        return null;
      }
    })
  );
  return rows.filter(Boolean).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
}

/* ------------------------------------------------------------------ */

const uid = () => Math.random().toString(36).slice(2, 9);

/* ---- CSV ---- */

function escapeCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCSV(cfg, rows) {
  const header = ["Submitted at", ...cfg.questions.map((q) => q.label)];
  const lines = [header.map(escapeCell).join(",")];
  [...rows]
    .slice()
    .reverse() /* oldest first reads better in a spreadsheet */
    .forEach((r) => {
      const cells = [
        r.submittedAt,
        ...cfg.questions.map((q) => {
          const v = r.answers?.[q.id];
          if (Array.isArray(v)) return v.join("; ");
          return v === undefined || v === null ? "" : v;
        }),
      ];
      lines.push(cells.map(escapeCell).join(","));
    });
  return lines.join("\r\n");
}

function csvFilename(title) {
  const slug =
    (title || "survey")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "survey";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
}

const TYPES = [
  { id: "short", label: "Short answer" },
  { id: "paragraph", label: "Paragraph" },
  { id: "one", label: "Choose one" },
  { id: "many", label: "Choose many" },
  { id: "scale", label: "Scale 1–5" },
];

const STARTER = {
  title: "Reading room feedback",
  intro:
    "Five questions about how the space is working. Answers are pooled anonymously — no names, no addresses.",
  questions: [
    { id: uid(), type: "one", label: "How often do you come here?", required: true, options: ["Most days", "A few times a month", "Rarely", "First visit"] },
    { id: uid(), type: "scale", label: "How easy was it to find a seat?", required: true, options: [] },
    { id: uid(), type: "many", label: "What would you use if we added it?", required: false, options: ["Longer evening hours", "Quiet booths", "Coffee", "Lockers"] },
    { id: uid(), type: "paragraph", label: "Anything you'd change?", required: false, options: [] },
  ],
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

.ss {
  --paper:   #EDF1E4;
  --card:    #F9FBF5;
  --pine:    #2C4A3E;
  --pine-lo: #7C9188;
  --graphite:#383B36;
  --pencil:  #6E736B;
  --red:     #A63426;
  --rule:    #C7D2BE;

  --display: 'Archivo', 'Helvetica Neue', Arial, sans-serif;
  --body: 'Instrument Sans', 'Segoe UI', system-ui, sans-serif;
  --mono: 'DM Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;

  background: var(--paper);
  color: var(--graphite);
  font-family: var(--body);
  min-height: 100%;
  padding: 28px 18px 64px;
  -webkit-font-smoothing: antialiased;
}
.ss *, .ss *::before, .ss *::after { box-sizing: border-box; }
.ss button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
.ss :focus-visible { outline: 2px solid var(--pine); outline-offset: 2px; border-radius: 2px; }

.sheet {
  max-width: 830px; margin: 0 auto;
  background: var(--card);
  border: 1px solid var(--pine);
  box-shadow: 3px 3px 0 rgba(44,74,62,.14);
}

/* ---- header band ---- */
.band {
  background: var(--pine); color: var(--card);
  padding: 10px 20px; display: flex; gap: 14px;
  align-items: center; justify-content: space-between; flex-wrap: wrap;
}
.band-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: .16em;
  text-transform: uppercase; opacity: .82;
}
.band-meta { font-family: var(--mono); font-size: 11px; letter-spacing: .1em; opacity: .82; }

.masthead { padding: 26px 20px 20px; border-bottom: 1px solid var(--rule); }
.masthead h1 {
  font-family: var(--display); font-weight: 700; font-size: clamp(26px, 5vw, 40px);
  line-height: 1.02; letter-spacing: -.02em; margin: 0; color: var(--pine);
  text-transform: uppercase;
}
.masthead p { margin: 12px 0 0; max-width: 56ch; font-size: 15px; line-height: 1.55; color: var(--pencil); }

/* ---- tabs ---- */
.tabs { display: flex; border-bottom: 1px solid var(--rule); background: var(--card); }
.tab {
  padding: 11px 16px; font-family: var(--mono); font-size: 11px;
  letter-spacing: .13em; text-transform: uppercase; color: var(--pencil);
  border-right: 1px solid var(--rule); position: relative;
}
.tab[aria-selected="true"] { color: var(--pine); background: #EFF4E9; }
.tab[aria-selected="true"]::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--pine);
}

.body { padding: 8px 20px 26px; }

/* ---- question row + timing rail ---- */
.qrow { display: grid; grid-template-columns: 30px 1fr; gap: 0 14px; padding: 20px 0; border-bottom: 1px dotted var(--rule); }
.qrow:last-child { border-bottom: none; }
.rail { padding-top: 4px; }
.mark {
  display: block; width: 16px; height: 9px; border: 1.4px solid var(--pine-lo);
  background: transparent; transition: background-color .16s ease, border-color .16s ease;
}
.mark.on { background: var(--pine); border-color: var(--pine); }
.qnum { font-family: var(--mono); font-size: 10px; color: var(--pine-lo); margin-top: 7px; display: block; letter-spacing: .06em; }

.qlabel { font-size: 16.5px; font-weight: 600; line-height: 1.35; margin: 0 0 3px; color: var(--graphite); }
.req { color: var(--red); font-family: var(--mono); margin-left: 5px; }
.qhint { font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--pine-lo); margin: 0 0 12px; }
.qerr { color: var(--red); font-size: 13px; margin: 9px 0 0; font-weight: 500; }
.qrow.flag .mark { border-color: var(--red); }

/* ---- bubbles ---- */
.opts { display: flex; flex-direction: column; gap: 9px; margin-top: 4px; }
.opt { display: flex; align-items: center; gap: 11px; cursor: pointer; padding: 2px 0; font-size: 15px; line-height: 1.4; }
.bub {
  flex: none; width: 26px; height: 16px; border: 1.5px solid var(--pencil);
  border-radius: 999px; display: grid; place-items: center; background: transparent;
  transition: background-color .14s ease, border-color .14s ease;
}
.bub.sq { border-radius: 3px; width: 17px; }
.bub i { width: 0; height: 0; background: var(--graphite); border-radius: inherit; transition: width .14s ease, height .14s ease; display: block; }
.opt input { position: absolute; opacity: 0; width: 0; height: 0; }
.opt input:checked + .bub { border-color: var(--graphite); }
.opt input:checked + .bub i { width: 100%; height: 100%; }
.opt input:focus-visible + .bub { outline: 2px solid var(--pine); outline-offset: 2px; }
.opt:hover .bub { border-color: var(--pine); }

/* scale */
.scale { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 4px; }
.scale .opt { flex-direction: column; gap: 6px; }
.scale .num { font-family: var(--mono); font-size: 12px; color: var(--pencil); }
.scale-ends { display: flex; justify-content: space-between; max-width: 320px; font-family: var(--mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--pine-lo); margin-top: 10px; }

/* ---- written fields ---- */
.line {
  width: 100%; border: none; border-bottom: 1.5px solid var(--pencil); background: transparent;
  font: inherit; font-size: 15px; padding: 6px 2px; color: var(--graphite);
}
.line:focus { outline: none; border-bottom-color: var(--pine); }
.ruled {
  width: 100%; min-height: 88px; resize: vertical; font: inherit; font-size: 15px;
  padding: 6px 8px; color: var(--graphite); border: 1.5px solid var(--rule); background: transparent;
  line-height: 28px;
  background-image: repeating-linear-gradient(transparent, transparent 27px, var(--rule) 27px, var(--rule) 28px);
  background-position: 0 6px;
}
.ruled:focus { outline: none; border-color: var(--pine); }

/* ---- footer / actions ---- */
.foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 20px 20px 24px; border-top: 1px solid var(--pine); background: #EFF4E9; }
.btn {
  background: var(--pine); color: var(--card); padding: 11px 22px;
  font-family: var(--mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase;
  transition: transform .12s ease, background-color .12s ease;
}
.btn:hover { background: #22392F; transform: translateY(-1px); }
.btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.btn.ghost { background: transparent; color: var(--pine); border: 1.5px solid var(--pine); }
.btn.ghost:hover { background: rgba(44,74,62,.08); }
.btn.danger { background: transparent; color: var(--red); border: 1.5px solid var(--red); }
.btn.danger:hover { background: rgba(166,52,38,.08); }
.count { font-family: var(--mono); font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--pencil); }

/* ---- builder ---- */
.qedit { display: grid; grid-template-columns: 30px 1fr; gap: 0 14px; padding: 18px 0; border-bottom: 1px dotted var(--rule); }
.qtools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
.chip {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase;
  padding: 6px 10px; border: 1px solid var(--rule); color: var(--pencil); background: transparent;
}
.chip:hover { border-color: var(--pine); color: var(--pine); }
.chip.on { background: var(--pine); border-color: var(--pine); color: var(--card); }
.chip.x { border-color: transparent; color: var(--red); padding: 6px 6px; }
.chip.x:hover { border-color: var(--red); }
.optedit { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
.optedit .bub { pointer-events: none; }
.addq { margin-top: 22px; display: flex; gap: 10px; flex-wrap: wrap; }
.note { font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; color: var(--pine-lo); text-transform: uppercase; }

/* ---- results ---- */
.tallyrow { padding: 18px 0; border-bottom: 1px dotted var(--rule); }
.tallyrow:last-child { border-bottom: none; }
.tline { display: flex; align-items: center; gap: 12px; padding: 5px 0; font-size: 15px; }
.tline .name { min-width: 150px; flex: 1; }
.tally { display: inline-flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.tally line { stroke: var(--graphite); stroke-width: 1.7; stroke-linecap: round; }
.tally-zero { color: var(--rule); font-family: var(--mono); }
.tnum { font-family: var(--mono); font-size: 12px; color: var(--pencil); min-width: 26px; text-align: right; }
.answers { margin-top: 8px; max-height: 260px; overflow-y: auto; }
.answers li { list-style: none; padding: 9px 12px; border-left: 2px solid var(--rule); margin-bottom: 7px; font-size: 14.5px; line-height: 1.5; color: var(--graphite); }

/* ---- received stamp ---- */
.stamp-wrap { padding: 70px 20px 84px; text-align: center; }
.stamp {
  display: inline-block; border: 3px double var(--red); color: var(--red);
  font-family: var(--display); font-weight: 700; text-transform: uppercase;
  letter-spacing: .2em; font-size: 26px; padding: 12px 26px; transform: rotate(-4deg);
  animation: thud .32s cubic-bezier(.2,1.5,.5,1) both;
}
@keyframes thud { from { transform: rotate(-4deg) scale(1.5); opacity: 0 } to { transform: rotate(-4deg) scale(1); opacity: 1 } }
.stamp-wrap p { margin: 26px 0 22px; color: var(--pencil); font-size: 15px; }

.csvbox { border: 1px solid var(--pine); background: #EFF4E9; padding: 14px; margin: 18px 0 4px; }
.csvbox header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.csvbox textarea {
  width: 100%; min-height: 150px; resize: vertical; border: 1px solid var(--rule);
  background: var(--card); color: var(--graphite);
  font-family: var(--mono); font-size: 12px; line-height: 1.6; padding: 10px; white-space: pre;
}
.csvbox textarea:focus { outline: none; border-color: var(--pine); }

.empty { padding: 54px 4px; text-align: center; color: var(--pencil); }
.empty h2 { font-family: var(--display); text-transform: uppercase; color: var(--pine); font-size: 19px; letter-spacing: .02em; margin: 0 0 8px; }
.err { color: var(--red); font-size: 13.5px; padding: 12px 0; }

@media (max-width: 560px) {
  .ss { padding: 14px 10px 44px; }
  .qrow, .qedit { grid-template-columns: 20px 1fr; gap: 0 10px; }
  .mark { width: 11px; }
  .tline .name { min-width: 100%; }
  .tline { flex-wrap: wrap; gap: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .ss *, .ss *::before { animation: none !important; transition: none !important; }
}
`;

/* ------------------------------------------------------------------ */

function Tally({ n }) {
  if (!n) return <span className="tally-zero">—</span>;
  const groups = [];
  let left = n;
  while (left > 0) {
    groups.push(Math.min(5, left));
    left -= 5;
  }
  return (
    <span className="tally" aria-hidden="true">
      {groups.map((g, i) => (
        <svg key={i} width="24" height="18" viewBox="0 0 24 18">
          {[0, 1, 2, 3].slice(0, Math.min(g, 4)).map((j) => (
            <line key={j} x1={3 + j * 5} y1="2" x2={3 + j * 5} y2="16" />
          ))}
          {g === 5 && <line x1="1" y1="15.5" x2="21" y2="2.5" />}
        </svg>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export default function SurveySheet() {
  const [view, setView] = useState("answer");
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [responses, setResponses] = useState([]);
  const [respLoading, setRespLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [count, setCount] = useState(0);
  const [csvText, setCsvText] = useState(null);

  /* initial load */
  useEffect(() => {
    let alive = true;
    (async () => {
      const found = await loadConfig();
      const next = found || STARTER;
      if (!found) {
        try {
          await saveConfig(STARTER);
        } catch {
          /* first-write failure is non-fatal; form still usable */
        }
      }
      if (!alive) return;
      setCfg(next);
      setDraft(JSON.parse(JSON.stringify(next)));
      setLoading(false);
      try {
        const listed = await window.storage.list(RESP_PREFIX, true);
        if (alive) setCount((listed?.keys || []).length);
      } catch {
        /* count is decorative */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshResponses = useCallback(async () => {
    setRespLoading(true);
    try {
      const rows = await loadResponses();
      setResponses(rows);
      setCount(rows.length);
      setError("");
    } catch {
      setError("Couldn't read the collected sheets. Try again in a moment.");
    }
    setRespLoading(false);
  }, []);

  useEffect(() => {
    if (view === "tally") refreshResponses();
  }, [view, refreshResponses]);

  /* ---------------- answering ---------------- */

  const setAnswer = (qid, val) => {
    setAnswers((a) => ({ ...a, [qid]: val }));
    setFlagged((f) => f.filter((x) => x !== qid));
  };

  const toggleMany = (qid, opt) => {
    setAnswers((a) => {
      const cur = Array.isArray(a[qid]) ? a[qid] : [];
      const next = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
      return { ...a, [qid]: next };
    });
    setFlagged((f) => f.filter((x) => x !== qid));
  };

  const isAnswered = (q) => {
    const v = answers[q.id];
    if (q.type === "many") return Array.isArray(v) && v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  };

  const submit = async () => {
    const gaps = cfg.questions.filter((q) => q.required && !isAnswered(q)).map((q) => q.id);
    if (gaps.length) {
      setFlagged(gaps);
      const el = document.getElementById("q-" + gaps[0]);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSending(true);
    setError("");
    try {
      const id = `${Date.now()}-${uid()}`;
      const payload = { id, submittedAt: new Date().toISOString(), answers };
      const ok = await window.storage.set(RESP_PREFIX + id, JSON.stringify(payload), true);
      if (!ok) throw new Error("write failed");
      setDone(true);
      setCount((c) => c + 1);
    } catch {
      setError("The sheet didn't save. Check your connection and press Submit again.");
    }
    setSending(false);
  };

  const answerAnother = () => {
    setAnswers({});
    setFlagged([]);
    setDone(false);
  };

  /* ---------------- building ---------------- */

  const editDraft = (fn) => {
    setDraft((d) => {
      const copy = JSON.parse(JSON.stringify(d));
      fn(copy);
      return copy;
    });
    setDirty(true);
  };

  const addQuestion = (type) =>
    editDraft((d) => {
      d.questions.push({
        id: uid(),
        type,
        label: "",
        required: false,
        options: type === "one" || type === "many" ? ["Option 1", "Option 2"] : [],
      });
    });

  const publish = async () => {
    setError("");
    const clean = {
      ...draft,
      title: draft.title.trim() || "Untitled survey",
      questions: draft.questions.map((q) => ({
        ...q,
        label: q.label.trim() || "Untitled question",
        options: q.options.map((o) => o.trim()).filter(Boolean),
      })),
    };
    try {
      await saveConfig(clean);
      setCfg(clean);
      setDraft(JSON.parse(JSON.stringify(clean)));
      setDirty(false);
      setAnswers({});
      setView("answer");
    } catch {
      setError("Couldn't save the form. Nothing was changed for respondents.");
    }
  };

  const downloadCSV = () => {
    const csv = buildCSV(cfg, responses);
    try {
      /* BOM keeps accented characters intact when Excel opens the file */
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = csvFilename(cfg.title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setCsvText(csv);
    }
  };

  const clearAll = async () => {
    try {
      const listed = await window.storage.list(RESP_PREFIX, true);
      const keys = (listed?.keys || []).map((k) => (typeof k === "string" ? k : k?.key)).filter(Boolean);
      await Promise.all(keys.map((k) => window.storage.delete(k, true)));
      setResponses([]);
      setCount(0);
      setConfirmClear(false);
    } catch {
      setError("Couldn't clear the sheets. Some may remain.");
    }
  };

  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <div className="ss">
        <style>{CSS}</style>
        <div className="sheet">
          <div className="band">
            <span className="band-id">Survey sheet</span>
          </div>
          <div className="empty">Opening the form…</div>
        </div>
      </div>
    );
  }

  const answeredCount = cfg.questions.filter(isAnswered).length;

  return (
    <div className="ss">
      <style>{CSS}</style>
      <div className="sheet">
        <header className="band">
          <span className="band-id">Survey sheet · Shared</span>
          <span className="band-meta">
            Q:{String(cfg.questions.length).padStart(2, "0")} · R:{String(count).padStart(3, "0")}
          </span>
        </header>

        <div className="masthead">
          <h1>{cfg.title}</h1>
          {cfg.intro ? <p>{cfg.intro}</p> : null}
        </div>

        <div className="tabs" role="tablist">
          {[
            ["answer", "Answer"],
            ["build", "Questions"],
            ["tally", "Tally"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              className="tab"
              onClick={() => setView(id)}
            >
              {label}
              {id === "build" && dirty ? " ·" : ""}
            </button>
          ))}
        </div>

        {/* ------------------------- ANSWER ------------------------- */}
        {view === "answer" &&
          (done ? (
            <div className="stamp-wrap">
              <div className="stamp">Received</div>
              <p>Your sheet joined {count === 1 ? "the first one" : `${count} others`} in the pile.</p>
              <button className="btn ghost" onClick={answerAnother}>
                Answer again
              </button>
            </div>
          ) : cfg.questions.length === 0 ? (
            <div className="empty">
              <h2>No questions yet</h2>
              <p>Open the Questions tab to write the first one.</p>
            </div>
          ) : (
            <>
              <div className="body">
                {cfg.questions.map((q, i) => {
                  const bad = flagged.includes(q.id);
                  return (
                    <div className={"qrow" + (bad ? " flag" : "")} id={"q-" + q.id} key={q.id}>
                      <div className="rail">
                        <span className={"mark" + (isAnswered(q) ? " on" : "")} aria-hidden="true" />
                        <span className="qnum">{String(i + 1).padStart(2, "0")}</span>
                      </div>
                      <div>
                        <p className="qlabel">
                          {q.label}
                          {q.required && <span className="req">*</span>}
                        </p>
                        <p className="qhint">
                          {q.type === "many" ? "Mark all that apply" : TYPES.find((t) => t.id === q.type)?.label}
                        </p>

                        {q.type === "short" && (
                          <input
                            className="line"
                            value={answers[q.id] || ""}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                            aria-label={q.label}
                          />
                        )}

                        {q.type === "paragraph" && (
                          <textarea
                            className="ruled"
                            value={answers[q.id] || ""}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                            aria-label={q.label}
                          />
                        )}

                        {q.type === "one" && (
                          <div className="opts">
                            {q.options.map((o) => (
                              <label className="opt" key={o}>
                                <input
                                  type="radio"
                                  name={q.id}
                                  checked={answers[q.id] === o}
                                  onChange={() => setAnswer(q.id, o)}
                                />
                                <span className="bub">
                                  <i />
                                </span>
                                {o}
                              </label>
                            ))}
                          </div>
                        )}

                        {q.type === "many" && (
                          <div className="opts">
                            {q.options.map((o) => (
                              <label className="opt" key={o}>
                                <input
                                  type="checkbox"
                                  checked={Array.isArray(answers[q.id]) && answers[q.id].includes(o)}
                                  onChange={() => toggleMany(q.id, o)}
                                />
                                <span className="bub sq">
                                  <i />
                                </span>
                                {o}
                              </label>
                            ))}
                          </div>
                        )}

                        {q.type === "scale" && (
                          <div>
                            <div className="scale">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <label className="opt" key={n}>
                                  <input
                                    type="radio"
                                    name={q.id}
                                    checked={String(answers[q.id]) === String(n)}
                                    onChange={() => setAnswer(q.id, n)}
                                  />
                                  <span className="bub">
                                    <i />
                                  </span>
                                  <span className="num">{n}</span>
                                </label>
                              ))}
                            </div>
                            <div className="scale-ends">
                              <span>Not at all</span>
                              <span>Very</span>
                            </div>
                          </div>
                        )}

                        {bad && <p className="qerr">Needs a mark before this sheet can go in.</p>}
                      </div>
                    </div>
                  );
                })}
                {error && <p className="err">{error}</p>}
              </div>

              <div className="foot">
                <button className="btn" onClick={submit} disabled={sending}>
                  {sending ? "Sending…" : "Submit sheet"}
                </button>
                <span className="count">
                  {answeredCount}/{cfg.questions.length} marked · {count} collected
                </span>
              </div>
            </>
          ))}

        {/* ------------------------- BUILD ------------------------- */}
        {view === "build" && (
          <>
            <div className="body">
              <div className="qedit">
                <div className="rail">
                  <span className="qnum">Head</span>
                </div>
                <div>
                  <input
                    className="line"
                    value={draft.title}
                    placeholder="Survey title"
                    onChange={(e) => editDraft((d) => (d.title = e.target.value))}
                    aria-label="Survey title"
                  />
                  <textarea
                    className="ruled"
                    style={{ marginTop: 12, minHeight: 62 }}
                    value={draft.intro}
                    placeholder="A line or two telling people what this is for"
                    onChange={(e) => editDraft((d) => (d.intro = e.target.value))}
                    aria-label="Survey introduction"
                  />
                </div>
              </div>

              {draft.questions.map((q, i) => (
                <div className="qedit" key={q.id}>
                  <div className="rail">
                    <span className="mark on" aria-hidden="true" />
                    <span className="qnum">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <input
                      className="line"
                      value={q.label}
                      placeholder="Type the question"
                      onChange={(e) => editDraft((d) => (d.questions[i].label = e.target.value))}
                      aria-label={`Question ${i + 1}`}
                    />

                    <div className="qtools">
                      {TYPES.map((t) => (
                        <button
                          key={t.id}
                          className={"chip" + (q.type === t.id ? " on" : "")}
                          onClick={() =>
                            editDraft((d) => {
                              d.questions[i].type = t.id;
                              if ((t.id === "one" || t.id === "many") && d.questions[i].options.length === 0)
                                d.questions[i].options = ["Option 1", "Option 2"];
                            })
                          }
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {(q.type === "one" || q.type === "many") && (
                      <div style={{ marginTop: 14 }}>
                        {q.options.map((o, oi) => (
                          <div className="optedit" key={oi}>
                            <span className={"bub" + (q.type === "many" ? " sq" : "")}>
                              <i />
                            </span>
                            <input
                              className="line"
                              value={o}
                              onChange={(e) => editDraft((d) => (d.questions[i].options[oi] = e.target.value))}
                              aria-label={`Option ${oi + 1}`}
                            />
                            <button
                              className="chip x"
                              onClick={() => editDraft((d) => d.questions[i].options.splice(oi, 1))}
                              aria-label="Remove option"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          className="chip"
                          onClick={() =>
                            editDraft((d) => d.questions[i].options.push(`Option ${d.questions[i].options.length + 1}`))
                          }
                        >
                          + Option
                        </button>
                      </div>
                    )}

                    <div className="qtools" style={{ marginTop: 16 }}>
                      <button
                        className={"chip" + (q.required ? " on" : "")}
                        onClick={() => editDraft((d) => (d.questions[i].required = !d.questions[i].required))}
                      >
                        {q.required ? "Required" : "Optional"}
                      </button>
                      <button
                        className="chip"
                        disabled={i === 0}
                        onClick={() =>
                          editDraft((d) => {
                            const [m] = d.questions.splice(i, 1);
                            d.questions.splice(i - 1, 0, m);
                          })
                        }
                      >
                        ↑ Up
                      </button>
                      <button
                        className="chip"
                        disabled={i === draft.questions.length - 1}
                        onClick={() =>
                          editDraft((d) => {
                            const [m] = d.questions.splice(i, 1);
                            d.questions.splice(i + 1, 0, m);
                          })
                        }
                      >
                        ↓ Down
                      </button>
                      <button className="chip x" onClick={() => editDraft((d) => d.questions.splice(i, 1))}>
                        Delete question
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="addq">
                {TYPES.map((t) => (
                  <button key={t.id} className="chip" onClick={() => addQuestion(t.id)}>
                    + {t.label}
                  </button>
                ))}
              </div>
              {error && <p className="err">{error}</p>}
            </div>

            <div className="foot">
              <button className="btn" onClick={publish} disabled={!dirty}>
                Save form
              </button>
              <span className="count">
                {dirty ? "Unsaved changes — respondents still see the old form" : "Saved and live"}
              </span>
            </div>
          </>
        )}

        {/* ------------------------- TALLY ------------------------- */}
        {view === "tally" && (
          <>
            <div className="body">
              {csvText !== null && (
                <div className="csvbox">
                  <header>
                    <span className="note">
                      {responses.length} rows · comma-separated · select all and copy
                    </span>
                    <button className="chip" onClick={() => setCsvText(null)}>
                      Hide
                    </button>
                  </header>
                  <textarea readOnly value={csvText} onFocus={(e) => e.target.select()} aria-label="CSV data" />
                </div>
              )}
              {respLoading && <div className="empty">Counting sheets…</div>}
              {!respLoading && responses.length === 0 && (
                <div className="empty">
                  <h2>No sheets yet</h2>
                  <p>Marks appear here as people submit.</p>
                </div>
              )}
              {!respLoading &&
                responses.length > 0 &&
                cfg.questions.map((q, i) => {
                  const vals = responses.map((r) => r.answers?.[q.id]).filter((v) => v !== undefined && v !== "");
                  const isChoice = q.type === "one" || q.type === "many" || q.type === "scale";
                  const buckets = q.type === "scale" ? ["1", "2", "3", "4", "5"] : q.options;
                  return (
                    <div className="tallyrow" key={q.id}>
                      <p className="qhint" style={{ marginBottom: 4 }}>
                        {String(i + 1).padStart(2, "0")} · {vals.length} answered
                      </p>
                      <p className="qlabel" style={{ marginBottom: 10 }}>
                        {q.label}
                      </p>

                      {isChoice ? (
                        buckets.map((b) => {
                          const n = vals.filter((v) =>
                            Array.isArray(v) ? v.includes(b) : String(v) === String(b)
                          ).length;
                          return (
                            <div className="tline" key={b}>
                              <span className="name">{b}</span>
                              <Tally n={n} />
                              <span className="tnum">{n}</span>
                            </div>
                          );
                        })
                      ) : (
                        <ul className="answers">
                          {vals.length === 0 && <li style={{ color: "#8B9186" }}>No written answers yet.</li>}
                          {vals.map((v, vi) => (
                            <li key={vi}>{String(v)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              {error && <p className="err">{error}</p>}
            </div>

            <div className="foot">
              <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn ghost" onClick={refreshResponses} disabled={respLoading}>
                  Refresh
                </button>
                <button className="btn" onClick={downloadCSV} disabled={responses.length === 0}>
                  Download CSV
                </button>
                <button
                  className="chip"
                  disabled={responses.length === 0}
                  onClick={() => setCsvText(csvText === null ? buildCSV(cfg, responses) : null)}
                >
                  {csvText === null ? "Show CSV" : "Hide CSV"}
                </button>
              </span>
              {confirmClear ? (
                <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="count">Delete all {count} sheets?</span>
                  <button className="btn danger" onClick={clearAll}>
                    Yes, delete
                  </button>
                  <button className="chip" onClick={() => setConfirmClear(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="btn danger" onClick={() => setConfirmClear(true)} disabled={count === 0}>
                  Clear all sheets
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <p className="note" style={{ textAlign: "center", maxWidth: 830, margin: "16px auto 0" }}>
        Shared storage — everyone opening this sees the same form and the same collected answers.
      </p>
    </div>
  );
}
