import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LIBRARY } from './library.js';
import { SEED_MOTIONS, inferTopic } from './motions.js';

// ===========================================================================
// Debate Drill — burden/mechanism trainer + de-brief reader
// Persists to localStorage. AI grading via /api/grade serverless proxy.
// ===========================================================================

const STARTER_LIBRARY = [
  { id: 'nationalization-accountability', topic: 'Nationalization', side: 'Pro-Nationalization',
    claim: 'Nationalized industries are more accountable than private ones because governments face electoral consequences for mismanagement.',
    mechanism: "Private companies' sole incentive is profit and they have resources to avoid accountability for harm. Governments need to win elections, so politicians have incentive to keep prices low, hire fairly, and maintain service quality." },
  { id: 'pro-sanctions-elite-targeting', topic: 'Sanctions', side: 'Pro-Sanctions',
    claim: 'Sanctions work by harming the elites who actually have power to change the targeted behavior.',
    mechanism: 'When sanctions specifically degrade the assets/interests of elites with decision-making power, it creates direct incentive for those elites to either negotiate or capitulate to sanction terms.' },
  { id: 'anti-democracy-nonexistent-influence', topic: 'Anti-Democracy Principles', side: 'Anti-Democracy', type: 'framework',
    claim: "An individual's right to vote is functionally meaningless in large electorates, since no single vote ever decides an outcome.",
    mechanism: 'In an electorate of thousands or millions, any single vote has an effectively zero probability of being the deciding vote.' },
  { id: 'no-deterrence-certainty-not-severity', topic: 'Justice System', side: 'No Deterrence',
    claim: 'Criminal deterrence is driven by perceived likelihood of being caught, not severity of punishment.',
    mechanism: 'Potential criminals typically believe they can evade capture, meaning their decision calculus weighs catch-probability far more heavily than sentence length.' },
  { id: 'open-borders-consent-theory', topic: 'Open Borders', side: 'Pro Open Borders', type: 'framework',
    claim: 'Open borders are morally required because state legitimacy depends on consent of the governed, and birthplace is arbitrary.',
    mechanism: 'Since birthplace is morally arbitrary, and states exercise coercive force over subjects, state authority is only legitimate if individuals can meaningfully consent to live under it — free movement is the mechanism for exercising that consent.' },
  { id: 'criminalization-third-party-harm-principle', topic: 'Legalization vs Criminalization', side: 'Anti-Legalization', type: 'framework',
    claim: 'Government restriction of personal autonomy is justified when an action poses meaningful harm to third parties.',
    mechanism: "Pure autonomy-based objections fail when an action's effects extend beyond the individual making the choice." },
];

// GitHub repo that holds the daily/weekly briefings (public).
const BRIEF_REPO = 'ksrhhh/de-brief';
const BRIEF_DIR = 'briefings';

const K_HISTORY = 'drill:history';
const K_LIBRARY = 'drill:library-full';
const K_QUEUE = 'drill:approval-queue';
const K_FLASH = 'drill:flashcard-history';
const K_SETTINGS = 'drill:settings';
const K_BRIEF_CACHE = 'drill:brief-cache';
const K_MOTIONS = 'drill:motions';

// Persistence via localStorage (survives refresh, per-browser).
const mem = {};
async function sGet(key) {
  try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : null; }
  catch (e) { return mem[key] ?? null; }
}
async function sSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { mem[key] = value; }
}
async function sDel(key) {
  try { localStorage.removeItem(key); }
  catch (e) { delete mem[key]; }
}

async function callClaude(systemPrompt, userPrompt, maxTokens = 1000) {
  const response = await fetch('/api/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system: systemPrompt, userPrompt, maxTokens }),
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const data = await response.json();
  const text = data.text || '';
  return text.replace(/```json|```/g, '').trim();
}

async function gradeAnswer(topic, side, stockArg, userAnswer, elapsedSeconds) {
  const systemPrompt = `You are a competitive BP/Parli debate coach grading a speed drill. \
The debater was given a topic, a SIDE to argue, and a SPECIFIC named stock argument/impact to \
build out. Their job was to generate the BURDEN(S) that stock argument requires plus a concrete \
MECHANISM filling each burden — under time pressure.

Write your model answer in the voice of a real debate coach's case file: numbered reasons, each \
a tight causal chain (claim -> mechanism -> impact), with concrete examples chained in where they \
strengthen the case.

Respond in this exact JSON shape, nothing else, no markdown fences:
{
  "tags": {
    "burden": "on-target" | "too-generic" | "missed",
    "mechanism": "concrete" | "vague" | "missing",
    "weighing": "present" | "missing" | "not-applicable"
  },
  "note": "2-3 sentences of specific feedback in a direct coaching voice",
  "modelAnswer": "the model answer, 3-5 numbered points, debate-coach style"
}`;
  const userPrompt = `Topic: ${topic}\nSide: ${side}\nStock argument to build: ${stockArg}\nDebater's answer (took ${elapsedSeconds}s): ${userAnswer}\n\nGrade this.`;
  const cleaned = await callClaude(systemPrompt, userPrompt, 1000);
  return JSON.parse(cleaned);
}

async function generateCandidateArguments(topic, existingClaims) {
  const systemPrompt = `You are drafting CANDIDATE stock arguments for a debate practice library, \
matching the exact style of existing entries: a one-sentence claim, then a mechanism explaining the \
causal chain (claim -> mechanism -> impact), in the voice of a real debate coach's reference document \
— concrete, not academic. These are DRAFTS that a human will review before they're trusted.

Respond in this exact JSON shape, nothing else: \
{"candidates": [{"side": "...", "claim": "...", "mechanism": "..."}, ...]} \
Generate 3 candidates. Do not duplicate the existing claims provided.`;
  const userPrompt = `Topic: ${topic}\nExisting claims already in the library for this topic:\n${existingClaims.join('\n')}\n\nGenerate 3 new candidate arguments for this topic.`;
  const cleaned = await callClaude(systemPrompt, userPrompt, 1200);
  return JSON.parse(cleaned).candidates;
}

async function generateMotionBurden(motion, side, infoSlide) {
  const systemPrompt = `You are a BP/Parli debate coach. Given a real motion and the side the \
debater must argue, name ONE specific, high-value stock argument/claim they should build for that \
side — the kind of claim that, once burdened and mechanised, wins the room. Phrase it as a single \
crisp claim sentence, exactly like a stock-argument library entry (not a whole case).

Respond in this exact JSON shape, nothing else: {"side": "...", "claim": "..."}`;
  const userPrompt = `Motion: ${motion}\nSide to argue: ${side}\n${infoSlide ? `Info slide: ${infoSlide}\n` : ''}\nGive one strong claim for this side to build.`;
  const cleaned = await callClaude(systemPrompt, userPrompt, 400);
  return JSON.parse(cleaned);
}

// --- tiny markdown renderer (headings, bold, italic, lists, hr, code) ------
function renderMarkdown(md) {
  if (!md) return null;
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  const inline = (t) => {
    const parts = [];
    let rest = t; let key = 0;
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;
    let m;
    while ((m = rest.match(re))) {
      if (m.index > 0) parts.push(rest.slice(0, m.index));
      const tok = m[0];
      if (tok.startsWith('**')) parts.push(<strong key={key++} style={{ color: '#F5F1E8' }}>{tok.slice(2, -2)}</strong>);
      else if (tok.startsWith('`')) parts.push(<code key={key++} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.88em', background: '#1A1A1D', padding: '1px 5px', borderRadius: 4, color: '#C9A961' }}>{tok.slice(1, -1)}</code>);
      else parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
      rest = rest.slice(m.index + tok.length);
    }
    if (rest) parts.push(rest);
    return parts;
  };
  const flushList = () => { if (list) { blocks.push(<ul key={blocks.length} style={{ margin: '4px 0 14px', paddingLeft: 20, color: '#D8D4C8', lineHeight: 1.6 }}>{list}</ul>); list = null; } };
  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); return; }
    if (/^#{1,6}\s/.test(line)) {
      flushList();
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s/, '');
      const sizes = { 1: 22, 2: 18, 3: 15.5, 4: 14 };
      blocks.push(<div key={blocks.length} style={{ fontFamily: "'Source Serif 4', serif", fontSize: sizes[level] || 14, color: '#F5F1E8', fontWeight: 600, margin: level <= 2 ? '20px 0 8px' : '14px 0 6px', lineHeight: 1.3 }}>{inline(text)}</div>);
    } else if (/^(-|\*|\d+\.)\s/.test(line)) {
      if (!list) list = [];
      list.push(<li key={list.length} style={{ marginBottom: 5 }}>{inline(line.replace(/^(-|\*|\d+\.)\s/, ''))}</li>);
    } else if (/^(-{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      blocks.push(<hr key={blocks.length} style={{ border: 'none', borderTop: '1px solid #232326', margin: '18px 0' }} />);
    } else {
      flushList();
      blocks.push(<p key={blocks.length} style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, color: '#D8D4C8', lineHeight: 1.65, margin: '0 0 12px' }}>{inline(line)}</p>);
    }
  });
  flushList();
  return blocks;
}

// --- timer ring -------------------------------------------------------------
function TimerRing({ secondsElapsed, targetSeconds, running }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const remaining = Math.max(targetSeconds - secondsElapsed, 0);
  const progress = targetSeconds > 0 ? remaining / targetSeconds : 0;
  const offset = circ * (1 - progress);
  const over = secondsElapsed > targetSeconds;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const oMm = String(Math.floor((secondsElapsed - targetSeconds) / 60)).padStart(2, '0');
  const oSs = String((secondsElapsed - targetSeconds) % 60).padStart(2, '0');
  return (
    <div style={{ position: 'relative', width: 132, height: 132 }}>
      <svg width="132" height="132" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="66" cy="66" r={radius} fill="none" stroke="#2A2A2E" strokeWidth="6" />
        <circle cx="66" cy="66" r={radius} fill="none" stroke={over ? '#A8453C' : '#C9A961'} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={over ? 0 : offset} strokeLinecap="round"
          style={{ transition: running ? 'stroke-dashoffset 1s linear' : 'none' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: over ? 22 : 28, color: over ? '#A8453C' : '#F5F1E8', fontWeight: 500 }}>
        {over ? `+${oMm}:${oSs}` : `${mm}:${ss}`}
      </div>
    </div>
  );
}

function TagPill({ label, value }) {
  const cmap = { 'on-target': '#5B7A6B', 'concrete': '#5B7A6B', 'present': '#5B7A6B', 'too-generic': '#C9A961', 'vague': '#C9A961', 'missed': '#A8453C', 'missing': '#A8453C', 'not-applicable': '#5C5C62' };
  const color = cmap[value] || '#5C5C62';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 100, background: '#1A1A1D', border: `1px solid ${color}55`, fontFamily: "'Inter', sans-serif", fontSize: 12.5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: '#8A8A92' }}>{label}</span>
      <span style={{ color: '#F5F1E8', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ===========================================================================
// Root
// ===========================================================================
export default function DrillTool() {
  const [library, setLibrary] = useState(LIBRARY);
  const [history, setHistory] = useState([]);
  const [flashHistory, setFlashHistory] = useState([]);
  const [queue, setQueue] = useState([]);
  const [motions, setMotions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState('drill');        // drill | cards | brief | motions | more
  const [overlay, setOverlay] = useState(null);   // null | 'import' | 'queue' | 'settings' | 'stats'

  const [targetSeconds, setTargetSeconds] = useState(180);
  const [filterTopic, setFilterTopic] = useState('all');

  // drill session
  const [phase, setPhase] = useState('idle');     // idle | running | feedback
  const [current, setCurrent] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState(null);
  const [gradeError, setGradeError] = useState(null);

  // flashcard session
  const [flashcard, setFlashcard] = useState(null);
  const [flashStep, setFlashStep] = useState('idle'); // idle | front | recalled | revealed

  const intervalRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [h, lib, q, fh, set, mo] = await Promise.all([
        sGet(K_HISTORY), sGet(K_LIBRARY), sGet(K_QUEUE), sGet(K_FLASH), sGet(K_SETTINGS), sGet(K_MOTIONS),
      ]);
      if (h) setHistory(h);
      if (lib && lib.length) {
        setLibrary(lib);
      } else {
        // First run on this device: seed the full bundled library into storage.
        setLibrary(LIBRARY);
        await sSet(K_LIBRARY, LIBRARY);
      }
      if (q) setQueue(q);
      if (fh) setFlashHistory(fh);
      if (set?.targetSeconds) setTargetSeconds(set.targetSeconds);
      if (mo && mo.length) {
        setMotions(mo);
      } else {
        setMotions(SEED_MOTIONS);
        await sSet(K_MOTIONS, SEED_MOTIONS);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (running) intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const topics = [...new Set(library.map(a => a.topic))].sort();
  const topicCounts = library.reduce((m, a) => { m[a.topic] = (m[a.topic] || 0) + 1; return m; }, {});

  const pickEntry = useCallback((pool) => {
    const weighted = pool.map(entry => {
      const past = history.filter(h => h.entryId === entry.id);
      const last = past.length ? past[past.length - 1].selfRating : null;
      return { entry, weight: Math.max(last ? (5 - last) : 3, 1) };
    });
    const total = weighted.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of weighted) { r -= x.weight; if (r <= 0) return x.entry; }
    return pool[0];
  }, [history]);

  const poolFor = () => filterTopic === 'all' ? library : library.filter(a => a.topic === filterTopic);

  // ---- drill actions ----
  const startDrill = () => {
    const pool = poolFor();
    if (!pool.length) return;
    setCurrent(pickEntry(pool));
    setAnswer(''); setGradeResult(null); setGradeError(null);
    setSeconds(0); setPhase('running'); setRunning(true);
  };
  const stopTimer = () => setRunning(false);
  const quitDrill = () => { setRunning(false); setPhase('idle'); setCurrent(null); setAnswer(''); setGradeResult(null); setGradeError(null); };
  const skipDrill = () => { setRunning(false); const pool = poolFor(); if (!pool.length) return; setCurrent(pickEntry(pool)); setAnswer(''); setGradeResult(null); setGradeError(null); setSeconds(0); setPhase('running'); setRunning(true); };

  const submitAnswer = async () => {
    setRunning(false); setGrading(true); setGradeError(null);
    try {
      const result = await gradeAnswer(current.topic, current.side, current.claim, answer, seconds);
      setGradeResult(result); setPhase('feedback');
    } catch (e) {
      setGradeError("Grading didn't go through — check your connection and try again. Your answer is still here.");
    }
    setGrading(false);
  };

  const finishRound = async (rating) => {
    const entry = { entryId: current.id, topic: current.topic, side: current.side, claim: current.claim,
      answer, elapsedSeconds: seconds, aiTags: gradeResult?.tags || null, aiNote: gradeResult?.note || null,
      selfRating: rating, timestamp: new Date().toISOString() };
    const next = [...history, entry];
    setHistory(next); await sSet(K_HISTORY, next);
    quitDrill();
  };

  // ---- flashcard actions ----
  const startFlash = () => { const pool = poolFor(); if (!pool.length) return; setFlashcard(pickEntry(pool)); setFlashStep('front'); };
  const nextFlash = () => { const pool = poolFor(); if (!pool.length) return; setFlashcard(pickEntry(pool)); setFlashStep('front'); };
  const rateFlash = async (rating) => {
    const entry = { entryId: flashcard.id, topic: flashcard.topic, selfRating: rating, timestamp: new Date().toISOString() };
    const next = [...flashHistory, entry];
    setFlashHistory(next); await sSet(K_FLASH, next);
    nextFlash();
  };
  const quitFlash = () => { setFlashStep('idle'); setFlashcard(null); };

  // ---- import / queue / reset ----
  const importLibrary = async (text) => {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('That JSON needs to be an array of argument objects.');
    const ids = new Set(library.map(a => a.id));
    const fresh = parsed.filter(a => a && a.id && !ids.has(a.id));
    const merged = [...library, ...fresh];
    setLibrary(merged); await sSet(K_LIBRARY, merged);
    return { added: fresh.length, dupes: parsed.length - fresh.length, total: merged.length };
  };
  const requestCandidates = async (topic) => {
    const existing = library.filter(a => a.topic === topic).map(a => a.claim);
    const cands = await generateCandidateArguments(topic, existing);
    const queued = cands.map((c, i) => ({ id: `draft-${topic}-${Date.now()}-${i}`, topic, ...c, status: 'pending' }));
    const next = [...queue, ...queued];
    setQueue(next); await sSet(K_QUEUE, next);
  };
  const approveCandidate = async (c) => {
    const entry = { ...c, id: c.id.replace('draft-', 'approved-'), verified: false, source: 'AI-drafted, approved' };
    const lib = [...library, entry]; setLibrary(lib); await sSet(K_LIBRARY, lib);
    const q = queue.filter(x => x.id !== c.id); setQueue(q); await sSet(K_QUEUE, q);
  };
  const rejectCandidate = async (c) => { const q = queue.filter(x => x.id !== c.id); setQueue(q); await sSet(K_QUEUE, q); };

  const resetLibrary = async () => { setLibrary(LIBRARY); await sSet(K_LIBRARY, LIBRARY); };
  const resetProgress = async () => { await sDel(K_HISTORY); await sDel(K_FLASH); setHistory([]); setFlashHistory([]); };
  const updateTarget = async (v) => { setTargetSeconds(v); await sSet(K_SETTINGS, { targetSeconds: v }); };

  // ---- motions ----
  const persistMotions = async (next) => { setMotions(next); await sSet(K_MOTIONS, next); };

  const logMotion = async ({ motion, side, note, topic }) => {
    const inferred = topic || inferTopic(motion, '') || null;
    const entry = {
      id: `logged-${Date.now()}`, motion: motion.trim(), tag: null, round: null,
      tournament: 'My round', infoSlide: null, sideBias: null,
      topic: inferred, side: side || null, note: note?.trim() || null,
      source: 'logged', timestamp: new Date().toISOString(),
    };
    await persistMotions([entry, ...motions]);
  };

  const importMotionsFromCalico = async (url) => {
    const res = await fetch('/api/motions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
    const existing = new Set(motions.map(m => `${m.tournament}|${m.motion}`));
    const fresh = data.motions
      .map((m, i) => ({
        id: `calico-${Date.now()}-${i}`,
        motion: m.motion, tag: m.tag || null, round: m.round || null,
        tournament: data.tournament || 'Imported', infoSlide: m.infoSlide || null,
        sideBias: null, topic: inferTopic(m.motion, m.infoSlide), side: null,
        note: null, source: data.tournament || 'Calico import', timestamp: new Date().toISOString(),
      }))
      .filter(m => !existing.has(`${m.tournament}|${m.motion}`));
    await persistMotions([...fresh, ...motions]);
    return { added: fresh.length, tournament: data.tournament };
  };

  const deleteMotion = async (id) => { await persistMotions(motions.filter(m => m.id !== id)); };

  // Drill from a motion: prefer a real library entry matching the motion's topic;
  // fall back to AI-generated burden only when nothing matches.
  const drillFromMotion = async (motion, side) => {
    setTab('drill'); setAnswer(''); setGradeResult(null); setGradeError(null);
    const matches = motion.topic ? library.filter(a => a.topic === motion.topic) : [];
    let entry;
    if (matches.length) {
      const picked = pickEntry(matches);
      entry = { ...picked, side: side || picked.side, _motion: motion.motion, _fromMotion: true };
    } else {
      // AI fallback
      setCurrent({ id: `motion-loading`, topic: motion.topic || 'Motion', side: side || 'Government',
        claim: 'Generating a target burden for this motion…', _motion: motion.motion, _fromMotion: true, _loading: true });
      setPhase('running'); setRunning(false); setSeconds(0);
      try {
        const gen = await generateMotionBurden(motion.motion, side || 'Government', motion.infoSlide);
        entry = { id: `motion-${Date.now()}`, topic: motion.topic || 'Motion', side: gen.side || side || 'Government',
          claim: gen.claim, mechanism: '', _motion: motion.motion, _fromMotion: true, _aiGenerated: true };
      } catch (e) {
        setGradeError('Could not generate a target for this motion — try another, or check your API key.');
        entry = { id: `motion-${Date.now()}`, topic: motion.topic || 'Motion', side: side || 'Government',
          claim: `Build the strongest case for ${side || 'Government'} on this motion.`, _motion: motion.motion, _fromMotion: true };
      }
    }
    setCurrent(entry); setSeconds(0); setPhase('running'); setRunning(true);
  };

  if (!loaded) return <div style={shell}><div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif" }}>Loading…</div></div>;

  const inSession = (tab === 'drill' && phase !== 'idle') || (tab === 'cards' && flashStep !== 'idle');

  return (
    <div style={shell}>
      <style>{fontCss}</style>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1, paddingBottom: 88 }}>
          {tab === 'drill' && phase === 'idle' && (
            <DrillHome topics={topics} topicCounts={topicCounts} filterTopic={filterTopic} setFilterTopic={setFilterTopic}
              targetSeconds={targetSeconds} setTargetSeconds={updateTarget} onStart={startDrill}
              history={history} librarySize={library.length} poolSize={poolFor().length} />
          )}
          {tab === 'drill' && phase === 'running' && (
            <DrillRun entry={current} seconds={seconds} targetSeconds={targetSeconds} running={running}
              answer={answer} setAnswer={setAnswer} onSubmit={submitAnswer} onStopTimer={stopTimer}
              onSkip={skipDrill} onQuit={quitDrill} grading={grading} error={gradeError} />
          )}
          {tab === 'drill' && phase === 'feedback' && gradeResult && (
            <DrillFeedback entry={current} answer={answer} seconds={seconds} result={gradeResult}
              onRate={finishRound} onQuit={quitDrill} />
          )}

          {tab === 'cards' && flashStep === 'idle' && (
            <CardsHome topics={topics} topicCounts={topicCounts} filterTopic={filterTopic} setFilterTopic={setFilterTopic}
              onStart={startFlash} flashHistory={flashHistory} poolSize={poolFor().length} />
          )}
          {tab === 'cards' && flashStep !== 'idle' && flashcard && (
            <CardRun entry={flashcard} step={flashStep} setStep={setFlashStep} onRate={rateFlash} onQuit={quitFlash} />
          )}

          {tab === 'brief' && <BriefTab />}
          {tab === 'motions' && (
            <MotionsTab motions={motions} libraryTopics={topics}
              onDrill={drillFromMotion} onLog={logMotion} onImport={importMotionsFromCalico} onDelete={deleteMotion} />
          )}
          {tab === 'more' && (
            <MoreTab librarySize={library.length} queueCount={queue.length} motionCount={motions.length}
              onImport={() => setOverlay('import')} onQueue={() => setOverlay('queue')}
              onSettings={() => setOverlay('settings')} onStats={() => setOverlay('stats')} />
          )}
        </div>

        {!inSession && <TabBar tab={tab} setTab={setTab} queueCount={queue.length} />}
      </div>

      {overlay === 'stats' && (
        <Overlay title="Progress" onClose={() => setOverlay(null)}>
          <StatsTab history={history} flashHistory={flashHistory} embedded />
        </Overlay>
      )}

      {overlay === 'import' && <ImportOverlay onClose={() => setOverlay(null)} onImport={importLibrary} librarySize={library.length} />}
      {overlay === 'queue' && <QueueOverlay onClose={() => setOverlay(null)} queue={queue} topics={topics}
        onRequest={requestCandidates} onApprove={approveCandidate} onReject={rejectCandidate} />}
      {overlay === 'settings' && <SettingsOverlay onClose={() => setOverlay(null)} librarySize={library.length}
        historyCount={history.length} flashCount={flashHistory.length}
        onResetLibrary={resetLibrary} onResetProgress={resetProgress} />}
    </div>
  );
}

// ===========================================================================
// Tab bar
// ===========================================================================
function TabBar({ tab, setTab, queueCount }) {
  const tabs = [
    { id: 'drill', label: 'Drill', icon: '◷' },
    { id: 'cards', label: 'Cards', icon: '▭' },
    { id: 'brief', label: 'Brief', icon: '✦' },
    { id: 'motions', label: 'Motions', icon: '⚑' },
    { id: 'more', label: 'More', icon: '⋯' },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', background: 'linear-gradient(to top, #0E0E10 70%, transparent)', paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', borderTop: '1px solid #1E1E22', background: '#121214' }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '11px 0 13px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, position: 'relative',
            }}>
              <span style={{ fontSize: 17, color: active ? '#C9A961' : '#5C5C62', lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: active ? '#F5F1E8' : '#5C5C62', fontWeight: active ? 600 : 400 }}>{t.label}</span>
              {t.id === 'more' && queueCount > 0 && (
                <span style={{ position: 'absolute', top: 7, right: '50%', marginRight: -20, width: 6, height: 6, borderRadius: '50%', background: '#C9A961' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// DRILL
// ===========================================================================
function TopicPicker({ topics, topicCounts, filterTopic, setFilterTopic }) {
  return (
    <div>
      <div style={label}>Topic</div>
      <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} style={select}>
        <option value="all">All topics</option>
        {topics.map(t => <option key={t} value={t}>{t} ({topicCounts[t]})</option>)}
      </select>
    </div>
  );
}

function DrillHome({ topics, topicCounts, filterTopic, setFilterTopic, targetSeconds, setTargetSeconds, onStart, history, librarySize, poolSize }) {
  const recent = history.length;
  const avg = recent ? Math.round(history.slice(-10).reduce((s, h) => s + h.elapsedSeconds, 0) / Math.min(10, recent)) : null;
  return (
    <div style={{ padding: '36px 20px 0' }}>
      <Eyebrow>Burden &amp; Mechanism Drill</Eyebrow>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: '#5C5C62', marginBottom: 30 }}>
        {librarySize} arguments{recent > 0 && ` · ${recent} rounds`}{avg ? ` · avg ${avg}s` : ''}
      </div>

      <div style={card}>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, color: '#F5F1E8', marginBottom: 6, lineHeight: 1.4 }}>
          You'll get a topic, a side, and one stock argument.
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: '#8A8A92', lineHeight: 1.55 }}>
          Generate the burdens it needs and a concrete mechanism for each — against the clock. A coach grades it.
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={label}>Time limit</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="range" min="30" max="600" step="15" value={targetSeconds}
            onChange={e => setTargetSeconds(parseInt(e.target.value))} style={{ flex: 1, accentColor: '#C9A961' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#C9A961', minWidth: 46 }}>
            {Math.floor(targetSeconds / 60)}:{String(targetSeconds % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <TopicPicker topics={topics} topicCounts={topicCounts} filterTopic={filterTopic} setFilterTopic={setFilterTopic} />
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: '#5C5C62', marginTop: 6 }}>
          {poolSize} argument{poolSize === 1 ? '' : 's'} in this pool
        </div>
      </div>

      <button onClick={onStart} disabled={!poolSize} style={{ ...primaryBtn, width: '100%', marginTop: 28, opacity: poolSize ? 1 : 0.5 }}>Start round</button>
    </div>
  );
}

function DrillRun({ entry, seconds, targetSeconds, running, answer, setAnswer, onSubmit, onStopTimer, onSkip, onQuit, grading, error }) {
  const isFramework = !entry.side || entry.type === 'framework' || entry.type === 'mechanism_tool';
  return (
    <div style={{ padding: '20px 20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={onQuit} style={ghostBtn}>← End round</button>
        <button onClick={onSkip} style={ghostBtn}>Skip →</button>
      </div>

      {entry._fromMotion && (
        <div style={{ ...card, marginBottom: 12, borderColor: '#C9A96155', background: '#17150F' }}>
          <div style={label}>Motion</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15.5, color: '#F5F1E8', lineHeight: 1.4 }}>{entry._motion}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: entry._aiGenerated ? '#C9A961' : '#5B7A6B', marginTop: 8 }}>
            {entry._aiGenerated ? 'AI-suggested target (no library match)' : 'Target pulled from your library'}
          </div>
        </div>
      )}

      <div style={card}>
        <div style={label}>Topic</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, color: '#F5F1E8', marginBottom: 14 }}>{entry.topic}</div>
        {entry.side ? (<>
          <div style={label}>Your side</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: '#C9A961', fontWeight: 600, marginBottom: 14 }}>{entry.side}</div>
        </>) : (
          <div style={{ display: 'inline-block', fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#8A8A92', border: '1px solid #2A2A2E', borderRadius: 100, padding: '3px 10px', marginBottom: 14 }}>
            {entry.type === 'mechanism_tool' ? 'Reasoning tool' : 'Framework'} — apply it
          </div>
        )}
        <div style={label}>{isFramework ? 'Deploy this' : 'Build this argument'}</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 17, color: '#F5F1E8', lineHeight: 1.4 }}>{entry.claim}</div>
      </div>

      <div onClick={running ? onStopTimer : undefined}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0', cursor: running ? 'pointer' : 'default' }}>
        <TimerRing secondsElapsed={seconds} targetSeconds={targetSeconds} running={running} />
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: '#5C5C62', marginTop: 8 }}>
          {running ? 'tap to stop the clock' : 'clock stopped'}
        </div>
      </div>

      <textarea value={answer} onChange={e => setAnswer(e.target.value)} autoFocus
        placeholder="Burdens + a concrete mechanism for each…" style={textarea} />
      {error && <div style={{ color: '#A8453C', fontSize: 13, fontFamily: "'Inter', sans-serif", marginTop: 8 }}>{error}</div>}
      <button onClick={onSubmit} disabled={grading || !answer.trim()}
        style={{ ...primaryBtn, width: '100%', marginTop: 16, opacity: (grading || !answer.trim()) ? 0.5 : 1 }}>
        {grading ? 'Grading…' : 'Submit for grading'}
      </button>
    </div>
  );
}

function DrillFeedback({ entry, answer, seconds, result, onRate, onQuit }) {
  const [rated, setRated] = useState(false);
  return (
    <div style={{ padding: '20px 20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#C9A961', fontSize: 14 }}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} on the clock
        </span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#5C5C62' }}>{entry.topic}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <TagPill label="burden" value={result.tags.burden} />
        <TagPill label="mechanism" value={result.tags.mechanism} />
        <TagPill label="weighing" value={result.tags.weighing} />
      </div>
      <div style={label}>Coach's note</div>
      <div style={{ ...prose, marginBottom: 22 }}>{result.note}</div>
      <div style={label}>What you wrote</div>
      <div style={{ ...prose, color: '#8A8A92', marginBottom: 22, whiteSpace: 'pre-wrap' }}>{answer || '—'}</div>
      <div style={label}>Model answer</div>
      <div style={{ ...prose, whiteSpace: 'pre-wrap', marginBottom: 26 }}>{result.modelAnswer}</div>
      {!rated ? (<>
        <div style={label}>Rate yourself honestly</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {[1, 2, 3, 4].map(n => <button key={n} onClick={() => { setRated(true); onRate(n); }} style={ratingBtn}>{n}</button>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5C5C62', marginTop: 6, fontFamily: "'Inter', sans-serif" }}>
          <span>Missed it</span><span>Round-ready</span>
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: '#5C5C62', marginTop: 14, lineHeight: 1.5 }}>
          Lower scores resurface this argument more often.
        </div>
      </>) : <div style={{ color: '#5B7A6B', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Saved.</div>}
    </div>
  );
}

// ===========================================================================
// CARDS
// ===========================================================================
function CardsHome({ topics, topicCounts, filterTopic, setFilterTopic, onStart, flashHistory, poolSize }) {
  return (
    <div style={{ padding: '36px 20px 0' }}>
      <Eyebrow>Flashcard Review</Eyebrow>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: '#5C5C62', marginBottom: 30 }}>
        {flashHistory.length} cards reviewed
      </div>
      <div style={card}>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, color: '#F5F1E8', marginBottom: 6, lineHeight: 1.4 }}>
          Topic and side first. Recall the argument, then check the full chain.
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: '#8A8A92', lineHeight: 1.55 }}>
          No clock here — this is for memorising the library cold, so the mechanism is there when you need it.
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        <TopicPicker topics={topics} topicCounts={topicCounts} filterTopic={filterTopic} setFilterTopic={setFilterTopic} />
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: '#5C5C62', marginTop: 6 }}>{poolSize} card{poolSize === 1 ? '' : 's'} in this pool</div>
      </div>
      <button onClick={onStart} disabled={!poolSize} style={{ ...primaryBtn, width: '100%', marginTop: 28, opacity: poolSize ? 1 : 0.5 }}>Start review</button>
    </div>
  );
}

function CardRun({ entry, step, setStep, onRate, onQuit }) {
  return (
    <div style={{ padding: '20px 20px 0' }}>
      <button onClick={onQuit} style={ghostBtn}>← End review</button>
      <div style={{ marginTop: 16, ...card }}>
        <div style={label}>Topic</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, color: '#F5F1E8', marginBottom: entry.side ? 14 : 0 }}>{entry.topic}</div>
        {entry.side && (<>
          <div style={label}>Side</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: '#C9A961', fontWeight: 600 }}>{entry.side}</div>
        </>)}
      </div>

      {step === 'front' && (
        <div style={{ marginTop: 26, textAlign: 'center' }}>
          <div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
            Which argument applies here? Say it out loud, then reveal.
          </div>
          <button onClick={() => setStep('recalled')} style={{ ...primaryBtn, width: '100%' }}>Show the argument</button>
        </div>
      )}
      {step === 'recalled' && (
        <div style={{ marginTop: 24 }}>
          <div style={label}>The argument</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 17, color: '#F5F1E8', lineHeight: 1.4, marginBottom: 22 }}>{entry.claim}</div>
          <button onClick={() => setStep('revealed')} style={{ ...primaryBtn, width: '100%' }}>Reveal mechanism</button>
        </div>
      )}
      {step === 'revealed' && (
        <div style={{ marginTop: 24 }}>
          <div style={label}>The argument</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 17, color: '#F5F1E8', lineHeight: 1.4, marginBottom: 18 }}>{entry.claim}</div>
          <div style={label}>Mechanism</div>
          <div style={{ ...prose, marginBottom: 20 }}>{entry.mechanism}</div>
          {entry.examples?.length > 0 && (<>
            <div style={label}>Examples</div>
            <div style={{ ...prose, marginBottom: 22, color: '#8A8A92' }}>{entry.examples.join(' · ')}</div>
          </>)}
          <div style={label}>How well did you recall it?</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[1, 2, 3, 4].map(n => <button key={n} onClick={() => onRate(n)} style={ratingBtn}>{n}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// BRIEF (auto-fetch from GitHub)
// ===========================================================================
function BriefTab() {
  // On a real hosted site (not the Claude artifact sandbox) the GitHub API is
  // reachable, so we list the whole briefings/ folder for a browsable archive.
  const [state, setState] = useState('loading'); // loading | ok | empty | error | ratelimited
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [body, setBody] = useState('');
  const [bodyState, setBodyState] = useState('idle');

  const load = useCallback(async () => {
    setState('loading'); setBody(''); setSelected(null); setBodyState('idle');
    try {
      const res = await fetch(`https://api.github.com/repos/${BRIEF_REPO}/contents/${BRIEF_DIR}`);
      if (res.status === 404) { setState('empty'); return; }
      if (res.status === 403) { setState('ratelimited'); return; }
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('Unexpected response');
      const md = list
        .filter(f => f.type === 'file' && /\.md$/i.test(f.name) && !/^_latest/i.test(f.name))
        .sort((a, b) => b.name.localeCompare(a.name)); // newest first
      if (!md.length) { setState('empty'); return; }
      setFiles(md); setState('ok');
      openFile(md[0]);
    } catch (e) { setState('error'); }
  }, []);

  const openFile = async (f) => {
    setSelected(f.name); setBodyState('loading'); setBody('');
    try {
      const r = await fetch(f.download_url);
      if (!r.ok) throw new Error();
      setBody(await r.text()); setBodyState('ok');
    } catch (e) { setBodyState('error'); }
  };

  useEffect(() => { load(); }, [load]);

  // 2026-06-28-daily -> "28 Jun · daily"
  const pretty = (name) => {
    const base = name.replace(/\.md$/i, '');
    const m = base.match(/^(\d{4})-(\d{2})-(\d{2})-(\w+)/);
    if (m) {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${parseInt(m[3])} ${months[parseInt(m[2]) - 1]} · ${m[4]}`;
    }
    return base.replace(/_/g, ' ');
  };

  return (
    <div style={{ padding: '36px 20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow>De-Brief</Eyebrow>
        <button onClick={load} style={ghostBtn}>Refresh</button>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: '#5C5C62', marginBottom: 24 }}>
        live from {BRIEF_REPO}
      </div>

      {state === 'loading' && <Muted>Fetching your briefings…</Muted>}
      {state === 'ratelimited' && (
        <div style={card}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#C9A961', marginBottom: 8 }}>GitHub's hourly limit hit.</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#8A8A92', lineHeight: 1.55 }}>
            Unauthenticated requests are capped at 60/hour. It resets within the hour — wait a few minutes, then Refresh.
          </div>
        </div>
      )}
      {state === 'error' && (
        <div style={card}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#A8453C', marginBottom: 8 }}>Couldn't reach the repo.</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#8A8A92', lineHeight: 1.55 }}>
            Check that <span style={{ color: '#C9A961' }}>{BRIEF_REPO}</span> is public and has a <span style={{ color: '#C9A961' }}>{BRIEF_DIR}/</span> folder, then hit Refresh.
          </div>
        </div>
      )}
      {state === 'empty' && (
        <div style={card}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#F5F1E8', marginBottom: 8 }}>No briefings yet.</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#8A8A92', lineHeight: 1.55 }}>
            Once your pipeline commits its first file to <span style={{ color: '#C9A961' }}>{BRIEF_DIR}/</span>, it'll show up here.
          </div>
        </div>
      )}

      {state === 'ok' && (
        <>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 18 }}>
            {files.map(f => {
              const active = selected === f.name;
              return (
                <button key={f.name} onClick={() => openFile(f)} style={{
                  flexShrink: 0, padding: '7px 13px', borderRadius: 100, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  background: active ? '#C9A961' : '#161618', color: active ? '#0E0E10' : '#8A8A92',
                  border: `1px solid ${active ? '#C9A961' : '#2A2A2E'}`, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
                }}>{pretty(f.name)}</button>
              );
            })}
          </div>
          {bodyState === 'loading' && <Muted>Opening…</Muted>}
          {bodyState === 'error' && <Muted>Couldn't load that one — try another.</Muted>}
          {bodyState === 'ok' && <div style={{ paddingBottom: 12 }}>{renderMarkdown(body)}</div>}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// MOTIONS
// ===========================================================================
function MotionsTab({ motions, libraryTopics, onDrill, onLog, onImport, onDelete }) {
  const [mode, setMode] = useState('browse'); // browse | log | import
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState(null); // motion awaiting side choice

  const topics = ['all', ...[...new Set(motions.map(m => m.topic).filter(Boolean))].sort()];
  const shown = filter === 'all' ? motions : motions.filter(m => m.topic === filter);

  return (
    <div style={{ padding: '36px 20px 0' }}>
      <Eyebrow>Motions</Eyebrow>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: '#5C5C62', marginBottom: 20 }}>
        {motions.length} motions · drill against the real thing
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['browse', 'Browse'], ['log', 'Log a round'], ['import', 'Import']].map(([id, lbl]) => {
          const a = mode === id;
          return (
            <button key={id} onClick={() => setMode(id)} style={{
              flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: a ? 600 : 400,
              background: a ? '#C9A961' : '#161618', color: a ? '#0E0E10' : '#8A8A92',
              border: `1px solid ${a ? '#C9A961' : '#2A2A2E'}`,
            }}>{lbl}</button>
          );
        })}
      </div>

      {mode === 'log' && <LogMotionForm libraryTopics={libraryTopics} onLog={async (d) => { await onLog(d); setMode('browse'); }} />}
      {mode === 'import' && <ImportMotionsForm onImport={onImport} />}

      {mode === 'browse' && (
        <>
          {topics.length > 2 && (
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 6, marginBottom: 16 }}>
              {topics.map(t => {
                const a = filter === t;
                return (
                  <button key={t} onClick={() => setFilter(t)} style={{
                    flexShrink: 0, padding: '6px 12px', borderRadius: 100, cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif", fontSize: 12,
                    background: a ? '#2A2A2E' : 'transparent', color: a ? '#F5F1E8' : '#8A8A92',
                    border: `1px solid ${a ? '#3A3A3E' : '#222226'}`, whiteSpace: 'nowrap',
                  }}>{t === 'all' ? 'All' : t}</button>
                );
              })}
            </div>
          )}
          {shown.length === 0 ? (
            <div style={card}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#8A8A92', lineHeight: 1.55 }}>
                No motions here yet. Log a round you just debated, or import a tournament.
              </div>
            </div>
          ) : shown.map(m => (
            <MotionCard key={m.id} motion={m} onDrill={() => setPicked(m)} onDelete={() => onDelete(m.id)} />
          ))}
        </>
      )}

      {picked && <SideChoiceOverlay motion={picked} onClose={() => setPicked(null)}
        onChoose={(side) => { setPicked(null); onDrill(picked, side); }} />}
    </div>
  );
}

function MotionCard({ motion, onDrill, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const bias = motion.sideBias;
  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8A8A92' }}>
          {motion.round ? `${motion.round} · ` : ''}{motion.tournament}
        </div>
        {motion.topic && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: '#C9A961', border: '1px solid #C9A96144', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>{motion.topic}</div>}
      </div>
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, color: '#F5F1E8', lineHeight: 1.4, margin: '10px 0 6px' }}>{motion.motion}</div>
      {motion.tag && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: '#5C5C62', marginBottom: 8 }}>({motion.tag})</div>}
      {motion.note && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#A8453C', lineHeight: 1.5, marginBottom: 8 }}>Struggled: {motion.note}</div>}
      {motion.infoSlide && <details style={{ marginBottom: 10 }}>
        <summary style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#8A8A92', cursor: 'pointer' }}>Info slide</summary>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13.5, color: '#D8D4C8', lineHeight: 1.6, marginTop: 8 }}>{motion.infoSlide}</div>
      </details>}
      {bias && (bias.gov != null) && (
        <div style={{ display: 'flex', gap: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8A8A92', marginBottom: 12 }}>
          <span>Gov <span style={{ color: bias.gov >= bias.opp ? '#5B7A6B' : '#A8453C' }}>{bias.gov.toFixed(2)}</span></span>
          <span>Opp <span style={{ color: bias.opp >= bias.gov ? '#5B7A6B' : '#A8453C' }}>{bias.opp.toFixed(2)}</span></span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onDrill} style={{ ...primaryBtn, flex: 1, padding: '10px 0', fontSize: 14 }}>Drill this</button>
        {confirmDel ? (
          <button onClick={onDelete} style={{ ...secondaryBtn, padding: '10px 14px', borderColor: '#A8453C', color: '#A8453C' }}>Sure?</button>
        ) : (
          <button onClick={() => setConfirmDel(true)} style={{ ...secondaryBtn, padding: '10px 14px', color: '#5C5C62', borderColor: '#2A2A2E' }}>✕</button>
        )}
      </div>
    </div>
  );
}

function LogMotionForm({ libraryTopics, onLog }) {
  const [motion, setMotion] = useState('');
  const [side, setSide] = useState('');
  const [note, setNote] = useState('');
  const [topic, setTopic] = useState('');
  return (
    <div>
      <div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}>
        Fast capture, right after a round. Just the motion and what tripped you up — drill it later.
      </div>
      <div style={label}>Motion</div>
      <textarea value={motion} onChange={e => setMotion(e.target.value)} placeholder="THW / THBT / THS…"
        style={{ ...textarea, minHeight: 70, marginBottom: 14 }} />
      <div style={label}>Side you were on (optional)</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['Gov', 'Opp', ''].map((s, i) => {
          const lbls = ['Gov', 'Opp', 'Skip'];
          const a = side === s;
          return <button key={i} onClick={() => setSide(s)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 13, background: a ? '#2A2A2E' : '#161618', color: a ? '#F5F1E8' : '#8A8A92', border: '1px solid #2A2A2E' }}>{lbls[i]}</button>;
        })}
      </div>
      <div style={label}>What did you struggle with? (optional)</div>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. couldn't find a mechanism for the econ burden"
        style={{ ...select, marginBottom: 14 }} />
      <div style={label}>Topic (optional — auto-detected if blank)</div>
      <select value={topic} onChange={e => setTopic(e.target.value)} style={{ ...select, marginBottom: 18 }}>
        <option value="">Auto-detect</option>
        {libraryTopics.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <button onClick={() => motion.trim() && onLog({ motion, side, note, topic })} disabled={!motion.trim()}
        style={{ ...primaryBtn, width: '100%', opacity: motion.trim() ? 1 : 0.5 }}>Log it</button>
    </div>
  );
}

function ImportMotionsForm({ onImport }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const run = async () => {
    setBusy(true); setStatus(null);
    try { const r = await onImport(url.trim()); setStatus({ ok: true, msg: `Added ${r.added} motions from ${r.tournament || 'the tournament'}.` }); setUrl(''); }
    catch (e) { setStatus({ ok: false, msg: e.message }); }
    setBusy(false);
  };
  return (
    <div>
      <div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}>
        Paste a Calico Tab tournament link (the Motions tab). It'll pull every round's motion, info slide, and tag automatically.
      </div>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…calicotab.com/…/motions/statistics/"
        style={{ ...select, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
      {status && <div style={{ color: status.ok ? '#5B7A6B' : '#A8453C', fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 12, lineHeight: 1.5 }}>{status.msg}</div>}
      <button onClick={run} disabled={busy || !url.trim()} style={{ ...primaryBtn, width: '100%', opacity: (busy || !url.trim()) ? 0.5 : 1 }}>{busy ? 'Importing…' : 'Import tournament'}</button>
    </div>
  );
}

function SideChoiceOverlay({ motion, onClose, onChoose }) {
  return (
    <Overlay title="Which side?" onClose={onClose}>
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, color: '#F5F1E8', lineHeight: 1.4, marginBottom: 6 }}>{motion.motion}</div>
      {motion.topic && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#C9A961', marginBottom: 18 }}>{motion.topic}</div>}
      <div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 13, marginBottom: 16, lineHeight: 1.55 }}>
        Pick a side to argue. We'll pull a target burden from your library for this topic — or have the AI suggest one if nothing matches.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onChoose('Government')} style={{ ...primaryBtn, flex: 1 }}>Government</button>
        <button onClick={() => onChoose('Opposition')} style={{ ...primaryBtn, flex: 1, background: '#5B7A6B', color: '#0E0E10' }}>Opposition</button>
      </div>
    </Overlay>
  );
}

// ===========================================================================
// STATS
// ===========================================================================
function StatsTab({ history, flashHistory, embedded }) {
  const pad = embedded ? '0' : '36px 20px 0';
  if (!history.length && !flashHistory.length) {
    return (
      <div style={{ padding: pad }}>
        {!embedded && <Eyebrow>Progress</Eyebrow>}
        <div style={{ marginTop: embedded ? 0 : 20, ...card }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#8A8A92', lineHeight: 1.55 }}>
            Nothing logged yet. Run a few drill rounds and your timing, accuracy, and weak topics will show up here.
          </div>
        </div>
      </div>
    );
  }
  const recent = history.slice(-20);
  const avgTime = recent.length ? Math.round(recent.reduce((s, h) => s + h.elapsedSeconds, 0) / recent.length) : 0;
  const avgSelf = recent.length ? (recent.reduce((s, h) => s + (h.selfRating || 0), 0) / recent.length).toFixed(1) : '—';
  const tagCounts = { burden: {}, mechanism: {}, weighing: {} };
  history.forEach(h => { if (h.aiTags) Object.entries(h.aiTags).forEach(([k, v]) => { tagCounts[k][v] = (tagCounts[k][v] || 0) + 1; }); });
  const byTopic = {};
  history.forEach(h => { (byTopic[h.topic] = byTopic[h.topic] || []).push(h); });
  const topicRows = Object.entries(byTopic).map(([t, e]) => ({ t, n: e.length, avg: (e.reduce((s, h) => s + (h.selfRating || 0), 0) / e.length) })).sort((a, b) => a.avg - b.avg);

  return (
    <div style={{ padding: pad }}>
      {!embedded && <Eyebrow>Progress</Eyebrow>}
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 22, color: '#F5F1E8', margin: embedded ? '0 0 22px' : '8px 0 22px' }}>
        {history.length} rounds · {flashHistory.length} cards
      </div>
      <div style={{ display: 'flex', gap: 28, marginBottom: 28 }}>
        <Stat label="Avg time (last 20)" value={`${avgTime}s`} />
        <Stat label="Avg rating (last 20)" value={avgSelf} />
      </div>
      {history.length > 0 && (<>
        <div style={label}>Where the misses are</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, margin: '10px 0 28px' }}>
          {['burden', 'mechanism', 'weighing'].map(k => {
            const total = Object.values(tagCounts[k]).reduce((s, n) => s + n, 0) || 1;
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 82, fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#8A8A92', textTransform: 'capitalize' }}>{k}</div>
                <div style={{ display: 'flex', gap: 3, flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', background: '#161618' }}>
                  {Object.entries(tagCounts[k]).map(([v, c]) => (
                    <div key={v} title={`${v}: ${c}`} style={{ width: `${(c / total) * 100}%`, background: (v === 'missed' || v === 'missing') ? '#A8453C' : (v === 'too-generic' || v === 'vague') ? '#C9A961' : '#5B7A6B' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={label}>Weakest topics first</div>
        <div style={{ marginTop: 10 }}>
          {topicRows.map(r => (
            <div key={r.t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'Inter', sans-serif", fontSize: 13.5, padding: '9px 0', borderBottom: '1px solid #1E1E22' }}>
              <span style={{ color: '#C9C9CE' }}>{r.t}</span>
              <span style={{ color: '#8A8A92', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.n} · {r.avg.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// ===========================================================================
// MORE
// ===========================================================================
function MoreTab({ librarySize, queueCount, motionCount, onImport, onQueue, onSettings, onStats }) {
  const Row = ({ title, sub, onClick, badge }) => (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', background: '#161618', border: '1px solid #1E1E22', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: '#F5F1E8', fontWeight: 500 }}>{title}</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: '#8A8A92', marginTop: 3 }}>{sub}</div>
      </div>
      <span style={{ color: '#5C5C62', fontSize: 18 }}>{badge ? <span style={{ color: '#C9A961', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{badge}</span> : '›'}</span>
    </button>
  );
  return (
    <div style={{ padding: '36px 20px 0' }}>
      <Eyebrow>Manage</Eyebrow>
      <div style={{ marginTop: 22 }}>
        <Row title="Progress &amp; stats" sub="Timing, accuracy, weakest topics" onClick={onStats} />
        <Row title="Import library" sub={`${librarySize} arguments loaded`} onClick={onImport} />
        <Row title="Review AI drafts" sub="Fill thin topics, approve before they count" onClick={onQueue} badge={queueCount > 0 ? queueCount : null} />
        <Row title="Settings &amp; reset" sub="Clear library or progress" onClick={onSettings} />
      </div>
    </div>
  );
}

// ===========================================================================
// Overlays
// ===========================================================================
function Overlay({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,10,0.72)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 50 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', background: '#121214', borderTop: '1px solid #2A2A2E', borderRadius: '18px 18px 0 0', padding: '20px 20px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 19, color: '#F5F1E8' }}>{title}</div>
          <button onClick={onClose} style={ghostBtn}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ImportOverlay({ onClose, onImport, librarySize }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null);
  const run = async () => {
    try { const r = await onImport(text); setStatus({ ok: true, msg: `Added ${r.added} new (${r.dupes} already had). Library now ${r.total}.` }); setText(''); }
    catch (e) { setStatus({ ok: false, msg: `Didn't import: ${e.message}` }); }
  };
  return (
    <Overlay title="Import library" onClose={onClose}>
      <div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 13.5, marginBottom: 14, lineHeight: 1.55 }}>
        Paste the JSON array of arguments. New ones get added to your {librarySize}; anything already there (same id) is skipped.
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder='[{"id":"…","topic":"…","side":"…","claim":"…","mechanism":"…"}]'
        style={{ ...textarea, minHeight: 200, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
      {status && <div style={{ color: status.ok ? '#5B7A6B' : '#A8453C', fontSize: 13, fontFamily: "'Inter', sans-serif", marginTop: 10 }}>{status.msg}</div>}
      <button onClick={run} disabled={!text.trim()} style={{ ...primaryBtn, width: '100%', marginTop: 16, opacity: text.trim() ? 1 : 0.5 }}>Import</button>
    </Overlay>
  );
}

function QueueOverlay({ onClose, queue, topics, onRequest, onApprove, onReject }) {
  const [sel, setSel] = useState(topics[0] || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => { setBusy(true); setErr(null); try { await onRequest(sel); } catch (e) { setErr("Drafting didn't go through — try again."); } setBusy(false); };
  return (
    <Overlay title="Review AI drafts" onClose={onClose}>
      <div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 13.5, marginBottom: 16, lineHeight: 1.55 }}>
        Pick a thin topic and request drafts. Nothing joins your library until you approve it.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...select, flex: 1 }}>
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={go} disabled={busy} style={{ ...primaryBtn, padding: '10px 18px', opacity: busy ? 0.6 : 1 }}>{busy ? 'Drafting…' : 'Request'}</button>
      </div>
      {err && <div style={{ color: '#A8453C', fontSize: 12.5, fontFamily: "'Inter', sans-serif", marginBottom: 12 }}>{err}</div>}
      <div style={{ marginTop: 14 }}>
        {queue.length === 0 ? (
          <div style={{ color: '#5C5C62', fontFamily: "'Inter', sans-serif", textAlign: 'center', padding: '16px 0' }}>No drafts waiting.</div>
        ) : queue.map(c => (
          <div key={c.id} style={{ padding: 16, background: '#161618', borderRadius: 12, border: '1px solid #2A2A2E', marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, color: '#8A8A92', fontFamily: "'Inter', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{c.topic} · {c.side}</div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, color: '#F5F1E8', marginBottom: 8, lineHeight: 1.4 }}>{c.claim}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#8A8A92', lineHeight: 1.55, marginBottom: 12 }}>{c.mechanism}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onApprove(c)} style={{ ...secondaryBtn, flex: 1, borderColor: '#5B7A6B55', color: '#5B7A6B' }}>Approve</button>
              <button onClick={() => onReject(c)} style={{ ...secondaryBtn, flex: 1, borderColor: '#A8453C55', color: '#A8453C' }}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </Overlay>
  );
}

function SettingsOverlay({ onClose, librarySize, historyCount, flashCount, onResetLibrary, onResetProgress }) {
  const [confirm, setConfirm] = useState(null); // 'library' | 'progress'
  const Danger = ({ title, sub, count, kind }) => (
    <div style={{ padding: 16, background: '#161618', borderRadius: 12, border: '1px solid #2A2A2E', marginBottom: 12 }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14.5, color: '#F5F1E8', fontWeight: 500 }}>{title}</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: '#8A8A92', margin: '3px 0 12px', lineHeight: 1.5 }}>{sub}</div>
      {confirm === kind ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { (kind === 'library' ? onResetLibrary() : onResetProgress()); setConfirm(null); }} style={{ ...secondaryBtn, flex: 1, borderColor: '#A8453C', color: '#A8453C' }}>Yes, clear it</button>
          <button onClick={() => setConfirm(null)} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirm(kind)} style={{ ...secondaryBtn, width: '100%', borderColor: '#A8453C55', color: '#A8453C' }}>Clear {count}</button>
      )}
    </div>
  );
  return (
    <Overlay title="Settings & reset" onClose={onClose}>
      <div style={{ color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 13.5, marginBottom: 18, lineHeight: 1.55 }}>
        Resets are permanent and only affect this device. Use these if your data ever feels stale or you want a clean start.
      </div>
      <Danger kind="library" title="Reset the argument library" sub="Drops any AI-approved or imported additions and restores the full built-in library of 621 arguments." count={`${librarySize} arguments`} />
      <Danger kind="progress" title="Clear practice history" sub="Wipes drill rounds, flashcard reviews, timing, and ratings. Your library is untouched." count={`${historyCount} rounds + ${flashCount} cards`} />
    </Overlay>
  );
}

// ===========================================================================
// shared bits
// ===========================================================================
function Eyebrow({ children }) {
  return <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: '#8A8A92', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>{children}</div>;
}
function Muted({ children }) {
  return <div style={{ color: '#5C5C62', fontFamily: "'Inter', sans-serif", fontSize: 14, padding: '8px 0' }}>{children}</div>;
}
function Stat({ label: l, value }) {
  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, color: '#F5F1E8' }}>{value}</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: '#5C5C62', marginTop: 2 }}>{l}</div>
    </div>
  );
}

const fontCss = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter:wght@400;500;600&display=swap');
* { -webkit-tap-highlight-color: transparent; }
::-webkit-scrollbar { height: 6px; width: 6px; }
::-webkit-scrollbar-thumb { background: #2A2A2E; border-radius: 3px; }`;

const shell = { minHeight: '100vh', width: '100%', background: '#0E0E10', display: 'flex', justifyContent: 'center' };
const card = { padding: '18px 20px', background: '#161618', borderRadius: 12, border: '1px solid #1E1E22' };
const primaryBtn = { background: '#C9A961', color: '#0E0E10', border: 'none', borderRadius: 10, padding: '14px 32px', fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, cursor: 'pointer' };
const secondaryBtn = { background: 'none', color: '#C9A961', border: '1px solid #C9A96155', borderRadius: 10, padding: '12px 20px', fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { background: 'none', border: 'none', color: '#8A8A92', fontFamily: "'Inter', sans-serif", fontSize: 13.5, cursor: 'pointer', padding: 0 };
const label = { fontSize: 10.5, color: '#8A8A92', fontFamily: "'Inter', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 };
const select = { width: '100%', padding: '11px 12px', borderRadius: 10, background: '#161618', border: '1px solid #2A2A2E', color: '#F5F1E8', fontFamily: "'Inter', sans-serif", fontSize: 14 };
const textarea = { width: '100%', minHeight: 150, padding: 14, borderRadius: 10, background: '#161618', border: '1px solid #2A2A2E', color: '#F5F1E8', fontFamily: "'Inter', sans-serif", fontSize: 14.5, lineHeight: 1.55, resize: 'vertical', boxSizing: 'border-box' };
const prose = { fontFamily: "'Source Serif 4', serif", fontSize: 15, color: '#D8D4C8', lineHeight: 1.65 };
const ratingBtn = { flex: 1, height: 50, borderRadius: 10, background: '#161618', border: '1px solid #2A2A2E', color: '#F5F1E8', fontFamily: "'JetBrains Mono', monospace", fontSize: 16, cursor: 'pointer' };
