// Tunings are listed from the lowest-pitched string to the highest.
// Adding one is a one-line change: { id, name, notes }.

export const INSTRUMENTS = [
  {
    id: 'guitar',
    name: 'Guitar',
    tunings: [
      { id: 'standard', name: 'Standard', notes: 'E2 A2 D3 G3 B3 E4' },
      { id: 'drop-d', name: 'Drop D', notes: 'D2 A2 D3 G3 B3 E4' },
      { id: 'half-down', name: 'Half Step Down', notes: 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4' },
      { id: 'd-standard', name: 'D Standard', notes: 'D2 G2 C3 F3 A3 D4' },
      { id: 'drop-c-sharp', name: 'Drop C#', notes: 'C#2 G#2 C#3 F#3 A#3 D#4' },
      { id: 'drop-c', name: 'Drop C', notes: 'C2 G2 C3 F3 A3 D4' },
      { id: 'drop-b', name: 'Drop B', notes: 'B1 F#2 B2 E3 G#3 C#4' },
      { id: 'double-drop-d', name: 'Double Drop D', notes: 'D2 A2 D3 G3 B3 D4' },
      { id: 'dadgad', name: 'DADGAD', notes: 'D2 A2 D3 G3 A3 D4' },
      { id: 'open-g', name: 'Open G', notes: 'D2 G2 D3 G3 B3 D4' },
      { id: 'open-d', name: 'Open D', notes: 'D2 A2 D3 F#3 A3 D4' },
      { id: 'open-e', name: 'Open E', notes: 'E2 B2 E3 G#3 B3 E4' },
      { id: 'open-c', name: 'Open C', notes: 'C2 G2 C3 G3 C4 E4' },
      { id: 'open-a', name: 'Open A', notes: 'E2 A2 E3 A3 C#4 E4' },
    ],
  },
  {
    id: 'bass',
    name: 'Bass',
    tunings: [
      { id: 'standard', name: 'Standard', notes: 'E1 A1 D2 G2' },
      { id: 'drop-d', name: 'Drop D', notes: 'D1 A1 D2 G2' },
      { id: 'half-down', name: 'Half Step Down', notes: 'Eb1 Ab1 Db2 Gb2' },
      { id: 'd-standard', name: 'D Standard', notes: 'D1 G1 C2 F2' },
    ],
  },
  {
    id: 'ukulele',
    name: 'Ukulele',
    tunings: [
      { id: 'standard', name: 'Standard', notes: 'G4 C4 E4 A4' },
      { id: 'low-g', name: 'Low G', notes: 'G3 C4 E4 A4' },
      { id: 'baritone', name: 'Baritone', notes: 'D3 G3 B3 E4' },
    ],
  },
];

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** "F#3" or "Eb2" -> { midi, label, octave } */
export function parseNote(str) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(str);
  if (!m) throw new Error(`Bad note: ${str}`);
  const [, letter, acc, oct] = m;
  const octave = Number(oct);
  const midi = 12 * (octave + 1) + SEMITONE[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
  const label = letter + (acc === '#' ? '♯' : acc === 'b' ? '♭' : '');
  return { midi, label, octave };
}

export const midiToFreq = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

/** Signed distance in cents from `ref` to `freq`. */
export const centsBetween = (freq, ref) => 1200 * Math.log2(freq / ref);

/** Nearest equal-tempered note to a frequency. */
export function nearestNote(freq, a4 = 440) {
  const exact = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(exact);
  return {
    midi,
    label: SHARP_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: (exact - midi) * 100,
    freq: midiToFreq(midi, a4),
  };
}

export function findTuning(instrumentId, tuningId) {
  const instrument = INSTRUMENTS.find((i) => i.id === instrumentId) ?? INSTRUMENTS[0];
  const tuning = instrument.tunings.find((t) => t.id === tuningId) ?? instrument.tunings[0];
  return { instrument, tuning, strings: tuning.notes.split(' ').map(parseNote) };
}

export { SHARP_NAMES };
