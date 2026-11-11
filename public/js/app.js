import { detectPitch } from './pitch.js';
import { INSTRUMENTS, findTuning, midiToFreq, centsBetween, nearestNote, SHARP_NAMES } from './tunings.js';
import { FAN, buildFan, buildHeadstock, buildWinFan } from './scene.js';
import { Mic, sounds } from './audio.js';
import { createFx } from './fx.js';

const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`pav:${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`pav:${key}`, JSON.stringify(value));
    } catch { /* private mode: settings just do not persist */ }
  },
};

const IN_TUNE_CENTS = 5;   // how close counts as in tune
const HOLD_MS = 650;       // how long to stay there before the string locks
const ANALYSE_EVERY_MS = 50;
const SILENCE_MS = 500;

const state = {
  instrumentId: store.get('instrument', 'guitar'),
  tuningId: store.get('tuning', 'standard'),
  mode: store.get('mode', 'strings'),
  a4: store.get('a4', 440),
  sound: store.get('sound', true),
  strings: [],        // [{ midi, label, octave }]
  tuningName: '',
  tuned: [],
  pinned: null,       // string index the player pinned by tapping a peg
  active: -1,
  hold: 0,
  startedAt: null,
  finished: false,
};

const mic = new Mic();
const fx = createFx($('fx'));
const fan = $('fan');
const feathers = buildFan($('fanFeathers'));
const needle = $('needle');
const pupil = $('pupil');
const readout = document.querySelector('.readout');
let head = { pegs: [], strings: [], rings: [] };

// ---------- Rendering helpers ----------

let shownStep = null;
let shownGood = null;
function lightFan(cents) {
  const idle = cents == null;
  const step = idle ? 0 : Math.max(-FAN.steps, Math.min(FAN.steps, Math.round(cents / FAN.centsPerStep)));
  const good = !idle && Math.abs(cents) <= IN_TUNE_CENTS;
  fan.classList.toggle('is-idle', idle);
  if (step === shownStep && good === shownGood) return;
  shownStep = step;
  shownGood = good;
  fan.classList.toggle('is-good', good);
  feathers.forEach((f, k) => {
    const i = k - FAN.steps;
    f.classList.toggle('is-flat', !good && step < 0 && i < 0 && i >= step);
    f.classList.toggle('is-sharp', !good && step > 0 && i > 0 && i <= step);
  });
}

let needleDeg = 0;
let needleTarget = 0;
function aimNeedle(cents) {
  const deg = (cents / FAN.centsPerStep) * FAN.degPerStep;
  needleTarget = Math.max(-FAN.maxNeedleDeg, Math.min(FAN.maxNeedleDeg, deg));
}

function setReadout(stateName, label, octave, hint, centsText) {
  readout.dataset.state = stateName;
  if (label != null) {
    $('noteName').textContent = label;
    $('noteOct').textContent = octave ?? '';
  }
  const hintEl = $('hint');
  if (hintEl.textContent !== hint) hintEl.textContent = hint;
  $('cents').textContent = centsText || ' ';
}

const formatCents = (c) => {
  const r = Math.round(c);
  return r === 0 ? 'Dead on' : `${r > 0 ? '+' : ''}${r} cents`;
};
const formatTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function setRing(i, progress) {
  const ring = head.rings[i];
  if (ring) ring.style.strokeDashoffset = (ring.dataset.c * (1 - Math.min(1, progress))).toFixed(1);
}

function markActive(index, ringing) {
  state.active = index;
  head.pegs.forEach((p, i) => p.classList.toggle('is-active', i === index));
  head.strings.forEach((s, i) => {
    s.classList.toggle('is-active', i === index);
    s.classList.toggle('is-ringing', ringing && i === index);
  });
}

function updateHud() {
  const done = state.tuned.filter(Boolean).length;
  $('featherCount').textContent = `${done}/${state.strings.length}`;
}

function play(name, ...args) {
  if (!state.sound || !mic.ctx) return;
  mic.resume();
  muteUntil = performance.now() + sounds[name](mic.ctx, ...args);
  history.length = 0;
}

// ---------- Game ----------

function resetGame() {
  state.tuned = state.strings.map(() => false);
  state.hold = 0;
  state.startedAt = null;
  state.finished = false;
  state.pinned = null;
  head.pegs.forEach((p, i) => {
    p.classList.remove('is-tuned', 'is-locked', 'just-tuned');
    p.setAttribute('aria-pressed', 'false');
    setRing(i, 0);
  });
  head.strings.forEach((s) => s.classList.remove('is-tuned'));
  fan.classList.remove('is-party');
  $('timer').textContent = '0:00';
  $('boardTip').textContent = 'Tap a peg to hear its note and lock on.';
  markActive(-1, false);
  updateHud();
  goIdle();
}

function lockString(i) {
  state.tuned[i] = true;
  const peg = head.pegs[i];
  peg.classList.add('is-tuned', 'just-tuned');
  peg.addEventListener('animationend', () => peg.classList.remove('just-tuned'), { once: true });
  head.strings[i].classList.add('is-tuned');
  setRing(i, 0);
  const box = peg.getBoundingClientRect();
  fx.burst(box.left + box.width / 2, box.top + box.height / 2, 16);
  fan.classList.remove('hop');
  void fan.getBoundingClientRect();
  fan.classList.add('hop');
  navigator.vibrate?.(25);
  play('chime');
  updateHud();
  if (state.pinned === i) pin(null);
  if (state.tuned.every(Boolean) && !state.finished) setTimeout(win, 650);
}

function win() {
  if (state.finished || !state.tuned.every(Boolean)) return;
  state.finished = true;
  const elapsed = performance.now() - (state.startedAt ?? performance.now());
  const key = `best:${state.instrumentId}:${state.tuningId}`;
  const best = store.get(key, null);
  const isBest = best == null || elapsed < best;
  if (isBest) store.set(key, Math.round(elapsed));
  $('winTuning').textContent = state.tuningName;
  $('winTime').textContent = formatTime(elapsed);
  $('winBest').textContent = isBest ? (best == null ? 'First time on this tuning. That is your time to beat.' : 'New best time') : `Best: ${formatTime(best)}`;
  buildWinFan($('winFan'));
  fan.classList.add('is-party');
  $('winDlg').showModal();
  play('fanfare');
  navigator.vibrate?.([30, 60, 30, 60, 80]);
  const w = innerWidth;
  [0.2, 0.5, 0.8].forEach((x, k) => setTimeout(() => fx.burst(w * x, innerHeight * 0.55, 34, 1.5), k * 180));
}

function pin(index) {
  state.pinned = index;
  head.pegs.forEach((p, i) => {
    p.classList.toggle('is-locked', i === index);
    p.setAttribute('aria-pressed', String(i === index));
  });
  $('boardTip').textContent = index == null
    ? 'Tap a peg to hear its note and lock on.'
    : 'Locked on. Tap the peg again for auto.';
  state.hold = 0;
  if (index != null) {
    markActive(index, false);
    const s = state.strings[index];
    setReadout('idle', s.label, s.octave, 'Pluck this string', '');
  }
}

// ---------- Pitch handling ----------

const history = [];
let muteUntil = 0;
let lastHeard = 0;
let lastAnalysis = 0;
let outliers = 0;
let candidate = -1;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function goIdle() {
  lightFan(null);
  needleTarget = 0;
  state.hold = Math.max(0, state.hold - 100);
  head.strings.forEach((s) => s.classList.remove('is-ringing'));
  if (state.active >= 0) setRing(state.active, 0);
  if (state.mode === 'chromatic') {
    setReadout('idle', null, null, 'Play any note', '');
    $('chromaHz').textContent = 'Listening';
  } else if (state.pinned != null) {
    setReadout('idle', null, null, 'Pluck this string', '');
  } else {
    setReadout('idle', null, null, state.finished ? 'All strings in tune' : 'Pluck a string', '');
  }
}

function onPitchStrings(freq, dt) {
  const targets = state.strings.map((s) => midiToFreq(s.midi, state.a4));
  let index = state.pinned;
  if (index == null) {
    let nearest = 0;
    let bestDist = Infinity;
    targets.forEach((t, i) => {
      const d = Math.abs(centsBetween(freq, t));
      if (d < bestDist) { bestDist = d; nearest = i; }
    });
    // Do not hop between strings on a single stray reading.
    if (state.active >= 0 && nearest !== state.active && candidate !== nearest) {
      candidate = nearest;
      index = state.active;
    } else {
      candidate = nearest;
      index = nearest;
    }
  }

  let cents = centsBetween(freq, targets[index]);
  if (state.pinned != null && Math.abs(cents) > 600) {
    // A harmonic of the pinned string was picked up; fold it back an octave.
    const folded = cents - 1200 * Math.round(cents / 1200);
    if (Math.abs(folded) < 60) cents = folded;
  }

  if (index !== state.active) {
    if (state.active >= 0) setRing(state.active, 0);
    state.hold = 0;
  }
  markActive(index, true);
  if (state.startedAt == null && !state.finished) state.startedAt = performance.now();

  const good = Math.abs(cents) <= IN_TUNE_CENTS;
  state.hold = good ? state.hold + dt : Math.max(0, state.hold - dt * 2);
  const s = state.strings[index];
  const already = state.tuned[index];
  if (!already) setRing(index, state.hold / HOLD_MS);

  let hint;
  if (good) hint = already ? 'In tune' : 'Hold it there';
  else if (cents < 0) hint = 'Too low, tighten';
  else hint = 'Too high, loosen';
  setReadout(good ? 'good' : cents < 0 ? 'flat' : 'sharp', s.label, s.octave, hint, formatCents(cents));
  lightFan(cents);
  aimNeedle(cents);

  if (good && !already && state.hold >= HOLD_MS) lockString(index);
}

function onPitchChromatic(freq) {
  const note = nearestNote(freq, state.a4);
  const good = Math.abs(note.cents) <= IN_TUNE_CENTS;
  const hint = good ? 'In tune' : note.cents < 0 ? 'Too low' : 'Too high';
  setReadout(good ? 'good' : note.cents < 0 ? 'flat' : 'sharp', note.label, note.octave, hint, formatCents(note.cents));
  lightFan(note.cents);
  aimNeedle(note.cents);
  const pc = ((note.midi % 12) + 12) % 12;
  [...$('chromaNotes').children].forEach((li, i) => li.classList.toggle('is-on', i === pc));
  $('chromaHz').textContent = `${freq.toFixed(1)} Hz`;
}

function analyse(now, dt) {
  let range = { minFreq: 28, maxFreq: 1400 };
  if (state.mode === 'strings') {
    const freqs = state.strings.map((s) => midiToFreq(s.midi, state.a4));
    range = { minFreq: Math.max(26, Math.min(...freqs) * 0.72), maxFreq: Math.max(500, Math.max(...freqs) * 2.2) };
  }
  const result = detectPitch(mic.read(), mic.sampleRate, range);
  const valid = result && result.rms > 0.004 && result.clarity > 0.82;
  if (!valid) {
    if (now - lastHeard > SILENCE_MS && lastHeard !== -1) {
      lastHeard = -1;
      history.length = 0;
      goIdle();
    }
    return;
  }

  if (history.length && Math.abs(centsBetween(result.freq, median(history))) > 80) {
    // A jump: believe it only once it repeats.
    if (++outliers < 2) return;
    history.length = 0;
  }
  outliers = 0;
  history.push(result.freq);
  if (history.length > 5) history.shift();
  lastHeard = now;
  if (history.length < 2) return;

  const freq = median(history);
  if (state.mode === 'strings') onPitchStrings(freq, dt);
  else onPitchChromatic(freq);
}

let shownSecond = -1;
function frame(now) {
  requestAnimationFrame(frame);
  if (mic.ready && now >= muteUntil && now - lastAnalysis >= ANALYSE_EVERY_MS) {
    const dt = Math.min(200, now - lastAnalysis);
    lastAnalysis = now;
    analyse(now, dt);
  }
  if (Math.abs(needleTarget - needleDeg) > 0.05) {
    needleDeg += (needleTarget - needleDeg) * 0.2;
    needle.setAttribute('transform', `rotate(${needleDeg.toFixed(2)} ${FAN.cx} ${FAN.cy})`);
    pupil.setAttribute('cx', (205.5 + (needleDeg / FAN.maxNeedleDeg) * 2.2).toFixed(2));
  }
  if (state.startedAt != null && !state.finished && state.mode === 'strings') {
    const second = Math.floor((now - state.startedAt) / 1000);
    if (second !== shownSecond) {
      shownSecond = second;
      $('timer').textContent = formatTime(now - state.startedAt);
    }
  }
}

// ---------- Tuning + mode ----------

function applyTuning(instrumentId, tuningId) {
  const { instrument, tuning, strings } = findTuning(instrumentId, tuningId);
  state.instrumentId = instrument.id;
  state.tuningId = tuning.id;
  state.strings = strings;
  state.tuningName = tuning.name;
  store.set('instrument', instrument.id);
  store.set('tuning', tuning.id);
  $('tuningInstrument').textContent = instrument.name;
  $('tuningName').textContent = tuning.name;
  head = buildHeadstock($('head'), strings);
  resetGame();
  const first = strings[0];
  setReadout('idle', first.label, first.octave, 'Pluck a string', '');
}

function applyMode(mode) {
  state.mode = mode;
  store.set('mode', mode);
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  const chromatic = mode === 'chromatic';
  $('head').toggleAttribute('hidden', chromatic);
  $('boardTip').toggleAttribute('hidden', chromatic);
  $('hud').toggleAttribute('hidden', chromatic);
  $('chroma').toggleAttribute('hidden', !chromatic);
  history.length = 0;
  if (chromatic) setReadout('idle', 'A', 4, 'Play any note', '');
  else {
    const s = state.strings[Math.max(0, state.active)];
    setReadout('idle', s.label, s.octave, 'Pluck a string', '');
  }
  lightFan(null);
}

function renderTuningDialog(instrumentId = state.instrumentId) {
  const tabs = $('instrumentTabs');
  tabs.replaceChildren(...INSTRUMENTS.map((inst) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.textContent = inst.name;
    b.setAttribute('aria-selected', String(inst.id === instrumentId));
    b.addEventListener('click', () => renderTuningDialog(inst.id));
    return b;
  }));
  const instrument = INSTRUMENTS.find((i) => i.id === instrumentId);
  $('tuningCards').replaceChildren(...instrument.tunings.map((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.style.setProperty('--i', i);
    const selected = instrument.id === state.instrumentId && t.id === state.tuningId;
    b.setAttribute('aria-pressed', String(selected));
    const notes = t.notes.replace(/\d/g, '').replaceAll('#', '♯').replace(/([A-G])b/g, '$1♭');
    b.innerHTML = `<span class="card-mid"><svg class="card-eye" aria-hidden="true"><use href="#eye"/></svg><span class="card-name"></span><span class="card-notes"></span></span>`;
    b.querySelector('.card-name').textContent = t.name;
    b.querySelector('.card-notes').textContent = notes;
    b.addEventListener('click', () => {
      applyTuning(instrument.id, t.id);
      if (state.mode !== 'strings') applyMode('strings');
      $('tuningDlg').close();
    });
    return b;
  }));
}

// ---------- Wiring ----------

function wire() {
  $('chromaNotes').replaceChildren(...SHARP_NAMES.map((n) => Object.assign(document.createElement('li'), { textContent: n })));

  const pressPeg = (target) => {
    const peg = target.closest?.('.peg');
    if (!peg) return;
    const i = Number(peg.dataset.index);
    if (state.pinned === i) {
      pin(null);
      return;
    }
    pin(i);
    play('reference', midiToFreq(state.strings[i].midi, state.a4));
  };
  $('head').addEventListener('click', (e) => pressPeg(e.target));
  $('head').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pressPeg(e.target);
    }
  });

  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => applyMode(b.dataset.mode)));

  $('tuningBtn').addEventListener('click', () => {
    renderTuningDialog();
    $('tuningDlg').showModal();
  });
  $('settingsBtn').addEventListener('click', () => $('settingsDlg').showModal());
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
  });

  const showA4 = () => ($('a4Value').textContent = `${state.a4} Hz`);
  const stepA4 = (d) => {
    state.a4 = Math.max(415, Math.min(466, state.a4 + d));
    store.set('a4', state.a4);
    showA4();
  };
  $('a4Down').addEventListener('click', () => stepA4(-1));
  $('a4Up').addEventListener('click', () => stepA4(1));
  showA4();

  const soundSwitch = $('soundSwitch');
  soundSwitch.setAttribute('aria-checked', String(state.sound));
  soundSwitch.addEventListener('click', () => {
    state.sound = !state.sound;
    store.set('sound', state.sound);
    soundSwitch.setAttribute('aria-checked', String(state.sound));
  });
  $('resetBtn').addEventListener('click', () => {
    resetGame();
    $('settingsDlg').close();
  });

  $('winAgain').addEventListener('click', () => {
    $('winDlg').close();
    resetGame();
  });
  $('winOther').addEventListener('click', () => {
    $('winDlg').close();
    resetGame();
    renderTuningDialog();
    $('tuningDlg').showModal();
  });
  $('winDlg').addEventListener('close', () => fan.classList.remove('is-party'));

  $('startBtn').addEventListener('click', start);
  $('micRetry').addEventListener('click', listen);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      mic.resume();
      keepAwake();
    }
  });
}

let wakeLock = null;
async function keepAwake() {
  try {
    if (mic.analyser && !wakeLock) {
      wakeLock = await navigator.wakeLock?.request('screen');
      wakeLock?.addEventListener('release', () => (wakeLock = null));
    }
  } catch { /* not critical */ }
}

async function listen() {
  $('micError').hidden = true;
  try {
    await mic.start();
    keepAwake();
  } catch (err) {
    const text = {
      NotAllowedError: 'The microphone is blocked. Allow it in your browser settings, then try again.',
      NotFoundError: 'No microphone was found on this device.',
      NotSupportedError: 'This browser cannot open the microphone. Try Safari, Chrome or Firefox over HTTPS.',
    }[err.name] ?? 'The microphone could not be opened. Close other apps using it and try again.';
    $('micErrorText').textContent = text;
    $('micError').hidden = false;
    setReadout('idle', null, null, 'Microphone is off', '');
  }
}

function start() {
  const curtain = $('curtain');
  curtain.classList.add('is-open');
  document.body.classList.remove('is-curtained');
  $('app').inert = false;
  setTimeout(() => curtain.remove(), 1800);
  listen();
}

wire();
applyTuning(state.instrumentId, state.tuningId);
applyMode(state.mode);
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
