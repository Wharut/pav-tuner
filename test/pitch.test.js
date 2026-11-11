import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from '../public/js/pitch.js';
import { INSTRUMENTS, parseNote, midiToFreq, centsBetween, nearestNote } from '../public/js/tunings.js';

// A plucked-string-like tone: decaying harmonics, weak fundamental, a little noise.
function pluck(freq, sampleRate, n = 8192, { weakFundamental = false, noise = 0.01 } = {}) {
  const out = new Float32Array(n);
  const amps = weakFundamental ? [0.15, 1, 0.7, 0.4, 0.2] : [1, 0.6, 0.4, 0.25, 0.1];
  let seed = 42;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    amps.forEach((a, h) => (v += a * Math.sin(2 * Math.PI * freq * (h + 1) * t + h)));
    out[i] = 0.2 * v * Math.exp(-1.5 * t) + noise * rand();
  }
  return out;
}

test('every string of every tuning is detected within 2 cents', () => {
  for (const sampleRate of [44100, 48000]) {
    for (const instrument of INSTRUMENTS) {
      for (const tuning of instrument.tunings) {
        for (const name of tuning.notes.split(' ')) {
          const target = midiToFreq(parseNote(name).midi);
          for (const detune of [-30, 0, 12]) {
            const freq = target * 2 ** (detune / 1200);
            const res = detectPitch(pluck(freq, sampleRate), sampleRate);
            assert.ok(res, `${instrument.id}/${tuning.id}/${name} not detected`);
            const err = Math.abs(centsBetween(res.freq, freq));
            assert.ok(err < 2, `${name} @${sampleRate}: off by ${err.toFixed(2)} cents`);
          }
        }
      }
    }
  }
});

test('weak fundamental (small laptop/phone mics) still resolves to the fundamental', () => {
  for (const name of ['E2', 'A2', 'D2', 'C2', 'E1']) {
    const freq = midiToFreq(parseNote(name).midi);
    const res = detectPitch(pluck(freq, 48000, 8192, { weakFundamental: true }), 48000);
    assert.ok(res, `${name} not detected`);
    assert.ok(Math.abs(centsBetween(res.freq, freq)) < 3, `${name} resolved to ${res.freq}`);
  }
});

test('silence and noise return null', () => {
  assert.equal(detectPitch(new Float32Array(8192), 48000), null);
  const noise = new Float32Array(8192).map(() => Math.random() * 0.2 - 0.1);
  assert.equal(detectPitch(noise, 48000), null);
});

test('note helpers', () => {
  assert.equal(parseNote('A4').midi, 69);
  assert.equal(parseNote('Eb2').midi, 39);
  assert.equal(parseNote('C#2').label, 'C♯');
  assert.ok(Math.abs(midiToFreq(parseNote('E2').midi) - 82.407) < 0.01);
  const n = nearestNote(446);
  assert.equal(n.label, 'A');
  assert.equal(n.octave, 4);
  assert.ok(n.cents > 20 && n.cents < 26);
});
