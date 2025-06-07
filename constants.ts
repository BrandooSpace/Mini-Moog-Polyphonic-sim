
import { SynthParams, Waveform } from './types';

export const MIDI_NOTE_ON = 0x90;
export const MIDI_NOTE_OFF = 0x80;
export const MIDI_PITCH_BEND = 0xE0;
export const MIDI_CC = 0xB0;

export const OCTAVE_RANGES = [
  { label: "32'", value: -2 },
  { label: "16'", value: -1 },
  { label: "8'", value: 0 },
  { label: "4'", value: 1 },
  { label: "2'", value: 2 },
];

export const WAVEFORM_OPTIONS = [
  { label: 'Sine', value: Waveform.SINE },
  { label: 'Square', value: Waveform.SQUARE },
  { label: 'Sawtooth', value: Waveform.SAWTOOTH },
  { label: 'Triangle', value: Waveform.TRIANGLE },
];

export const FILTER_TYPE_OPTIONS: {label: string, value: BiquadFilterType}[] = [
    { label: 'LP', value: 'lowpass' },
    { label: 'HP', value: 'highpass' },
    { label: 'BP', value: 'bandpass' },
];

export const INITIAL_SYNTH_PARAMS: SynthParams = {
  masterVolume: 0.7,
  glide: 0.05,
  oscillators: [
    { id: 'osc1', waveform: Waveform.SAWTOOTH, octave: 0, tune: 0, level: 0.8, enabled: true },
    { id: 'osc2', waveform: Waveform.SQUARE, octave: 0, tune: 0.01, level: 0.6, enabled: true }, // Slight detune
    { id: 'osc3', waveform: Waveform.SAWTOOTH, octave: -1, tune: 0, level: 0.0, enabled: false }, // Off by default
  ],
  noise: {
    type: 'white',
    level: 0.0,
    enabled: false,
  },
  filter: {
    cutoff: 5000,
    resonance: 1,
    envelopeAmount: 0.5,
    keyboardTracking: 0.5, // 50%
    type: 'lowpass',
  },
  ampEnvelope: {
    attack: 0.01,
    decay: 0.3,
    sustain: 0.8,
    release: 0.5,
  },
  filterEnvelope: {
    attack: 0.05,
    decay: 0.2,
    sustain: 0.5,
    release: 0.4,
  },
  lfo: {
    waveform: Waveform.TRIANGLE,
    rate: 5, // 5 Hz
    pitchAmount: 0,
    filterAmount: 0,
    enabled: false,
  }
};

export const MINIMOOG_PANEL_BG = 'bg-slate-700'; // Inspired by wood/dark panel
export const MINIMOOG_LABEL_TEXT = 'text-xs text-amber-100 uppercase font-mono tracking-wider';
export const MINIMOOG_KNOB_AREA_BG = 'bg-slate-800';
export const MINIMOOG_GROUP_BORDER = 'border-slate-600';

export const GEMINI_MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
