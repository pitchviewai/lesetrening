import { useState, useEffect, useRef, useCallback } from "react";

const MODES = { SETUP: "setup", READING: "reading", RESULT: "result" };
const EXERCISES = { WORD_BY_WORD: "word_by_word", TIMED: "timed" };

function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

export default function App() {
  const [mode, setMode] = useState(MODES.SETUP);
  const [exercise, setExercise] = useState(EXERCISES.WORD_BY_WORD);
  const [inputText, setInputText] = useState("");
  const [words, setWords] = useState([]);
  const [wordStates, setWordStates] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLimit, setTimeLimit] = useState(60);
  const [timeLeft, setTimeLeft] = useState(60);
  const [running, setRunning] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [listenMode, setListenMode] = useState(false);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasSpeech = !!SpeechRecognition;

  const startRecognition = useCallback(() => {
    if (!hasSpeech) return;
    const rec = new SpeechRecognition();
    rec.lang = "nb-NO";
    rec.continuous = true;
    rec.interimResults = false;
    recognitionRef.current = rec;
    rec.onresult = (e) => {
      const spoken = e.results[e.results.length - 1][0].transcript.trim().toLowerCase().replace(/[.,!?;:]/g, "");
      handleSpokenWord(spoken);
    };
    rec.onerror = () => {};
    rec.onend = () => { if (running) rec.start(); };
    rec.start();
  }, [running]);

  function stopRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
  }

  useEffect(() => {
    if (running && exercise === EXERCISES.TIMED) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            endSession();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [running]);

  function handleSpokenWord(spoken) {
    setCurrentIdx(idx => {
      if (idx >= words.length) return idx;
      const expected = words[idx].toLowerCase().replace(/[.,!?;:»«""'']/g, "");
      const correct = spoken === expected || spoken.includes(expected) || expected.includes(spoken);
      setWordStates(ws => {
        const next = [...ws];
        next[idx] = correct ? "correct" : "wrong";
        return next;
      });
      return idx + 1;
    });
  }

  function startSession() {
    const w = tokenize(inputText);
    if (!w.length) return;
    setWords(w);
    setWordStates(new Array(w.length).fill("none"));
    setCurrentIdx(0);
    setTimeLeft(timeLimit);
    setMode(MODES.READING);
    setRunning(true);
    if (listenMode) setTimeout(startRecognition, 300);
  }

  function endSession() {
    setRunning(false);
    stopRecognition();
    clearInterval(timerRef.current);
    setMode(MODES.RESULT);
  }

  function markWord(idx, val) {
    setWordStates(ws => {
      const next = [...ws];
      next[idx] = val;
      return next;
    });
    if (exercise === EXERCISES.WORD_BY_WORD && idx === currentIdx) {
      setCurrentIdx(i => {
        const next = i + 1;
        if (next >= words.length) setTimeout(endSession, 400);
        return next;
      });
    }
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function runOCR() {
    if (!imageFile) return;
    setOcrLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(imageFile);
      });
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: imageFile.type, data: base64 } },
              { type: "text", text: "Trekk ut all tekst fra dette bildet. Returner kun teksten, ingen kommentarer eller forklaringer. Bevar linjeskift og avsnitt." }
            ]
          }]
        })
      });
      const data = await resp.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      setInputText(text);
    } catch (err) {
      alert("OCR feilet. Prøv igjen.");
    }
    setOcrLoading(false);
  }

  function reset() {
    setMode(MODES.SETUP);
    setWords([]);
    setWordStates([]);
    setCurrentIdx(0);
    setRunning(false);
    setImageFile(null);
    setImagePreview(null);
    stopRecognition();
    clearInterval(timerRef.current);
  }

  const correct = wordStates.filter(s => s === "correct").length;
  const wrong = wordStates.filter(s => s === "wrong").length;
  const read = wordStates.filter(s => s !== "none").length;
  const wpm = exercise === EXERCISES.TIMED ? Math.round((correct / timeLimit) * 60) : null;

  if (mode === MODES.SETUP) return (
    <div style={{ fontFamily: "Nunito, sans-serif", maxWidth: 680, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 26, color: "#4f46e5", marginBottom: 4 }}>📖 Lesetreningsapp</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>For å trene lesehastighet og nøyaktighet</p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Øvelsestype</label>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { val: EXERCISES.WORD_BY_WORD, label: "📝 Ord for ord", desc: "Merk riktig/feil underveis" },
            { val: EXERCISES.TIMED, label: "⏱ Tidsbasert", desc: "Les mest mulig på tid" }
          ].map(opt => (
            <div key={opt.val} onClick={() => setExercise(opt.val)}
              style={{ flex: 1, padding: 14, borderRadius: 12, border: `2px solid ${exercise === opt.val ? "#4f46e5" : "#e5e7eb"}`, background: exercise === opt.val ? "#eef2ff" : "#fff", cursor: "pointer" }}>
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{opt.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {exercise === EXERCISES.TIMED && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Tid: {timeLimit} sekunder</label>
          <input type="range" min={15} max={120} step={15} value={timeLimit} onChange={e => setTimeLimit(+e.target.value)}
            style={{ width: "100%" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ca3af" }}>
            <span>15s</span><span>120s</span>
          </div>
        </div>
      )}

      {hasSpeech && (
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" id="listen" checked={listenMode} onChange={e => setListenMode(e.target.checked)} style={{ width: 18, height: 18 }} />
          <label htmlFor="listen" style={{ fontWeight: 600 }}>🎤 Automatisk gjenkjenning (barnet leser høyt)</label>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Lim inn tekst</label>
        <textarea value={inputText} onChange={e => setInputText(e.target.value)}
          placeholder="Lim inn tekst fra boken her..."
          style={{ width: "100%", height: 140, padding: 12, borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 15, resize: "vertical", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 24, padding: 16, background: "#f9fafb", borderRadius: 12, border: "2px dashed #d1d5db" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>📷 Eller skann en side fra boken</div>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => fileInputRef.current.click()} style={{ padding: "8px 16px", borderRadius: 8, background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Velg bilde / Ta foto
          </button>
          {imageFile && (
            <button onClick={runOCR} disabled={ocrLoading}
              style={{ padding: "8px 16px", borderRadius: 8, background: ocrLoading ? "#9ca3af" : "#059669", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
              {ocrLoading ? "Leser tekst..." : "Trekk ut tekst"}
            </button>
          )}
        </div>
        {imagePreview && <img src={imagePreview} alt="Forhåndsvisning" style={{ marginTop: 12, maxHeight: 150, borderRadius: 8 }} />}
      </div>

      <button onClick={startSession} disabled={!inputText.trim()}
        style={{ width: "100%", padding: 16, background: inputText.trim() ? "#4f46e5" : "#d1d5db", color: "#fff", border: "none", borderRadius: 12, fontSize: 18, fontWeight: 700, cursor: inputText.trim() ? "pointer" : "default" }}>
        Start øvelse 🚀
      </button>
    </div>
  );

  if (mode === MODES.READING) return (
    <div style={{ fontFamily: "Nunito, sans-serif", maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: "#4f46e5" }}>Les teksten</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {exercise === EXERCISES.TIMED && (
            <div style={{ fontSize: 28, fontWeight: 800, color: timeLeft <= 10 ? "#ef4444" : "#4f46e5" }}>
              ⏱ {timeLeft}s
            </div>
          )}
          <button onClick={endSession} style={{ padding: "8px 16px", background: "#6b7280", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Avslutt
          </button>
        </div>
      </div>

      {exercise === EXERCISES.WORD_BY_WORD && (
        <div style={{ marginBottom: 16, padding: 10, background: "#fef3c7", borderRadius: 8, fontSize: 14, color: "#92400e" }}>
          {listenMode ? "🎤 Snakk inn i mikrofonen. Ord merkes automatisk." : "Trykk ✅ eller ❌ for hvert ord etter hvert som barnet leser."}
        </div>
      )}
      {exercise === EXERCISES.TIMED && (
        <div style={{ marginBottom: 16, padding: 10, background: "#fef3c7", borderRadius: 8, fontSize: 14, color: "#92400e" }}>
          {listenMode ? "🎤 Barnet leser høyt. Korrekte ord merkes automatisk." : "Trykk på ord som leses FEIL (de blir røde). Riktige ord trykker du ikke på."}
        </div>
      )}

      <div style={{ lineHeight: 2.4, fontSize: 22, background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e5e7eb", minHeight: 200 }}>
        {words.map((word, i) => {
          const state = wordStates[i];
          const isCurrent = i === currentIdx && exercise === EXERCISES.WORD_BY_WORD;
          return (
            <span key={i} style={{ display: "inline-block", margin: "2px 4px" }}>
              <span
                style={{
                  display: "inline-block", padding: "2px 6px", borderRadius: 6,
                  background: state === "correct" ? "#d1fae5" : state === "wrong" ? "#fee2e2" : isCurrent ? "#e0e7ff" : "transparent",
                  color: state === "correct" ? "#065f46" : state === "wrong" ? "#991b1b" : "#111827",
                  border: isCurrent ? "2px solid #4f46e5" : "2px solid transparent",
                  cursor: !listenMode ? "pointer" : "default",
                  fontWeight: isCurrent ? 700 : 400,
                  transition: "all 0.15s"
                }}
                onClick={() => {
                  if (listenMode) return;
                  if (exercise === EXERCISES.TIMED) {
                    markWord(i, state === "wrong" ? "none" : "wrong");
                  }
                }}
              >
                {word}
              </span>
              {exercise === EXERCISES.WORD_BY_WORD && i === currentIdx && !listenMode && (
                <span style={{ marginLeft: 4 }}>
                  <button onClick={() => markWord(i, "correct")}
                    style={{ padding: "2px 8px", background: "#059669", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 16, marginRight: 2 }}>✅</button>
                  <button onClick={() => markWord(i, "wrong")}
                    style={{ padding: "2px 8px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 16 }}>❌</button>
                </span>
              )}
            </span>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 20, fontSize: 15 }}>
        <span style={{ color: "#059669", fontWeight: 700 }}>✅ Riktig: {correct}</span>
        <span style={{ color: "#dc2626", fontWeight: 700 }}>❌ Feil: {wrong}</span>
        <span style={{ color: "#6b7280" }}>Ord igjen: {words.length - currentIdx}</span>
      </div>
    </div>
  );

  if (mode === MODES.RESULT) return (
    <div style={{ fontFamily: "Nunito, sans-serif", maxWidth: 680, margin: "0 auto", padding: 24 }}>
      <h2 style={{ color: "#4f46e5", fontSize: 28 }}>🎉 Ferdig!</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {[
          { label: "✅ Riktige ord", val: correct, color: "#059669", bg: "#d1fae5" },
          { label: "❌ Feil ord", val: wrong, color: "#dc2626", bg: "#fee2e2" },
          { label: "📖 Leste ord totalt", val: read, color: "#4f46e5", bg: "#eef2ff" },
          wpm !== null ? { label: "🚀 Ord per minutt", val: wpm, color: "#d97706", bg: "#fef3c7" } : null
        ].filter(Boolean).map((stat, i) => (
          <div key={i} style={{ padding: 20, borderRadius: 12, background: stat.bg, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: stat.color, fontWeight: 700 }}>{stat.label}</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: stat.color }}>{stat.val}</div>
          </div>
        ))}
      </div>

      {wpm !== null && (
        <div style={{ marginBottom: 24, padding: 16, background: "#f9fafb", borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Lesehastighet sammenlignet med snitt</div>
          <div style={{ height: 24, background: "#e5e7eb", borderRadius: 12, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (wpm / 150) * 100)}%`, background: wpm >= 100 ? "#059669" : "#f59e0b", borderRadius: 12 }} />
            <div style={{ position: "absolute", top: 2, left: "66%", width: 2, height: 20, background: "#4f46e5" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            <span>0</span><span style={{ color: "#4f46e5" }}>Snitt (100 ord/min)</span><span>150+</span>
          </div>
          <p style={{ marginTop: 12, color: wpm >= 100 ? "#059669" : "#d97706", fontWeight: 600 }}>
            {wpm >= 100 ? `Flott! Leser over snittet (${wpm} ord/min)! 🌟` : `Leser ${wpm} ord/min — snittet er 100. Fortsett å øve! 💪`}
          </p>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Gjennomgang av teksten</div>
        <div style={{ lineHeight: 2.2, fontSize: 18, background: "#fff", padding: 16, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          {words.map((word, i) => (
            <span key={i} style={{
              display: "inline-block", margin: "2px 3px", padding: "2px 6px", borderRadius: 6,
              background: wordStates[i] === "correct" ? "#d1fae5" : wordStates[i] === "wrong" ? "#fee2e2" : "#f3f4f6",
              color: wordStates[i] === "correct" ? "#065f46" : wordStates[i] === "wrong" ? "#991b1b" : "#6b7280"
            }}>{word}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={reset} style={{ flex: 1, padding: 14, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          🔄 Ny øvelse
        </button>
        <button onClick={() => { setMode(MODES.READING); setWordStates(new Array(words.length).fill("none")); setCurrentIdx(0); setTimeLeft(timeLimit); setRunning(true); if (listenMode) setTimeout(startRecognition, 300); }}
          style={{ flex: 1, padding: 14, background: "#059669", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          🔁 Prøv igjen
        </button>
      </div>
    </div>
  );
}
