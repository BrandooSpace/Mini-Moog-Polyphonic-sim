
export enum Waveform {
  SINE = 'sine',
  SQUARE = 'square',
  SAWTOOTH = 'sawtooth',
  TRIANGLE = 'triangle',
}

export interface OscillatorParams {
  id: string;
  waveform: Waveform;
  octave: number; // e.g., -2, -1, 0, 1, 2 representing 32', 16', 8', 4', 2' relative to a base
  tune: number; // Fine-tune in cents or semitones
  level: number; // 0-1
  enabled: boolean;
}

export interface EnvelopeParams {
  attack: number; // seconds
  decay: number; // seconds
  sustain: number; // 0-1 level
  release: number; // seconds
}

export interface FilterParams {
  cutoff: number; // Hz
  resonance: number; // Q factor
  envelopeAmount: number; // 0-1
  keyboardTracking: number; // 0-1 (0%, 50%, 100%)
  type: BiquadFilterType; // 'lowpass', 'highpass', etc.
}

export interface NoiseParams {
  type: 'white' | 'pink';
  level: number; // 0-1
  enabled: boolean;
}

export interface LFOParams {
  waveform: Waveform;
  rate: number; // Hz
  pitchAmount: number; // 0-1, modulation depth to oscillator pitch
  filterAmount: number; // 0-1, modulation depth to filter cutoff
  enabled: boolean;
}

export interface SynthParams {
  masterVolume: number; // 0-1
  glide: number; // seconds
  oscillators: OscillatorParams[];
  noise: NoiseParams;
  filter: FilterParams;
  ampEnvelope: EnvelopeParams;
  filterEnvelope: EnvelopeParams;
  lfo: LFOParams;
}

export interface MidiMessage {
  command: number;
  note: number;
  velocity: number;
}

// Updated PolyVoice interface in AudioEngine.ts will use this definition implicitly
// For types.ts, if PolyVoice were defined here, change would be:
// scheduledStopTimeouts: number[];
