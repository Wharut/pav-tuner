// Pitch detection: YIN (de Cheveigne & Kawahara, 2002) with parabolic interpolation.
// Pure function, no Web Audio dependency, so it runs in Node tests too.

let scratch = new Float32Array(0);
let half = new Float32Array(0);

function decimate(buf) {
  const n = buf.length >> 1;
  if (half.length !== n) half = new Float32Array(n);
  for (let i = 0; i < n; i++) half[i] = (buf[2 * i] + buf[2 * i + 1]) * 0.5;
  return half;
}

/**
 * @param {Float32Array} input time-domain samples (8192 recommended)
 * @param {number} sampleRate
 * @param {{minFreq?:number,maxFreq?:number,threshold?:number}} [opts]
 * @returns {{freq:number, clarity:number, rms:number}|null}
 */
export function detectPitch(input, sampleRate, opts = {}) {
  const minFreq = opts.minFreq ?? 30;
  const maxFreq = opts.maxFreq ?? 1400;
  const threshold = opts.threshold ?? 0.15;

  let buf = input;
  let sr = sampleRate;
  // One halving is enough for 44.1/48 kHz input and keeps the work per frame small.
  if (sr > 30000 && buf.length >= 4096) {
    buf = decimate(buf);
    sr /= 2;
  }
  const n = buf.length;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] - mean;
    energy += v * v;
  }
  const rms = Math.sqrt(energy / n);
  if (rms < 1e-4) return null;

  const tauMax = Math.min(Math.floor(sr / minFreq), (n >> 1) - 1);
  const tauMin = Math.max(2, Math.floor(sr / maxFreq));
  const w = n - tauMax;
  if (scratch.length < tauMax + 2) scratch = new Float32Array(tauMax + 2);
  const d = scratch;

  // Difference function, then cumulative mean normalised difference.
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < w; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  let best = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 < tauMax && d[tau + 1] < d[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best === -1) {
    let min = Infinity;
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (d[tau] < min) {
        min = d[tau];
        best = tau;
      }
    }
    if (min > 0.3) return null;
  }

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  let tau = best;
  if (best > 1 && best < tauMax - 1) {
    const a = d[best - 1];
    const b = d[best];
    const c = d[best + 1];
    const denom = a + c - 2 * b;
    if (denom !== 0) tau = best + (a - c) / (2 * denom);
  }
  return { freq: sr / tau, clarity: 1 - d[best], rms };
}
