import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Volume2, Globe, X, CameraOff, Camera, Mic, Languages, Webcam, ChevronDown, Magnet } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const COOLDOWN_MS = 1500;       // global cooldown between any predictions
const WORD_COOLDOWN_MS = 2500;  // per-word cooldown — same word can't repeat within this window

// ─── FloatingPaths ────────────────────────────────────────────────────────────
function FloatingPaths({ position }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    opacity: 0.08 + i * 0.018,
    duration: 18 + (i % 8) * 3,
  }));
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg style={{ width: '100%', height: '100%', color: 'rgb(20,184,166)' }} viewBox="0 0 696 875" fill="none" preserveAspectRatio="xMidYMid slice">
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            initial={{ pathLength: 0.3, opacity: 0.5 }}
            animate={{ pathLength: 1, opacity: [0.2, path.opacity, 0.2], pathOffset: [0, 1, 0] }}
            transition={{ duration: path.duration, repeat: Infinity, ease: 'linear', delay: path.id * 0.15 }}
          />
        ))}
      </svg>
    </div>
  );
}

function BackgroundPaths() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', background: '#050709' }}>
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(20,184,166,0.10) 0%, transparent 65%)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, #050709 20%, transparent)' }} />
    </div>
  );
}

// ─── SpecialText ──────────────────────────────────────────────────────────────
const RANDOM_CHARS = '_!X$0-+*#';
function getRandomChar(prev) {
  let c;
  do { c = RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)]; } while (c === prev);
  return c;
}

function SpecialText({ children, speed = 18 }) {
  const text = children || '';
  const [displayText, setDisplayText] = useState('\u00A0'.repeat(text.length || 1));
  const [phase, setPhase] = useState('phase1');
  const [step, setStep] = useState(0);
  const intervalRef = useRef(null);
  const textRef = useRef(text);

  useEffect(() => {
    textRef.current = text;
    setDisplayText('\u00A0'.repeat(text.length || 1));
    setPhase('phase1');
    setStep(0);
  }, [text]);

  useEffect(() => {
    if (!text) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const t = textRef.current;
      if (phase === 'phase1') {
        const maxSteps = t.length * 2;
        const currentLen = Math.min(step + 1, t.length);
        const chars = [];
        for (let i = 0; i < currentLen; i++) chars.push(getRandomChar(chars[i - 1]));
        for (let i = currentLen; i < t.length; i++) chars.push('\u00A0');
        setDisplayText(chars.join(''));
        if (step < maxSteps - 1) setStep(s => s + 1);
        else { setPhase('phase2'); setStep(0); }
      } else {
        const revealed = Math.floor(step / 2);
        const chars = [];
        for (let i = 0; i < revealed && i < t.length; i++) chars.push(t[i]);
        if (revealed < t.length) chars.push(step % 2 === 0 ? '_' : getRandomChar());
        while (chars.length < t.length) chars.push(getRandomChar());
        setDisplayText(chars.join(''));
        if (step < t.length * 2 - 1) setStep(s => s + 1);
        else { setDisplayText(t); clearInterval(intervalRef.current); }
      }
    }, speed);
    return () => clearInterval(intervalRef.current);
  }, [phase, step, text, speed]);

  return <span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.02em' }}>{displayText}</span>;
}

// ─── Language Dropdown ────────────────────────────────────────────────────────
const LANG_OPTIONS = [
  { value: 'english', label: 'English', flag: '🇬🇧' },
  { value: 'hindi',   label: 'हिंदी',   flag: '🇮🇳' },
  { value: 'marathi', label: 'मराठी',   flag: '🇮🇳' },
];

function LangDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = LANG_OPTIONS.find(o => o.value === value) || LANG_OPTIONS[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px 6px 10px', borderRadius: '10px', border: '1px solid', borderColor: open ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.1)', background: open ? 'rgba(20,184,166,0.1)' : 'rgba(17,17,17,0.6)', backdropFilter: 'blur(12px)', color: '#d1d5db', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s', boxShadow: open ? '0 0 16px rgba(20,184,166,0.15)' : '0 0 20px rgba(0,0,0,0.2)', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 15 }}>{selected.flag}</span>
        {selected.label}
        <span style={{ display: 'inline-flex', marginLeft: 2, transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <ChevronDown size={13} />
        </span>
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 200, minWidth: 160, padding: '4px', background: 'rgba(10,12,16,0.97)', backdropFilter: 'blur(16px)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: '12px', boxShadow: '0 0 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.3)', animation: 'dropIn 0.28s cubic-bezier(0.34,1.56,0.64,1)' }}>
          {LANG_OPTIONS.map((opt, i) => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: opt.value === value ? 'rgba(20,184,166,0.12)' : 'transparent', color: opt.value === value ? '#5eead4' : '#9ca3af', fontSize: 13, fontWeight: opt.value === value ? 600 : 400, textAlign: 'left', transition: 'all 0.15s', animation: `slideIn 0.25s ease ${i * 0.06}s both` }}
              onMouseEnter={e => opt.value !== value && (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => opt.value !== value && (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 16 }}>{opt.flag}</span>
              {opt.label}
              {opt.value === value && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#14b8a6', boxShadow: '0 0 6px #14b8a6', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MagnetizeButton ──────────────────────────────────────────────────────────
// chipRefs: array of refs pointing to each buffer chip DOM node (passed from parent)
function MagnetizeButton({ onClick, disabled, generating, words, chipRefs }) {
  const [isAttracting, setIsAttracting] = useState(false);
  const btnRef = useRef(null);
  const [offsets, setOffsets] = useState([]);

  const handleEnter = () => {
    if (disabled) return;
    if (btnRef.current && chipRefs?.current) {
      const btnRect = btnRef.current.getBoundingClientRect();
      const btnCx = btnRect.left + btnRect.width / 2;
      const btnCy = btnRect.top + btnRect.height / 2;
      const computed = chipRefs.current.map(el => {
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        return { x: (r.left + r.width / 2) - btnCx, y: (r.top + r.height / 2) - btnCy };
      });
      setOffsets(computed);
    }
    setIsAttracting(true);
  };

  const handleLeave = () => setIsAttracting(false);

  return (
    <div style={{ position: 'relative', width: '100%', marginTop: 14, overflow: 'visible' }}>
      {isAttracting && words.slice(0, 15).map((word, i) => {
        const from = offsets[i] || { x: 0, y: 0 };
        return (
          <motion.div
            key={word + i}
            initial={{ x: from.x, y: from.y, opacity: 1, scale: 1 }}
            animate={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 60, damping: 12, delay: i * 0.04 }}
            style={{ position: 'absolute', top: '50%', left: '50%', marginTop: '-11px', marginLeft: '-28px', pointerEvents: 'none', zIndex: 20, fontFamily: 'ui-monospace, monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#5eead4', background: 'rgba(20,184,166,0.18)', border: '1px solid rgba(20,184,166,0.4)', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>
            {word.toUpperCase()}
          </motion.div>
        );
      })}
      <motion.button
        ref={btnRef}
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.97 } : {}}
        style={{ position: 'relative', zIndex: 1, width: '100%', padding: '11px 0', borderRadius: 10, border: '1px solid', borderColor: disabled ? 'rgba(20,184,166,0.1)' : isAttracting ? 'rgba(20,184,166,0.7)' : 'rgba(20,184,166,0.35)', background: disabled ? 'rgba(20,184,166,0.04)' : isAttracting ? 'rgba(20,184,166,0.18)' : 'rgba(20,184,166,0.09)', color: disabled ? '#374151' : '#5eead4', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '0.06em', boxShadow: isAttracting && !disabled ? '0 0 24px rgba(20,184,166,0.22)' : 'none', transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s' }}>
        {generating
          ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
          : <><Magnet size={14} style={{ transition: 'transform 0.3s', transform: isAttracting ? 'scale(1.25)' : 'scale(1)' }} />{isAttracting ? 'Attracting...' : 'Generate Sentence'}</>}
      </motion.button>
    </div>
  );
}

// ─── Confidence Ring ──────────────────────────────────────────────────────────
function ConfidenceRing({ value }) {
  const r = 22, circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value > 90 ? '#14b8a6' : value > 75 ? '#f59e0b' : '#f43f5e';
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }} />
      <text x="28" y="28" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="11" fontFamily="ui-monospace,monospace" fontWeight="700"
        style={{ transform: 'rotate(90deg)', transformOrigin: '28px 28px' }}>
        {value}%
      </text>
    </svg>
  );
}

// ─── Sign → Speech ────────────────────────────────────────────────────────────
function SignToSpeech() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const framesBuffer = useRef([]);
  const streamRef = useRef(null);
  const handsRef = useRef(null);
  const rafRef = useRef(null);
  const lastAcceptedTime = useRef(0);
  const wordLastSeen = useRef({});  // per-word timestamp map
  const chipRefs = useRef([]);
  const [isReady, setIsReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [detectedWord, setDetectedWord] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [words, setWords] = useState([]);
  const [sentence, setSentence] = useState('');
  const [translations, setTranslations] = useState({});
  const [lang, setLang] = useState('english');
  const [generating, setGenerating] = useState(false);
  const [translationKey, setTranslationKey] = useState(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (handsRef.current) { handsRef.current.close(); handsRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    framesBuffer.current = [];
    lastAcceptedTime.current = 0;
    wordLastSeen.current = {};
    setIsReady(false); setDetectedWord(''); setConfidence(0);
  }, []);
  const startCamera = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); }
    catch (e) { console.error('Camera denied:', e); return; }
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    // Init MediaPipe Tasks Vision HandLandmarker (loaded via CDN on window)
    const { HandLandmarker, FilesetResolver, DrawingUtils } = window;
    if (!HandLandmarker || !FilesetResolver) {
      console.error('MediaPipe Tasks Vision not loaded yet — retrying in 500ms');
      setTimeout(() => startCamera(), 500);
      return;
    }
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    });
    handsRef.current = landmarker;

    await new Promise(resolve => { const c = () => videoRef.current?.videoWidth > 0 ? resolve() : setTimeout(c, 50); c(); });
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    setIsReady(true);

    const drawingUtils = new DrawingUtils(canvasRef.current.getContext('2d'));

    const loop = () => {
      if (!handsRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop); return;
      }
      const ctx = canvasRef.current.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

      const results = handsRef.current.detectForVideo(videoRef.current, performance.now());

      let lh = new Array(63).fill(0), rh = new Array(63).fill(0);
      if (results.landmarks && results.landmarks.length > 0) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const lms = results.landmarks[i];
          const side = results.handedness[i][0].categoryName; // 'Left' or 'Right'
          drawingUtils.drawConnectors(lms, HandLandmarker.HAND_CONNECTIONS, { color: 'rgba(20,184,166,0.8)', lineWidth: 2 });
          drawingUtils.drawLandmarks(lms, { color: '#f0fdf4', lineWidth: 1, radius: 3 });
          const flat = lms.reduce((a, lm) => { a.push(lm.x, lm.y, lm.z); return a; }, []);
          if (side === 'Left') lh = flat; else rh = flat;
        }
        framesBuffer.current.push([...lh, ...rh]);
        if (framesBuffer.current.length >= 15) {
          const batch = [...framesBuffer.current];
          framesBuffer.current = [];
          fetch(`${BACKEND_URL}/predict`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keypoints: batch })
          }).then(r => r.json()).then(data => {
            if (!data.predicted) return;
            const now = Date.now();
            if (now - lastAcceptedTime.current < COOLDOWN_MS) return;
            const lastSeen = wordLastSeen.current[data.predicted] || 0;
            if (now - lastSeen < WORD_COOLDOWN_MS) return;
            lastAcceptedTime.current = now;
            wordLastSeen.current[data.predicted] = now;
            setDetectedWord(data.predicted);
            setConfidence(Math.round((data.confidence || 0) * 100));
            setWords(prev => prev.length === 0 || prev[prev.length - 1] !== data.predicted
              ? [...prev, data.predicted].slice(-15) : prev);
          }).catch(() => {});
        }
      } else {
        framesBuffer.current = [];
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => { startCamera(); return () => stopCamera(); }, [startCamera, stopCamera]);

  const toggleCamera = () => {
    if (cameraOn) { stopCamera(); setCameraOn(false); }
    else { setCameraOn(true); setTimeout(() => startCamera(), 100); }
  };

  const generate = () => {
    if (!words.length) return;
    setGenerating(true);
    fetch(`${BACKEND_URL}/ai-layer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words })
    }).then(r => r.json()).then(d => {
      setSentence(d.sentence);
      setTranslations(d.translations || {});
      setTranslationKey(k => k + 1);
      setGenerating(false);
    }).catch(() => setGenerating(false));
  };

  const speak = async () => {
    const text = translations[lang] || sentence;
    if (!text) return;
    try {
      const res = await fetch(`${BACKEND_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch (_) {
      // fallback to browser TTS
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'hindi' ? 'hi-IN' : lang === 'marathi' ? 'mr-IN' : 'en-US';
      window.speechSynthesis.speak(u);
    }
  };

  const clear = () => { setWords([]); setSentence(''); setDetectedWord(''); setTranslations({}); lastAcceptedTime.current = 0; wordLastSeen.current = {}; };
  const displayedText = translations[lang] || sentence;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>
      {/* Camera panel */}
      <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#0a0c10', border: '1px solid rgba(20,184,166,0.15)', boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 24px 48px rgba(0,0,0,0.6)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(to bottom, rgba(10,12,16,0.95), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isReady && cameraOn ? '#14b8a6' : '#374151', boxShadow: isReady && cameraOn ? '0 0 8px #14b8a6' : 'none', display: 'inline-block', transition: 'all 0.4s' }} />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {isReady && cameraOn ? 'LIVE · TRACKING' : cameraOn ? 'INITIALIZING' : 'CAMERA OFF'}
            </span>
          </div>
          <button onClick={toggleCamera} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid', borderColor: cameraOn ? 'rgba(239,68,68,0.3)' : 'rgba(20,184,166,0.4)', background: cameraOn ? 'rgba(239,68,68,0.08)' : 'rgba(20,184,166,0.08)', color: cameraOn ? '#f87171' : '#5eead4', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
            {cameraOn ? <><CameraOff size={13} /> Stop</> : <><Camera size={13} /> Start</>}
          </button>
        </div>
        <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
        {!cameraOn
          ? <div style={{ height: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', border: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CameraOff size={24} color="#374151" /></div>
              <p style={{ color: '#4b5563', fontSize: 13, margin: 0 }}>Camera disabled</p>
            </div>
          : !isReady
          ? <div style={{ height: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Loader2 size={28} color="#14b8a6" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#6b7280', fontSize: 13, margin: 0, fontFamily: 'ui-monospace, monospace' }}>Initializing MediaPipe...</p>
            </div>
          : null}
        <canvas ref={canvasRef} style={{ width: '100%', display: isReady && cameraOn ? 'block' : 'none' }} />
        {detectedWord && cameraOn && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(5,7,9,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <ConfidenceRing value={confidence} />
            <div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 700, color: '#f0fdf4', letterSpacing: '0.05em', lineHeight: 1 }}>{detectedWord.toUpperCase()}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em' }}>DETECTED · SIGN</div>
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Word buffer */}
        <div style={{ background: 'rgba(10,12,16,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '18px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Sign Buffer</span>
              {words.length > 0 && <span style={{ background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.2)', color: '#5eead4', fontSize: 10, fontFamily: 'ui-monospace, monospace', borderRadius: '4px', padding: '1px 6px' }}>{words.length}/15</span>}
            </div>
            {words.length > 0 && (
              <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#4b5563', fontSize: 11, padding: '2px 6px', borderRadius: '4px', transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}>
                <X size={11} /> Clear all
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '40px' }}>
            {words.length === 0
              ? <span style={{ color: '#374151', fontSize: 12, fontStyle: 'italic' }}>Show a sign to begin...</span>
              : words.map((w, i) => (
                <div key={i} ref={el => chipRefs.current[i] = el} className="sign-chip"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.18)', borderRadius: '8px', padding: '5px 10px', fontFamily: 'ui-monospace, monospace', fontSize: 13, color: '#5eead4', cursor: 'default', transition: 'all 0.15s' }}>
                  <span style={{ color: '#374151', fontSize: 10 }}>{i + 1}</span>
                  {w.toUpperCase()}
                  <button onClick={() => { setWords(p => p.filter((_, j) => j !== i)); setSentence(''); setTranslations({}); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#4b5563', display: 'flex', lineHeight: 1, marginLeft: 2 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}>
                    <X size={11} />
                  </button>
                </div>
              ))}
          </div>
          {words.length > 0 && (
            <MagnetizeButton onClick={generate} disabled={generating} generating={generating} words={words} chipRefs={chipRefs} />
          )}
        </div>

        {/* Translation panel */}
        <div style={{ background: 'rgba(10,12,16,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#5eead4' }}>
              <Globe size={14} />
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Translation</span>
            </div>
            <LangDropdown value={lang} onChange={(v) => { setLang(v); setTranslationKey(k => k + 1); }} />
          </div>
          <div style={{ height: '160px', overflowY: 'auto', padding: '16px', background: 'rgba(5,7,9,0.6)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '8px' }}>
            {generating
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 12, fontStyle: 'italic', fontFamily: 'ui-monospace, monospace' }}>Processing...</span>
                </div>
              : displayedText
              ? <div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#f9fafb', lineHeight: 1.65 }}>
                    <SpecialText key={`${translationKey}-${lang}`} speed={16}>{displayedText}</SpecialText>
                  </div>
                  {lang !== 'english' && sentence && (
                    <p style={{ fontSize: 11, color: '#4b5563', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', fontFamily: 'ui-monospace, monospace', margin: '8px 0 0' }}>{sentence}</p>
                  )}
                </div>
              : <span style={{ color: '#374151', fontStyle: 'italic', fontSize: 12 }}>Sign gestures, then hit Generate...</span>}
          </div>
          <button onClick={speak} disabled={!sentence || generating}
            style={{ width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: !sentence || generating ? 'rgba(20,184,166,0.1)' : '#14b8a6', color: !sentence || generating ? '#374151' : '#042f2e', fontSize: 13, fontWeight: 700, cursor: !sentence || generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', letterSpacing: '0.07em', transition: 'all 0.2s', boxShadow: !sentence || generating ? 'none' : '0 0 20px rgba(20,184,166,0.25)' }}
            onMouseEnter={e => (sentence && !generating) && (e.currentTarget.style.background = '#0d9488')}
            onMouseLeave={e => (sentence && !generating) && (e.currentTarget.style.background = '#14b8a6')}>
            <Volume2 size={14} /> Speak Aloud
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .sign-chip:hover { border-color: rgba(20,184,166,0.35) !important; background: rgba(20,184,166,0.14) !important; }`}</style>
    </div>
  );
}

// ─── AIVoiceInput ─────────────────────────────────────────────────────────────
function AIVoiceInput({ onStart, onStop, visualizerBars = 48 }) {
  const [submitted, setSubmitted] = useState(false);
  const [time, setTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [bars] = useState(() => Array.from({ length: visualizerBars }, () => Math.random()));

  useEffect(() => { setIsClient(true); }, []);
  useEffect(() => {
    let id;
    if (submitted) { onStart?.(); id = setInterval(() => setTime(t => t + 1), 1000); }
    else { onStop?.(time); setTime(0); }
    return () => clearInterval(id);
  }, [submitted]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
      <div style={{ position: 'relative' }}>
        {submitted && <>
          <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '1px solid rgba(20,184,166,0.15)', animation: 'voiceRipple 2s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: -36, borderRadius: '50%', border: '1px solid rgba(20,184,166,0.08)', animation: 'voiceRipple 2s ease-out infinite 0.6s' }} />
        </>}
        <button onClick={() => setSubmitted(p => !p)} style={{ position: 'relative', zIndex: 2, width: 64, height: 64, borderRadius: '50%', border: '1px solid', borderColor: submitted ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.1)', background: submitted ? 'rgba(20,184,166,0.12)' : 'rgba(255,255,255,0.04)', color: submitted ? '#5eead4' : 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: submitted ? '0 0 32px rgba(20,184,166,0.2)' : 'none', transition: 'all 0.3s' }}>
          {submitted
            ? <div style={{ width: 20, height: 20, borderRadius: 4, background: '#5eead4', animation: 'spinSlow 3s linear infinite' }} />
            : <Mic size={22} />}
        </button>
      </div>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, letterSpacing: '0.1em', color: submitted ? '#5eead4' : 'rgba(255,255,255,0.2)', transition: 'color 0.3s' }}>{formatTime(time)}</span>
      <div style={{ width: 240, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {bars.map((seed, i) => (
          <div key={i} style={{ width: 2, borderRadius: 2, background: submitted ? 'rgba(20,184,166,0.6)' : 'rgba(255,255,255,0.08)', height: submitted && isClient ? `${20 + seed * 80}%` : '4px', animation: submitted ? `voicePulse ${0.8 + seed * 0.8}s ease-in-out infinite alternate` : 'none', animationDelay: `${i * 0.03}s`, transition: 'height 0.3s, background 0.3s' }} />
        ))}
      </div>
      <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, margin: 0, color: submitted ? '#5eead4' : 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', animation: submitted ? 'voiceBlink 1.5s ease-in-out infinite' : 'none', transition: 'color 0.3s' }}>
        {submitted ? '● Listening' : 'Click to speak'}
      </p>
      <style>{`@keyframes voiceRipple { 0%{transform:scale(0.7);opacity:1} 100%{transform:scale(1.9);opacity:0} } @keyframes spinSlow { to{transform:rotate(360deg)} } @keyframes voicePulse { 0%{transform:scaleY(0.4)} 100%{transform:scaleY(1)} } @keyframes voiceBlink { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ─── Speech → Sign ────────────────────────────────────────────────────────────
function SpeechToSign() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [keywords, setKeywords] = useState([]); // [{word, video_url}]
  const [processing, setProcessing] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const recRef = useRef(null);
  const tRef = useRef('');

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setTranscript(t); tRef.current = t;
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => { setRecording(false); if (tRef.current.trim()) processText(tRef.current); };
    recRef.current = rec;
  }, []);

  const handleStart = () => {
    if (!recRef.current) { alert('Speech Recognition not supported.'); return; }
    setTranscript(''); setKeywords([]); setCurrentIdx(0); setPlaying(false); tRef.current = '';
    recRef.current.start(); setRecording(true);
  };
  const handleStop = () => { if (recording && recRef.current) recRef.current.stop(); };

  const processText = async (text) => {
    setProcessing(true);
    try {
      const r = await fetch(`${BACKEND_URL}/speech-to-sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const d = await r.json();
      const valid = (d.keywords || []).filter(k => k.video_url);
      setKeywords(d.keywords || []);
      if (valid.length > 0) { setCurrentIdx(0); setPlaying(true); }
    } catch (_) {}
    setProcessing(false);
  };

  // Auto-advance to next video when current ends
  const handleVideoEnd = () => {
    if (currentIdx < validKeywords.length - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      setPlaying(false);
    }
  };

  const validKeywords = keywords.filter(k => k.video_url);
  const currentKw = playing && validKeywords[currentIdx];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      {/* Voice input panel */}
      <div style={{ background: 'rgba(10,12,16,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minHeight: '420px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)', gap: '24px' }}>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Voice Input</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', background: recording ? '#14b8a6' : 'rgba(255,255,255,0.1)', boxShadow: recording ? '0 0 8px rgba(20,184,166,0.7)' : 'none', transition: 'all 0.3s' }} />
        </div>
        <AIVoiceInput onStart={handleStart} onStop={handleStop} visualizerBars={48} />
        <div style={{ width: '100%', minHeight: 64, padding: '14px 16px', background: 'rgba(5,7,9,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: transcript ? 'flex-start' : 'center', justifyContent: 'center' }}>
          {transcript
            ? <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{transcript}</p>
            : <p style={{ color: '#374151', fontSize: 12, fontStyle: 'italic', margin: 0 }}>Your speech will appear here...</p>}
        </div>
      </div>

      {/* Sign video panel */}
      <div style={{ background: 'rgba(10,12,16,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '420px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Sign Visuals</span>
          {validKeywords.length > 0 && (
            <span style={{ background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.2)', color: '#5eead4', fontSize: 10, fontFamily: 'ui-monospace, monospace', borderRadius: '4px', padding: '2px 8px' }}>
              {playing ? `${currentIdx + 1} / ${validKeywords.length}` : `${validKeywords.length} signs`}
            </span>
          )}
        </div>

        {/* Video player */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 300 }}>
          {processing
            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Loader2 size={24} color="#14b8a6" style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ color: '#6b7280', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>Extracting keywords...</span>
              </div>
            : currentKw
            ? <>
                <div style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', color: '#5eead4', letterSpacing: '0.1em', fontWeight: 700 }}>
                  {currentKw.word}
                </div>
                <div style={{ width: '100%', height: 240, borderRadius: 10, border: '1px solid rgba(20,184,166,0.2)', background: '#000', overflow: 'hidden', flexShrink: 0 }}>
                  <video
                    ref={videoRef}
                    key={currentKw.video_url}
                    src={`${BACKEND_URL}${currentKw.video_url}`}
                    autoPlay
                    muted={false}
                    onEnded={handleVideoEnd}
                    onError={() => handleVideoEnd()}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  />
                </div>
                {/* Progress dots */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {validKeywords.map((_, i) => (
                    <button key={i} onClick={() => { setCurrentIdx(i); setPlaying(true); }}
                      style={{ width: i === currentIdx ? 20 : 6, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer', background: i === currentIdx ? '#14b8a6' : i < currentIdx ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.15)', transition: 'all 0.3s', padding: 0 }} />
                  ))}
                </div>
              </>
            : playing === false && validKeywords.length > 0
            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 13, color: '#5eead4', fontFamily: 'ui-monospace, monospace' }}>Sequence complete</div>
                <button onClick={() => { setCurrentIdx(0); setPlaying(true); }}
                  style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(20,184,166,0.4)', background: 'rgba(20,184,166,0.1)', color: '#5eead4', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.08em' }}>
                  ↺ Replay
                </button>
              </div>
            : keywords.length > 0 && validKeywords.length === 0
            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.5 }}>
                <Mic size={28} color="#6b7280" />
                <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', margin: 0 }}>No sign videos found for these words</p>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: 0.35 }}>
                <Mic size={28} color="#6b7280" />
                <p style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 13, textAlign: 'center', margin: 0 }}>Speak a sentence to see sign visuals</p>
              </div>}
        </div>

        {/* Keyword chips */}
        {keywords.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {keywords.map((k, i) => {
              const validIdx = validKeywords.indexOf(k);
              return (
                <button key={i} onClick={() => { if (k.video_url && validIdx !== -1) { setCurrentIdx(validIdx); setPlaying(true); } }}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid', borderColor: k.video_url ? 'rgba(20,184,166,0.3)' : 'rgba(255,255,255,0.08)', background: k.video_url ? 'rgba(20,184,166,0.08)' : 'rgba(255,255,255,0.03)', color: k.video_url ? '#5eead4' : '#4b5563', fontSize: 11, fontFamily: 'ui-monospace, monospace', fontWeight: 600, cursor: k.video_url ? 'pointer' : 'default', letterSpacing: '0.08em', transition: 'all 0.15s' }}>
                  {k.word}
                </button>
              );
            })}
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('sign2speech');
  const [status, setStatus] = useState('checking');
  const [ollamaOnline, setOllamaOnline] = useState(true);

  useEffect(() => {
    const check = () => fetch(`${BACKEND_URL}/`)
      .then(r => r.json())
      .then(d => { setStatus('online'); setOllamaOnline(d.llm_mode !== 'rule-based'); })
      .catch(() => setStatus('offline'));
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ minHeight: '100vh', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', position: 'relative' }}>
      <BackgroundPaths />
      <header style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,9,0.85)', backdropFilter: 'blur(16px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 34, height: 34, borderRadius: '9px', background: 'linear-gradient(135deg, #14b8a6, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(20,184,166,0.3)' }}>
              <Languages size={17} color="#042f2e" strokeWidth={2.5} />
            </div>
            <div>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.3px' }}>SignConnect</span>
              <span style={{ fontSize: 10, color: '#6b7280', display: 'block', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em', lineHeight: 1, marginTop: 1 }}>ASL · TRANSLATION · AI</span>
            </div>
          </div>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '3px' }}>
            {[{ id: 'sign2speech', Icon: Webcam, label: 'Sign → Speech' }, { id: 'speech2sign', Icon: Mic, label: 'Speech → Sign' }].map(({ id, Icon, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 18px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', transition: 'all 0.25s', background: tab === id ? 'rgba(20,184,166,0.15)' : 'transparent', color: tab === id ? '#5eead4' : '#6b7280', boxShadow: tab === id ? 'inset 0 0 0 1px rgba(20,184,166,0.25)' : 'none' }}
                onMouseEnter={e => tab !== id && (e.currentTarget.style.color = '#9ca3af')}
                onMouseLeave={e => tab !== id && (e.currentTarget.style.color = '#6b7280')}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {status === 'online' && !ollamaOnline && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.6)', display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#fbbf24', letterSpacing: '0.05em' }}>OLLAMA OFFLINE</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', background: status === 'online' ? '#14b8a6' : status === 'offline' ? '#ef4444' : '#f59e0b', boxShadow: status === 'online' ? '0 0 8px rgba(20,184,166,0.6)' : status === 'offline' ? '0 0 8px rgba(239,68,68,0.6)' : '0 0 8px rgba(245,158,11,0.6)', animation: status === 'checking' ? 'pulse 1s ease-in-out infinite' : 'none' }} />
              <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em', color: status === 'online' ? '#5eead4' : status === 'offline' ? '#f87171' : '#fbbf24' }}>
                {status === 'online' ? 'ONLINE' : status === 'offline' ? 'OFFLINE' : 'CONNECTING'}
              </span>
            </div>
          </div>
        </div>
      </header>
      {status === 'offline' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)', color: '#f87171', fontSize: 12, textAlign: 'center', padding: '8px 16px', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em', position: 'relative', zIndex: 10 }}>
          BACKEND OFFLINE — run:{' '}
          <code style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '2px 8px', borderRadius: '4px' }}>uvicorn api:app --reload</code>
        </div>
      )}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: tab === 'sign2speech' ? 'block' : 'none' }}><SignToSpeech /></div>
        <div style={{ display: tab === 'speech2sign' ? 'block' : 'none' }}><SpeechToSign /></div>
      </main>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes dropIn { from{opacity:0;transform:translateY(-8px) scale(0.95);filter:blur(6px)} to{opacity:1;transform:translateY(0) scale(1);filter:blur(0)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(10px);filter:blur(4px)} to{opacity:1;transform:translateX(0);filter:blur(0)} }
        * { box-sizing: border-box; }
        ::selection { background: rgba(20,184,166,0.25); }
        .sign-chip:hover { border-color: rgba(20,184,166,0.35) !important; background: rgba(20,184,166,0.14) !important; }
      `}</style>
    </div>
  );
}
