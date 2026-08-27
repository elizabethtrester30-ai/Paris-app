import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ---------------------------------------------------------
   THE MISSING CHAMPAGNE
   Ministry of Art & History — Case File #001

   AUDIO FILES: drop licensed .mp3 files into /public/audio/
   using these exact names. If a file is missing or fails to
   load, a synthesized placeholder sound plays instead so the
   app is never silent during development.
     /public/audio/seal-thud.mp3      - wax seal press
     /public/audio/page-turn.mp3      - dossier page turn
     /public/audio/telegraph.mp3      - transmission pulse / vibration
     /public/audio/door-creak.mp3     - door creak on arrival
     /public/audio/chime.mp3          - soft confirmation chime
     /public/audio/steam-train.mp3    - distant steam train (screen 1, looped, low volume)
--------------------------------------------------------- */

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Petit+Formal+Script&family=Dancing+Script:wght@500;700&family=Special+Elite&display=swap';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

function useFonts() {
  useEffect(() => {
    if (!document.getElementById('mc-fonts')) {
      const link = document.createElement('link');
      link.id = 'mc-fonts';
      link.rel = 'stylesheet';
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);
}

/* ---------- shared visual primitives ---------- */

const COLORS = {
  leather: '#1b1410',
  leatherLight: '#2a1f18',
  parchment: '#ecdfc2',
  parchmentDark: '#d9c69e',
  ink: '#2b1d12',
  wax: '#7a1414',
  waxDark: '#5c0f0f',
  gold: '#b8935a',
  goldBright: '#d4af6a',
  deepRed: '#3d0808',
  caution: '#8a5a1f',
};

/* ---------- LOCATIONS (real coordinates, used for GPS proximity) ---------- */

const LOCATIONS = {
  bernardins: { name: 'Collège des Bernardins', lat: 48.8497, lng: 2.3522, radius: 70 },
  beauxArts: { name: 'École des Beaux-Arts', lat: 48.8566, lng: 2.3352, radius: 70 },
  procope: { name: 'Le Procope', lat: 48.8532, lng: 2.3387, radius: 60 },
  jacquemart: { name: 'Musée Jacquemart-André', lat: 48.8747, lng: 2.3095, radius: 70 },
  castellane: { name: 'Castellane, Épernay', lat: 49.0429, lng: 3.9610, radius: 100 },
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- GPS proximity hook ---------- */

function useProximity(target, active) {
  const [distance, setDistance] = useState(null);
  const [arrived, setArrived] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | watching | denied | unsupported
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!active || !target) return;
    if (!('geolocation' in navigator)) { setStatus('unsupported'); return; }

    setStatus('watching');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const d = haversineMeters(pos.coords.latitude, pos.coords.longitude, target.lat, target.lng);
        setDistance(d);
        if (d <= target.radius) setArrived(true);
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 }
    );

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [active, target]);

  return { distance, arrived, status, forceArrive: () => setArrived(true) };
}

/* ---------- audio manager: real files w/ synthesized fallback ---------- */

function useAudio() {
  const ctxRef = useRef(null);
  const getCtx = () => {
    if (!ctxRef.current) {
      try { ctxRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    return ctxRef.current;
  };

  const synth = useCallback((kind) => {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === 'seal-thud') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);
      gain.gain.setValueAtTime(0.35, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now + 0.5);
    } else if (kind === 'telegraph') {
      [0, 0.14, 0.3].forEach((t, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'square'; osc.frequency.value = 1400;
        gain.gain.setValueAtTime(0.12, now + t); gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.06);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + t); osc.stop(now + t + 0.06);
      });
    } else if (kind === 'page-turn') {
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource(); src.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 2000;
      const gain = ctx.createGain(); gain.gain.value = 0.2;
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination); src.start(now);
    } else if (kind === 'door-creak') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(180, now); osc.frequency.linearRampToValueAtTime(90, now + 0.9);
      gain.gain.setValueAtTime(0.06, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now + 0.9);
    } else if (kind === 'chime') {
      [660, 990].forEach((f, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.15, now + i * 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.6);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.6);
      });
    }
  }, []);

  const play = useCallback((kind, file) => {
    const el = new Audio(file);
    el.volume = 0.85;
    el.play().catch(() => synth(kind));
    el.onerror = () => synth(kind);
  }, [synth]);

  return {
    sealThud: () => play('seal-thud', '/audio/seal-thud.mp3'),
    telegraph: () => play('telegraph', '/audio/telegraph.mp3'),
    pageTurn: () => play('page-turn', '/audio/page-turn.mp3'),
    doorCreak: () => play('door-creak', '/audio/door-creak.mp3'),
    chime: () => play('chime', '/audio/chime.mp3'),
  };
}

/* ---------- visual primitives ---------- */

function Seal({ size = 96, cracked = false }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      <div style={{ width: size, height: size, position: 'relative' }}>
        <img
          src="/images/ministry-seal.png"
          alt="Ministry of Art & History seal"
          onError={() => setImgFailed(true)}
          style={{
            width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover',
            boxShadow: '0 4px 18px rgba(0,0,0,0.6)', filter: cracked ? 'brightness(0.85)' : 'none'
          }}
        />
        {cracked && (
          <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
            <line x1={size*0.2} y1={size*0.15} x2={size*0.6} y2={size*0.85} stroke="#000" strokeWidth="1.5" opacity="0.5" />
            <line x1={size*0.75} y1={size*0.2} x2={size*0.45} y2={size*0.7} stroke="#000" strokeWidth="1" opacity="0.4" />
          </svg>
        )}
      </div>
    );
  }

  // fallback if the artwork file isn't found at /public/images/ministry-seal.png
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, ${COLORS.waxDark}, ${COLORS.wax} 60%, #4a0a0a 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 14px rgba(0,0,0,0.6), inset 0 0 12px rgba(0,0,0,0.5)',
      position: 'relative', border: '1px solid #3a0808'
    }}>
      <div style={{
        width: size * 0.72, height: size * 0.72, borderRadius: '50%',
        border: `1px solid ${COLORS.goldBright}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.32, color: COLORS.goldBright, opacity: 0.9
      }}>
        🪶🍇
      </div>
      {cracked && (
        <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
          <line x1={size*0.2} y1={size*0.15} x2={size*0.6} y2={size*0.85} stroke="#000" strokeWidth="1.5" opacity="0.5" />
          <line x1={size*0.75} y1={size*0.2} x2={size*0.45} y2={size*0.7} stroke="#000" strokeWidth="1" opacity="0.4" />
        </svg>
      )}
    </div>
  );
}

function StampBadge({ children }) {
  return (
    <div style={{
      fontFamily: "'Special Elite', monospace", letterSpacing: '3px',
      color: COLORS.caution, border: `2px solid ${COLORS.caution}`,
      padding: '6px 16px', display: 'inline-block', transform: 'rotate(-1.5deg)',
      fontSize: '13px', opacity: 0.9
    }}>
      {children}
    </div>
  );
}

function GlowButton({ children, onClick, pulse = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: '16px', letterSpacing: '2px',
        textTransform: 'uppercase', background: `linear-gradient(180deg, ${COLORS.goldBright}, ${COLORS.gold})`,
        color: '#241a0f', border: 'none', borderRadius: '3px', padding: '13px 28px',
        cursor: 'pointer', fontWeight: 600, boxShadow: pulse ? `0 0 18px ${COLORS.goldBright}` : '0 2px 8px rgba(0,0,0,0.4)',
        animation: pulse ? 'mc-pulse 1.6s ease-in-out infinite' : 'none',
        ...style
      }}
    >
      {children}
    </button>
  );
}

function Handwriting({ speaker, lines, size = 22 }) {
  const isClaude = speaker === 'claude';
  const font = isClaude ? "'Petit Formal Script', cursive" : "'Dancing Script', cursive";
  const color = isClaude ? '#2b2418' : '#3a1d14';
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{
        fontFamily: "'Special Elite', monospace", fontSize: '10px', letterSpacing: '2px',
        color: COLORS.gold, marginBottom: '10px', textTransform: 'uppercase'
      }}>
        {isClaude ? '— Claude' : '— Pierre'}
      </div>
      {lines.map((line, i) => (
        <p key={i} style={{
          fontFamily: font, fontSize: `${size + (isClaude ? 0 : 4)}px`, color,
          lineHeight: 1.5, margin: '0 0 10px 0', fontWeight: isClaude ? 400 : 500
        }}>
          {line}
        </p>
      ))}
    </div>
  );
}

function DossierPage({ children }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${COLORS.parchment}, ${COLORS.parchmentDark})`,
      border: `1px solid ${COLORS.gold}66`, borderRadius: '4px', padding: '28px 24px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)', position: 'relative', maxWidth: '440px', width: '100%'
    }}>
      <div style={{ position: 'absolute', top: '10px', right: '14px', opacity: 0.35 }}>
        <Seal size={34} />
      </div>
      {children}
    </div>
  );
}

function Screen({ children, bg = COLORS.leather }) {
  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 18px', boxSizing: 'border-box', transition: 'background 0.8s ease'
    }}>
      {children}
    </div>
  );
}

/* ---------- Antique-styled real map (Leaflet + sepia filter) ---------- */

function loadLeaflet(onReady) {
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
    document.head.appendChild(link);
  }
  if (window.L) { onReady(); return; }
  if (!document.getElementById('leaflet-js')) {
    const script = document.createElement('script');
    script.id = 'leaflet-js'; script.src = LEAFLET_JS;
    script.onload = onReady;
    document.head.appendChild(script);
  } else {
    const t = setInterval(() => { if (window.L) { clearInterval(t); onReady(); } }, 100);
  }
}

function AntiqueMap({ target, label, sublabel, visited = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    loadLeaflet(() => {
      if (!mounted || !containerRef.current || !window.L) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const L = window.L;
      const map = L.map(containerRef.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: false })
        .setView([target.lat, target.lng], 15);

      // Stamen Watercolor gives an antique, hand-painted map look while remaining
      // geographically accurate — real streets, real geography, aged aesthetic.
      L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg', {
        maxZoom: 18, minZoom: 3
      }).addTo(map);
      // faint linework layer on top for street legibility, tinted to match
      L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner-lines/{z}/{x}/{y}.png', {
        maxZoom: 18, minZoom: 3, opacity: 0.25
      }).addTo(map);

      visited.forEach(v => {
        L.circleMarker([v.lat, v.lng], { radius: 5, color: '#2b1d12', fillColor: '#2b1d1288', fillOpacity: 0.6, weight: 1 }).addTo(map);
      });

      const glowIcon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${COLORS.goldBright};
                box-shadow:0 0 18px 7px ${COLORS.goldBright}aa;animation:mc-glow 2.2s ease-in-out infinite"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8]
      });
      L.marker([target.lat, target.lng], { icon: glowIcon }).addTo(map);

      mapRef.current = map;
    });
    return () => { mounted = false; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [target, visited]);

  return (
    <div style={{ width: '100%', maxWidth: '440px', marginBottom: '18px' }}>
      <div style={{
        width: '100%', aspectRatio: '4/3', borderRadius: '4px', border: `1px solid ${COLORS.gold}66`,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden', position: 'relative'
      }}>
        <div ref={containerRef} style={{
          width: '100%', height: '100%',
          filter: 'sepia(0.55) saturate(1.3) hue-rotate(-8deg) contrast(1.05) brightness(0.96)'
        }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 40px rgba(60,40,20,0.35)' }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: '10px' }}>
        <div style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px', color: COLORS.parchment, letterSpacing: '1px' }}>{label}</div>
        {sublabel && <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '12px', color: `${COLORS.parchment}99`, fontStyle: 'italic', marginTop: '2px' }}>{sublabel}</div>}
      </div>
    </div>
  );
}

/* ---------- GPS arrival gate: shown on every map screen ---------- */

function ArrivalGate({ target, onArrive, tone }) {
  const { distance, arrived, status } = useProximity(target, true);
  const [pinged, setPinged] = useState(false);

  useEffect(() => {
    if (arrived && !pinged) { setPinged(true); tone.chime(); }
  }, [arrived, pinged, tone]);

  if (status === 'denied' || status === 'unsupported') {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: "'Cormorant Garamond', serif", color: COLORS.parchment, opacity: 0.7, fontSize: '13px', marginBottom: '12px', fontStyle: 'italic' }}>
          Location access unavailable — enable it to auto-detect arrival, or confirm manually.
        </p>
        <GlowButton onClick={() => { tone.doorCreak(); onArrive(); }}>You've Arrived</GlowButton>
      </div>
    );
  }

  if (!arrived) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: COLORS.parchment, fontStyle: 'italic', opacity: 0.7, marginBottom: '10px' }}>
          {distance != null ? `${Math.round(distance)}m away — keep walking...` : 'Locating you...'}
        </div>
        <button onClick={() => { tone.doorCreak(); onArrive(); }} style={{
          background: 'none', border: 'none', color: `${COLORS.parchment}66`, fontFamily: "'Cormorant Garamond', serif",
          fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', fontStyle: 'italic'
        }}>
          (testing — confirm arrival manually)
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.gold, fontSize: '13px', letterSpacing: '2px', marginBottom: '14px' }}>
        TRANSMISSION RECEIVED — LOCATION CONFIRMED
      </div>
      <GlowButton pulse onClick={() => { tone.doorCreak(); onArrive(); }}>You've Arrived</GlowButton>
    </div>
  );
}

/* =========================================================
   SCREEN DATA
========================================================= */

export default function MissingChampagneApp() {
  useFonts();
  const [screen, setScreen] = useState(0);
  const [obs, setObs] = useState('');
  const [agentName, setAgentName] = useState('');
  const [waitReady, setWaitReady] = useState(false);
  const tone = useAudio();
  const next = () => setScreen(s => s + 1);

  useEffect(() => {
    if (screen === 16) {
      setWaitReady(false);
    }
  }, [screen]);

  /* ---------- 0: opening seal ---------- */
  if (screen === 0) {
    return (
      <Screen bg="#050403">
        <audio autoPlay loop src="/audio/steam-train.mp3" style={{ display: 'none' }} onError={(e) => { e.target.style.display = 'none'; }} />
        <div style={{ fontFamily: "'Special Elite', monospace", color: '#8a7a5f', fontSize: '11px', letterSpacing: '4px', marginBottom: '26px', opacity: 0.7 }}>
          ~ distant steam train ~
        </div>
        <div onClick={() => tone.sealThud()}>
          <Seal size={120} />
        </div>
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.parchment, fontSize: '22px', letterSpacing: '6px', marginTop: '30px' }}>
          CONFIDENTIAL
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: COLORS.gold, fontSize: '15px', letterSpacing: '3px', marginTop: '6px', fontStyle: 'italic' }}>
          Case #001
        </div>
        <div style={{ marginTop: '40px' }}>
          <GlowButton pulse onClick={() => { tone.pageTurn(); next(); }}>Open Dossier</GlowButton>
        </div>
      </Screen>
    );
  }

  /* ---------- 1: Claude accept mission ---------- */
  if (screen === 1) {
    return (
      <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
        <DossierPage>
          <Handwriting speaker="claude" lines={[
            'AGENT,',
            'Pierre and I have already secured the bottle beneath Épernay.',
            'Unfortunately... someone has discovered we\'re in Paris.'
          ]} />
          <GlowButton pulse onClick={next}>Accept Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 2: incoming transmission anticipation ---------- */
  if (screen === 2) {
    return (
      <Screen bg="#0c0a08">
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.gold, fontSize: '18px', letterSpacing: '4px', marginBottom: '30px' }}>
          INCOMING TRANSMISSION
        </div>
        <div style={{ fontSize: '30px', animation: 'mc-vibrate 0.4s infinite' }}>📡</div>
        <div style={{ marginTop: '40px' }}>
          <GlowButton onClick={() => { tone.telegraph(); next(); }}>Open Transmission</GlowButton>
        </div>
      </Screen>
    );
  }

  /* ---------- 3: MISSION STATUS ACTIVE ---------- */
  if (screen === 3) {
    return (
      <Screen bg="#161009">
        <StampBadge>MISSION STATUS — ACTIVE</StampBadge>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: COLORS.parchment, fontSize: '19px', textAlign: 'center', maxWidth: '380px', margin: '26px 0', lineHeight: 1.6 }}>
          Locate the painter — Jacques-Louis David.<br />Begin at the Collège des Bernardins.
        </div>
        <GlowButton onClick={next}>Begin Investigation</GlowButton>
      </Screen>
    );
  }

  /* ---------- 4: map to Bernardins (real GPS) ---------- */
  if (screen === 4) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.bernardins} label="COLLÈGE DES BERNARDINS" />
        <ArrivalGate target={LOCATIONS.bernardins} onArrive={next} tone={tone} />
      </Screen>
    );
  }

  /* ---------- 5: Claude — observation at Bernardins ---------- */
  if (screen === 5) {
    return (
      <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
        <DossierPage>
          <Handwriting speaker="claude" lines={[
            'Good. Don\'t go inside yet.',
            'Look around. History hides in plain sight.',
            'If you were trying to hide one of Europe\'s greatest secrets... would this be the kind of place you would choose?'
          ]} />
          <div style={{ fontFamily: "'Special Elite', monospace", fontSize: '10px', color: COLORS.gold, letterSpacing: '2px', marginBottom: '6px' }}>
            YOUR OBSERVATION
          </div>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
            placeholder="Write what you notice..."
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', padding: '10px', borderRadius: '3px', border: `1px solid ${COLORS.gold}88`, marginBottom: '14px', background: '#fffaf0', resize: 'vertical' }} />
          <GlowButton onClick={() => { setObs(''); next(); }}>Submit Report</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 6: Claude responds ---------- */
  if (screen === 6) {
    return (
      <Screen bg="#0c0a08">
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.gold, fontSize: '13px', letterSpacing: '2px', marginBottom: '20px' }}>
          TRANSMISSION RECEIVED
        </div>
        <DossierPage>
          <Handwriting speaker="claude" lines={[
            'Interesting.',
            'You are beginning to see as we do.',
            'A secret is safest when hidden in the most ordinary places.',
            'The Collège des Bernardins was not chosen because it was beautiful. It was chosen because knowledge was protected here.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 7: map to Beaux-Arts ---------- */
  if (screen === 7) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.beauxArts} label="ÉCOLE DES BEAUX-ARTS" visited={[LOCATIONS.bernardins]} />
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'Walk toward the river. Your destination is École des Beaux-Arts.',
            'Keep Notre Dame behind you. Don\'t be in a hurry.',
            'Remember to observe what is around you. The best investigators notice what others ignore.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 8: quiet walking screen ---------- */
  if (screen === 8) {
    return (
      <Screen bg="#0e0c0a">
        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: COLORS.parchment, fontStyle: 'italic', fontSize: '16px', opacity: 0.6, textAlign: 'center', maxWidth: '320px' }}>
          Paris moves around you. Nothing to read here — just walk, and watch.
        </div>
        <div style={{ marginTop: '30px' }}>
          <GlowButton onClick={() => { tone.telegraph(); next(); }}>— phone vibrates —</GlowButton>
        </div>
      </Screen>
    );
  }

  /* ---------- 9: Shakespeare & Co reveal ---------- */
  if (screen === 9) {
    return (
      <Screen bg="#0c0a08">
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.gold, fontSize: '13px', letterSpacing: '2px', marginBottom: '20px' }}>
          TRANSMISSION RECEIVED
        </div>
        <DossierPage>
          <Handwriting speaker="claude" lines={['Someone has been watching us.']} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 10: Pierre — do not change pace ---------- */
  if (screen === 10) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.beauxArts} label="ÉCOLE DES BEAUX-ARTS" sublabel="ahead" visited={[LOCATIONS.bernardins]} />
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'Do not change your pace. Do not look for them.',
            'Let them believe we have not noticed.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 11: arrival Beaux-Arts (real GPS) ---------- */
  if (screen === 11) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.beauxArts} label="ÉCOLE DES BEAUX-ARTS" visited={[LOCATIONS.bernardins]} />
        <ArrivalGate target={LOCATIONS.beauxArts} onArrive={next} tone={tone} />
      </Screen>
    );
  }

  /* ---------- 12: transmission at Beaux-Arts ---------- */
  if (screen === 12) {
    return (
      <Screen bg="#0c0a08">
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.gold, fontSize: '13px', letterSpacing: '2px', marginBottom: '20px' }}>
          TRANSMISSION RECEIVED
        </div>
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'Jacques-Louis David should be here. But something is wrong.',
            'Artists rarely disappear without leaving something behind.',
            'They leave traces. A sketch. A signature. A place they returned to.'
          ]} />
          <GlowButton onClick={next}>Begin Investigation</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 13: Gaillon portico observation ---------- */
  if (screen === 13) {
    return (
      <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'I want you to look at this place differently.',
            'Do not search for David. Search for evidence that the artist was here.'
          ]} />
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '15px', color: COLORS.ink, marginBottom: '10px', lineHeight: 1.5 }}>
            This doorway wasn't built for this courtyard — it was carried here from somewhere else, centuries ago. A relic, moved to survive. Look closely: what does it tell you about the kind of place that shelters things worth saving?
          </p>
          <div style={{ fontFamily: "'Special Elite', monospace", fontSize: '10px', color: COLORS.gold, letterSpacing: '2px', marginBottom: '6px' }}>
            YOUR OBSERVATION
          </div>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
            placeholder="Write what you notice about the Gaillon portico..."
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', padding: '10px', borderRadius: '3px', border: `1px solid ${COLORS.gold}88`, marginBottom: '14px', background: '#fffaf0', resize: 'vertical' }} />
          <GlowButton onClick={() => { setObs(''); next(); }}>Submit Observation</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 14: Pierre response ---------- */
  if (screen === 14) {
    return (
      <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
        <DossierPage>
          <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: '22px', color: '#3a1d14', marginBottom: '16px' }}>
            "Good — you are beginning to understand. An investigator does not simply look. An investigator notices."
          </p>
          <Handwriting speaker="pierre" lines={[
            'I have learned one thing about artists...',
            'They are not always where they say they are.',
            'But they are often where someone they love is waiting.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 15: map to Le Procope ---------- */
  if (screen === 15) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.procope} label="LE PROCOPE" visited={[LOCATIONS.bernardins, LOCATIONS.beauxArts]} />
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'David kept rooms above a café near Saint-Germain.',
            'If Daphne is hunting him, she will have gone there first.',
            'So will we.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 16: arrival Le Procope (real GPS), Claude clipped, coffee wait ---------- */
  if (screen === 16) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.procope} label="LE PROCOPE" visited={[LOCATIONS.bernardins, LOCATIONS.beauxArts]} />
        <ArrivalGateOnce target={LOCATIONS.procope} tone={tone}>
          <DossierPage>
            <Handwriting speaker="claude" lines={['Something is wrong here.']} />
            <div style={{ fontFamily: "'Special Elite', monospace", fontSize: '10px', color: COLORS.gold, letterSpacing: '2px', margin: '16px 0 10px' }}>
              — Pierre —
            </div>
            <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: '22px', color: '#3a1d14', marginBottom: '10px' }}>
              "Sit. Order something. Watch the room before you move — a good agent is never the first one to react."
            </p>
            {!waitReady ? (
              <WaitTimer seconds={20} onDone={() => setWaitReady(true)} />
            ) : (
              <GlowButton pulse onClick={next}>Continue</GlowButton>
            )}
          </DossierPage>
        </ArrivalGateOnce>
      </Screen>
    );
  }

  /* ---------- 17: discovery ---------- */
  if (screen === 17) {
    return (
      <Screen bg="#0c0a08">
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'A chair overturned. Isabella\'s shawl, left on the floor.',
            'She did not leave willingly.'
          ]} />
          <Handwriting speaker="claude" lines={[
            'Daphne was here.',
            'We are no longer looking for a painter. We are looking for a woman who takes what she wants.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 18: MISSION STATUS CAUTION ---------- */
  if (screen === 18) {
    return (
      <Screen bg="#161009">
        <StampBadge>MISSION STATUS — CAUTION</StampBadge>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: COLORS.parchment, fontSize: '17px', margin: '24px 0', fontStyle: 'italic' }}>
          Continue Following the Trail.
        </div>
        <GlowButton onClick={next}>Continue Mission</GlowButton>
      </Screen>
    );
  }

  /* ---------- 19: map to Jacquemart-André ---------- */
  if (screen === 19) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.jacquemart} label="MUSÉE JACQUEMART-ANDRÉ" visited={[LOCATIONS.bernardins, LOCATIONS.beauxArts, LOCATIONS.procope]} />
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'We believe David may have left École des Beaux-Arts before we arrived.',
            'Our next lead takes us to a place where art, wealth and secrets meet.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 20: arrival Jacquemart-André (real GPS) ---------- */
  if (screen === 20) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.jacquemart} label="MUSÉE JACQUEMART-ANDRÉ" visited={[LOCATIONS.bernardins, LOCATIONS.beauxArts, LOCATIONS.procope]} />
        <ArrivalGate target={LOCATIONS.jacquemart} onArrive={next} tone={tone} />
      </Screen>
    );
  }

  /* ---------- 21: caution stamp + Pierre ---------- */
  if (screen === 21) {
    return (
      <Screen bg="#161009">
        <StampBadge>MISSION STATUS — CAUTION</StampBadge>
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'We are close. Isabella was here.',
            'Search carefully. Wealth leaves traces...',
            'and secrets are often hidden among beautiful things.'
          ]} />
          <GlowButton onClick={next}>Begin Search</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 22: the search, atmospheric pressure ---------- */
  if (screen === 22) {
    return (
      <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'Isabella liked beautiful rooms. She would have gone somewhere she felt safe.',
            'Look for a room that feels... unfinished. A place someone left in a hurry.'
          ]} />
          <div style={{ fontFamily: "'Special Elite', monospace", fontSize: '10px', color: COLORS.gold, letterSpacing: '2px', marginBottom: '6px' }}>
            YOUR OBSERVATION
          </div>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', padding: '10px', borderRadius: '3px', border: `1px solid ${COLORS.gold}88`, marginBottom: '10px', background: '#fffaf0', resize: 'vertical' }} />
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '12px', color: `${COLORS.ink}99`, marginBottom: '14px' }}>
            A guard is making his rounds. Don't linger too long in one place. The museum closes soon — Pierre would want you to hurry, but not to panic.
          </p>
          <GlowButton onClick={() => { setObs(''); next(); }}>Submit</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 23: Isabella is gone / Daphne to Épernay ---------- */
  if (screen === 23) {
    return (
      <Screen bg="#050403">
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.gold, fontSize: '13px', letterSpacing: '2px', marginBottom: '20px' }}>
          TRANSMISSION RECEIVED
        </div>
        <DossierPage>
          <Handwriting speaker="pierre" lines={['Isabella is gone.']} />
          <Handwriting speaker="claude" lines={[
            'Daphne has revealed herself. She has already left Paris. She is heading to Épernay.',
            'We cannot follow her on foot. Our Paris investigation is complete.'
          ]} />
          <div style={{ textAlign: 'center', margin: '18px 0', fontSize: '34px' }}>🎫</div>
          <p style={{ textAlign: 'center', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', color: COLORS.ink, marginBottom: '16px' }}>
            It's time to return to Champagne.
          </p>
          <GlowButton onClick={next}>Continue Mission in Épernay</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 24: new heavier dossier, STAY CLOSE ---------- */
  if (screen === 24) {
    return (
      <Screen bg={COLORS.deepRed}>
        <Seal size={70} />
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.parchment, fontSize: '26px', letterSpacing: '6px', margin: '30px 0' }}>
          STAY CLOSE
        </div>
        <GlowButton onClick={next}>Continue Mission</GlowButton>
      </Screen>
    );
  }

  /* ---------- 25: field note to Gare de l'Est ---------- */
  if (screen === 25) {
    return (
      <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
        <DossierPage>
          <Handwriting speaker="claude" lines={[
            'Gare de l\'Est.',
            'Take the RER or Métro Line 4 or 5 — whichever is closer to you.',
            'We will meet you in Champagne.'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 26: map + arrival at Castellane, Épernay (real GPS) ---------- */
  if (screen === 26) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.castellane} label="CASTELLANE — ÉPERNAY" />
        <ArrivalGate target={LOCATIONS.castellane} onArrive={next} tone={tone} />
      </Screen>
    );
  }

  /* ---------- 27: Pierre at Castellane ---------- */
  if (screen === 27) {
    return (
      <Screen>
        <AntiqueMap target={LOCATIONS.castellane} label="CASTELLANE — ÉPERNAY" />
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'The trail leads here. The champagne houses hold many secrets.',
            'Will we find Isabella?'
          ]} />
          <GlowButton onClick={next}>Continue Mission</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 28: climax ---------- */
  if (screen === 28) {
    return (
      <Screen bg="#050403">
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.gold, fontSize: '13px', letterSpacing: '2px', marginBottom: '20px' }}>
          TRANSMISSION RECEIVED
        </div>
        <DossierPage>
          <Handwriting speaker="pierre" lines={[
            'We were too late.',
            'The Duke has already left... with Daphne!!!'
          ]} />
          <Handwriting speaker="pierre" lines={[
            'He believes she is Isabella.',
            'Isabella has returned to the person she was always meant to find. Jacques-Louis David.',
            'And the Champagne... remains safe.',
            'As the Duke will discover the truth eventually... so will you.'
          ]} />
          <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: '24px', color: '#3a1d14', margin: '14px 0' }}>
            But Isabella is safe.
          </p>
          <GlowButton pulse onClick={next}>Continue</GlowButton>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 29: invitation to explore Champagne Alley (last stop before Mission Complete) ---------- */
  if (screen === 29) {
    return (
      <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
        <DossierPage>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '17px', color: COLORS.ink, textAlign: 'center', lineHeight: 1.7, marginBottom: '20px' }}>
            This is your opportunity to explore the world of Champagne in Épernay.
            <br /><br />
            Walk Champagne Alley, and enjoy.
          </p>
          <div style={{ textAlign: 'center' }}>
            <GlowButton onClick={next}>Complete Mission</GlowButton>
          </div>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 29: mission complete ---------- */
  if (screen === 30) {
    return (
      <Screen bg="#050403">
        <Seal size={110} cracked />
        <div style={{ fontFamily: "'Special Elite', monospace", color: COLORS.parchment, fontSize: '22px', letterSpacing: '5px', margin: '24px 0' }}>
          MISSION COMPLETE
        </div>
        <DossierPage>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '18px', color: COLORS.ink, textAlign: 'center', lineHeight: 1.6, marginBottom: '18px' }}>
            Congratulations, Agent.<br />You have successfully completed:
          </p>
          <p style={{ fontFamily: "'Petit Formal Script', cursive", fontSize: '26px', color: COLORS.wax, textAlign: 'center', marginBottom: '20px' }}>
            The Missing Champagne
          </p>
          <div style={{ textAlign: 'center' }}>
            <GlowButton onClick={next}>Welcome to the Ministry of Art &amp; History</GlowButton>
          </div>
        </DossierPage>
      </Screen>
    );
  }

  /* ---------- 30: certificate ---------- */
  if (screen === 31) {
    return <Certificate agentName={agentName} setAgentName={setAgentName} />;
  }

  return null;
}

/* ---------- helpers used above ---------- */

function ArrivalGateOnce({ target, tone, children }) {
  const { arrived, distance, status, forceArrive } = useProximity(target, true);
  const firedRef = useRef(false);
  useEffect(() => {
    if (arrived && !firedRef.current) { firedRef.current = true; tone.doorCreak(); }
  }, [arrived, tone]);

  if (!arrived) {
    const gpsUnavailable = status === 'denied' || status === 'unsupported';
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", color: COLORS.parchment, fontStyle: 'italic', opacity: 0.7, marginBottom: '14px' }}>
          {gpsUnavailable
            ? 'Location access unavailable — confirm manually below.'
            : distance != null ? `${Math.round(distance)}m from Le Procope — keep walking...` : 'Approaching Le Procope...'}
        </div>
        <GlowButton onClick={() => { firedRef.current = true; tone.doorCreak(); forceArrive(); }}>You've Arrived</GlowButton>
      </div>
    );
  }
  return children;
}

function WaitTimer({ seconds, onDone }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone]);
  return (
    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '13px', color: `${COLORS.ink}88` }}>
      The café hums around you. Someone laughs two tables over. A cup is set down. ({remaining}s)
    </p>
  );
}

/* ---------- certificate with canvas download ---------- */

function Certificate({ agentName, setAgentName }) {
  const canvasRef = useRef(null);

  const draw = useCallback((name) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = COLORS.parchment;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.strokeStyle = COLORS.wax;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(34, 34, w - 68, h - 68);

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '20px Georgia';
    ctx.fillText('THE MINISTRY OF ART & HISTORY', w / 2, 100);
    ctx.font = 'italic 16px Georgia';
    ctx.fillText('hereby recognizes', w / 2, 140);

    ctx.font = 'bold 42px Georgia';
    ctx.fillStyle = COLORS.wax;
    ctx.fillText(name || 'Agent', w / 2, 220);

    ctx.font = '18px Georgia';
    ctx.fillStyle = COLORS.ink;
    ctx.fillText('Mission: The Missing Champagne', w / 2, 280);
    ctx.font = 'italic 16px Georgia';
    ctx.fillText('Status: Completed', w / 2, 312);

    ctx.font = '13px Georgia';
    ctx.fillStyle = `${COLORS.ink}99`;
    ctx.fillText('Case #001 · Ministry of Art & History · Paris — Épernay', w / 2, h - 60);
  }, []);

  useEffect(() => { draw(agentName); }, [agentName, draw]);

  const download = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'missing-champagne-certificate.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Screen bg={`linear-gradient(160deg, ${COLORS.leather}, ${COLORS.leatherLight})`}>
      <canvas ref={canvasRef} width={600} height={420} style={{ width: '100%', maxWidth: '440px', borderRadius: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', marginBottom: '20px' }} />
      <input
        value={agentName}
        onChange={e => setAgentName(e.target.value)}
        placeholder="Enter your name for the certificate"
        style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', padding: '10px 14px', borderRadius: '3px', border: `1px solid ${COLORS.gold}88`, marginBottom: '16px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', textAlign: 'center' }}
      />
      <GlowButton onClick={download}>Download Certificate</GlowButton>
    </Screen>
  );
}

/* ---------- keyframes ---------- */
const style = document.createElement('style');
style.innerHTML = `
@keyframes mc-pulse { 0%,100% { box-shadow: 0 0 8px ${COLORS.goldBright}; } 50% { box-shadow: 0 0 26px ${COLORS.goldBright}; } }
@keyframes mc-glow { 0%,100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.25); } }
@keyframes mc-vibrate { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
`;
if (!document.getElementById('mc-keyframes')) { style.id = 'mc-keyframes'; document.head.appendChild(style); }
