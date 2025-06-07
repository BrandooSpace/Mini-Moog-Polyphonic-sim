
import React, { useState, useEffect, useCallback, useReducer, useMemo } from 'react';
import { SynthParams, Waveform, MidiMessage, OscillatorParams, NoiseParams, FilterParams, EnvelopeParams, LFOParams } from './types';
import { INITIAL_SYNTH_PARAMS, OCTAVE_RANGES, WAVEFORM_OPTIONS, MIDI_NOTE_ON, MIDI_NOTE_OFF, MINIMOOG_PANEL_BG, MINIMOOG_KNOB_AREA_BG, MINIMOOG_LABEL_TEXT, MINIMOOG_GROUP_BORDER, FILTER_TYPE_OPTIONS } from './constants';
import Knob from './components/Knob';
import SwitchControl from './components/SwitchControl';
import Section from './components/Section';
import { AudioEngine } from './services/AudioEngine';
import { MidiService } from './services/MidiService';
import { getPatchSuggestion } from './services/GeminiService';

// Reducer for complex state updates
type SynthAction = 
  | { type: 'SET_PARAM'; payload: { path: (string | number)[]; value: any } } // Allow number for array indices
  | { type: 'SET_ALL_PARAMS'; payload: SynthParams };

const synthReducer = (state: SynthParams, action: SynthAction): SynthParams => {
  switch (action.type) {
    case 'SET_PARAM': {
      const { path, value } = action.payload;
      // Deep clone for safety, especially with nested arrays/objects
      let newState = JSON.parse(JSON.stringify(state));
      let currentLevel: any = newState;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!currentLevel[key]) { // Initialize if path doesn't exist
            if (typeof path[i+1] === 'number') {
                currentLevel[key] = [];
            } else {
                currentLevel[key] = {};
            }
        }
        currentLevel = currentLevel[key];
      }
      currentLevel[path[path.length - 1]] = value;
      return newState;
    }
    case 'SET_ALL_PARAMS':
      return action.payload;
    default:
      return state;
  }
};


const App: React.FC = () => {
  const [synthParams, dispatchSynthParams] = useReducer(synthReducer, INITIAL_SYNTH_PARAMS);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [midiService, setMidiService] = useState<MidiService | null>(null);
  const [midiDevices, setMidiDevices] = useState<{ id: string, name: string }[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string | null>(null);
  const [lastPlayedNote, setLastPlayedNote] = useState<string>('--');

  const [geminiQuery, setGeminiQuery] = useState<string>('');
  const [geminiResponse, setGeminiResponse] = useState<string>('');
  const [isGeminiLoading, setIsGeminiLoading] = useState<boolean>(false);
  const [showPatchHelper, setShowPatchHelper] = useState<boolean>(false);


  const handleParamChange = useCallback((path: (string | number)[], value: any) => {
    dispatchSynthParams({ type: 'SET_PARAM', payload: { path, value } });
  }, []);

  useEffect(() => {
    const engine = new AudioEngine(INITIAL_SYNTH_PARAMS); // Initialize with initial params
    setAudioEngine(engine);
    // Apply current synthParams (which might be INITIAL_SYNTH_PARAMS or loaded state)
    engine.updateParams(synthParams); 
    
    return () => {
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initialize AudioEngine once

  useEffect(() => {
    if (audioEngine) {
      audioEngine.updateParams(synthParams);
    }
  }, [synthParams, audioEngine]);

  const handleNoteEvent = useCallback((message: MidiMessage) => {
    if (!audioEngine) return;
    if (audioEngine.getAudioContext().state === 'suspended') {
        audioEngine.getAudioContext().resume().catch(err => console.error("Error resuming AudioContext:", err));
    }
    
    const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][message.note % 12];
    const octave = Math.floor(message.note / 12) - 1;

    if (message.command === MIDI_NOTE_ON) {
      audioEngine.noteOn(message.note, message.velocity);
      setLastPlayedNote(`${noteName}${octave} (Vel: ${message.velocity})`);
    } else if (message.command === MIDI_NOTE_OFF) {
      audioEngine.noteOff(message.note);
      setLastPlayedNote('--');
    }
  }, [audioEngine]);

  const handlePitchBendEvent = useCallback((bendValue: number) => {
    audioEngine?.setPitchBend(bendValue);
  }, [audioEngine]);

  const handleCcEvent = useCallback((control: number, value: number) => {
    // Example: Map CC1 (Mod Wheel) to LFO Pitch Amount or Filter Amount
    if (control === 1) { // CC 1 is often Mod Wheel
        // Determine which LFO destination is more "active" or default to filter
        if(synthParams.lfo.filterAmount > 0 || synthParams.lfo.pitchAmount === 0){
            handleParamChange(['lfo', 'filterAmount'], value / 127);
        } else {
            handleParamChange(['lfo', 'pitchAmount'], value / 127);
        }
    }
    // console.log(`CC: ${control}, Value: ${value}`);
  }, [audioEngine, handleParamChange, synthParams.lfo.filterAmount, synthParams.lfo.pitchAmount]);


  useEffect(() => {
    const service = new MidiService(handleNoteEvent, handlePitchBendEvent, handleCcEvent);
    setMidiService(service);
    service.initialize().then(() => { // Removed `names` as it's not directly used
        const devices = service.getAvailableDevices();
        setMidiDevices(devices);
        // Auto-select logic can be more sophisticated, e.g., remember last selection
        // if (devices.length > 0) {
        //   service.selectDevice(devices[0].id);
        //   setSelectedMidiDevice(devices[0].id);
        // }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleNoteEvent, handlePitchBendEvent, handleCcEvent]); // Initialize MidiService once

  const handleMidiDeviceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = event.target.value;
    if (midiService) {
      const success = midiService.selectDevice(deviceId === "null" ? null : deviceId);
      if (success) {
        setSelectedMidiDevice(deviceId === "null" ? null : deviceId);
      }
    }
  };

  const handleGeminiQuery = async () => {
    if (!geminiQuery.trim()) {
        setGeminiResponse("Please enter a sound description.");
        return;
    }
    setIsGeminiLoading(true);
    setGeminiResponse('');
    try {
        const suggestion = await getPatchSuggestion(geminiQuery);
        setGeminiResponse(suggestion);
    } catch (error) {
        setGeminiResponse("An error occurred. Check console for details.");
        console.error(error);
    }
    setIsGeminiLoading(false);
  };
  
 const OscillatorSection: React.FC<{ oscParams: OscillatorParams; oscIndex: number }> = React.memo(({ oscParams, oscIndex }) => {
    
    // Create stable callbacks for each control to prevent re-renders
    const handleWaveformChange = useCallback((v: Waveform) => handleParamChange(['oscillators', oscIndex, 'waveform'], v), [oscIndex]);
    const handleOctaveChange = useCallback((v: number) => handleParamChange(['oscillators', oscIndex, 'octave'], v), [oscIndex]);
    const handleTuneChange = useCallback((v: number) => handleParamChange(['oscillators', oscIndex, 'tune'], v), [oscIndex]);
    const handleLevelChange = useCallback((v: number) => handleParamChange(['oscillators', oscIndex, 'level'], v), [oscIndex]);
    const handleEnabledChange = useCallback((v: number) => handleParamChange(['oscillators', oscIndex, 'enabled'], v === 1), [oscIndex]);

    return (
        <div className={`p-3 rounded ${MINIMOOG_KNOB_AREA_BG} shadow-inner`}>
            <h4 className="text-sm font-semibold text-amber-200 mb-2">Oscillator {oscIndex + 1}</h4>
            <div className="grid grid-cols-2 gap-3 items-start">
                <SwitchControl
                    label="Wave"
                    options={WAVEFORM_OPTIONS}
                    currentValue={oscParams.waveform}
                    onChange={handleWaveformChange}
                />
                <SwitchControl
                    label="Octave"
                    options={OCTAVE_RANGES}
                    currentValue={oscParams.octave}
                    onChange={handleOctaveChange}
                />
                <Knob label="Tune" value={oscParams.tune} min={-700} max={700} step={1} onChange={handleTuneChange} displayFormatter={v => `${(v/100).toFixed(1)}st`}/>
                <Knob label="Level" value={oscParams.level} min={0} max={1} step={0.01} onChange={handleLevelChange} />
                <div className="col-span-2">
                    <SwitchControl
                        label="Enabled"
                        options={[{label: 'On', value: 1}, {label: 'Off', value: 0}]}
                        currentValue={oscParams.enabled ? 1: 0}
                        onChange={handleEnabledChange}
                    />
                </div>
            </div>
        </div>
    );
});

  const memoizedOscillatorSections = useMemo(() => 
    synthParams.oscillators.map((osc, index) => (
      <OscillatorSection key={osc.id} oscParams={osc} oscIndex={index} />
    ))
  , [synthParams.oscillators]);


  return (
    <div className={`min-h-screen ${MINIMOOG_PANEL_BG} p-4 flex flex-col items-center select-none`}>
      <header className="w-full max-w-7xl mb-4 text-center">
        <h1 className="text-4xl font-bold text-amber-400 tracking-tight">Web Minimoog Synth</h1>
        <p className="text-slate-300">Inspired by the classic. Use a MIDI keyboard or click keys.</p>
      </header>

      <div className={`w-full max-w-7xl p-2 md:p-4 rounded-lg shadow-2xl border-2 ${MINIMOOG_GROUP_BORDER} bg-slate-800`}>
        {/* MIDI and Global Controls */}
        <Section title="Controls & Status" className="mb-4">
            <div className="flex flex-col space-y-1">
                <label htmlFor="midiDevice" className={`${MINIMOOG_LABEL_TEXT}`}>MIDI Input:</label>
                <select id="midiDevice" value={selectedMidiDevice || "null"} onChange={handleMidiDeviceChange} className="bg-gray-700 text-gray-200 border border-gray-600 rounded px-2 py-1 text-sm focus:ring-amber-500 focus:border-amber-500">
                <option value="null">-- Select MIDI Device --</option>
                {midiDevices.map(device => (
                    <option key={device.id} value={device.id}>{device.name}</option>
                ))}
                </select>
            </div>
            <div className="flex flex-col items-center">
                <p className={`${MINIMOOG_LABEL_TEXT}`}>Last Note:</p>
                <p className="text-amber-300 font-mono text-lg">{lastPlayedNote}</p>
            </div>
            <Knob label="Master Vol" value={synthParams.masterVolume} min={0} max={1} step={0.01} onChange={v => handleParamChange(['masterVolume'], v)} />
            <Knob label="Glide" value={synthParams.glide} min={0} max={1} step={0.01} onChange={v => handleParamChange(['glide'], v)} displayFormatter={v => `${v.toFixed(2)}s`} />
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Oscillators */}
            {memoizedOscillatorSections}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Mixer & Noise */}
            <Section title="Mixer & Noise">
                {/* Mixer levels are part of oscillator params. Noise is separate. */}
                <SwitchControl label="Noise Type" options={[{label: 'White', value: 'white'}, {label: 'Pink', value: 'pink'}]} currentValue={synthParams.noise.type} onChange={v => handleParamChange(['noise', 'type'], v)} />
                <Knob label="Noise Lvl" value={synthParams.noise.level} min={0} max={1} step={0.01} onChange={v => handleParamChange(['noise', 'level'], v)} />
                 <SwitchControl
                    label="Noise Enabled"
                    options={[{label: 'On', value: 1}, {label: 'Off', value: 0}]}
                    currentValue={synthParams.noise.enabled ? 1: 0}
                    onChange={(v) => handleParamChange(['noise', 'enabled'], v === 1)}
                />
            </Section>

            {/* LFO */}
            <Section title="LFO">
                <SwitchControl label="LFO Wave" options={WAVEFORM_OPTIONS} currentValue={synthParams.lfo.waveform} onChange={v => handleParamChange(['lfo', 'waveform'], v)} />
                <Knob label="LFO Rate" value={synthParams.lfo.rate} min={0.1} max={30} step={0.1} onChange={v => handleParamChange(['lfo', 'rate'], v)} displayFormatter={v => `${v.toFixed(1)}Hz`} />
                <Knob label="Pitch Mod" value={synthParams.lfo.pitchAmount} min={0} max={1} step={0.01} onChange={v => handleParamChange(['lfo', 'pitchAmount'], v)} />
                <Knob label="Filter Mod" value={synthParams.lfo.filterAmount} min={0} max={1} step={0.01} onChange={v => handleParamChange(['lfo', 'filterAmount'], v)} />
                <SwitchControl
                    label="LFO Enabled"
                    options={[{label: 'On', value: 1}, {label: 'Off', value: 0}]}
                    currentValue={synthParams.lfo.enabled ? 1: 0}
                    onChange={(v) => handleParamChange(['lfo', 'enabled'], v === 1)}
                />
            </Section>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Filter */}
            <Section title="Filter" className="md:col-span-1">
                <SwitchControl label="Type" options={FILTER_TYPE_OPTIONS} currentValue={synthParams.filter.type} onChange={v => handleParamChange(['filter', 'type'], v)} />
                <Knob label="Cutoff" value={synthParams.filter.cutoff} min={20} max={15000} step={1} onChange={v => handleParamChange(['filter', 'cutoff'], v)} displayFormatter={v => `${Math.round(v)}Hz`} />
                <Knob label="Resonance" value={synthParams.filter.resonance} min={0} max={30} step={0.1} onChange={v => handleParamChange(['filter', 'resonance'], v)} />
                <Knob label="Env Amt" value={synthParams.filter.envelopeAmount} min={-1} max={1} step={0.01} onChange={v => handleParamChange(['filter', 'envelopeAmount'], v)} />
                <Knob label="KB Track" value={synthParams.filter.keyboardTracking} min={0} max={1} step={0.01} onChange={v => handleParamChange(['filter', 'keyboardTracking'], v)} displayFormatter={v => `${Math.round(v*100)}%`} />
            </Section>

            {/* Envelopes */}
            <Section title="Filter Env (ADSR)" className="md:col-span-1">
                <Knob label="Attack" value={synthParams.filterEnvelope.attack} min={0.001} max={5} step={0.001} onChange={v => handleParamChange(['filterEnvelope', 'attack'], v)} displayFormatter={v => `${v.toFixed(3)}s`} />
                <Knob label="Decay" value={synthParams.filterEnvelope.decay} min={0.001} max={5} step={0.001} onChange={v => handleParamChange(['filterEnvelope', 'decay'], v)} displayFormatter={v => `${v.toFixed(3)}s`} />
                <Knob label="Sustain" value={synthParams.filterEnvelope.sustain} min={0} max={1} step={0.01} onChange={v => handleParamChange(['filterEnvelope', 'sustain'], v)} />
                <Knob label="Release" value={synthParams.filterEnvelope.release} min={0.001} max={5} step={0.001} onChange={v => handleParamChange(['filterEnvelope', 'release'], v)} displayFormatter={v => `${v.toFixed(3)}s`} />
            </Section>
            <Section title="Amp Env (ADSR)" className="md:col-span-1">
                <Knob label="Attack" value={synthParams.ampEnvelope.attack} min={0.001} max={5} step={0.001} onChange={v => handleParamChange(['ampEnvelope', 'attack'], v)} displayFormatter={v => `${v.toFixed(3)}s`} />
                <Knob label="Decay" value={synthParams.ampEnvelope.decay} min={0.001} max={5} step={0.001} onChange={v => handleParamChange(['ampEnvelope', 'decay'], v)} displayFormatter={v => `${v.toFixed(3)}s`} />
                <Knob label="Sustain" value={synthParams.ampEnvelope.sustain} min={0} max={1} step={0.01} onChange={v => handleParamChange(['ampEnvelope', 'sustain'], v)} />
                <Knob label="Release" value={synthParams.ampEnvelope.release} min={0.001} max={5} step={0.001} onChange={v => handleParamChange(['ampEnvelope', 'release'], v)} displayFormatter={v => `${v.toFixed(3)}s`} />
            </Section>
        </div>

        {/* Gemini Patch Helper */}
        <div className="mt-6">
            <button 
                onClick={() => setShowPatchHelper(!showPatchHelper)}
                className="w-full text-left px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-t-md text-amber-300 font-semibold transition-colors"
            >
                {showPatchHelper ? 'Hide' : 'Show'} Gemini Patch Helper
            </button>
            {showPatchHelper && (
                <div className={`p-4 rounded-b-md shadow-lg border border-t-0 ${MINIMOOG_GROUP_BORDER} ${MINIMOOG_PANEL_BG}`}>
                    <p className="text-sm text-slate-300 mb-2">Describe a sound (e.g., "warm bass", "sci-fi lead", "percussive pluck") and Gemini will suggest patch settings.</p>
                    <textarea
                        value={geminiQuery}
                        onChange={(e) => setGeminiQuery(e.target.value)}
                        placeholder="e.g., A resonant sweeping pad sound"
                        className="w-full p-2 rounded bg-slate-800 border border-slate-600 text-gray-200 focus:ring-amber-500 focus:border-amber-500 mb-2 h-20"
                    />
                    <button
                        onClick={handleGeminiQuery}
                        disabled={isGeminiLoading || !process.env.API_KEY}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold rounded disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                    >
                        {isGeminiLoading ? 'Thinking...' : 'Get Patch Idea'}
                    </button>
                    {!process.env.API_KEY && <p className="text-xs text-red-400 mt-1">Gemini API key (process.env.API_KEY) is not set. Feature disabled.</p>}
                    {geminiResponse && (
                        <div className="mt-4 p-3 bg-slate-800 border border-slate-600 rounded">
                            <h4 className="font-semibold text-amber-200 mb-1">Gemini Suggests:</h4>
                            <pre className="whitespace-pre-wrap text-sm text-gray-300">{geminiResponse}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>

      </div>
      <footer className="mt-8 text-center text-xs text-slate-500">
        <p>This is a simplified synthesizer inspired by classic analog synths. Sound generation uses the Web Audio API.</p>
        <p>Gemini Patch Helper uses Google Gemini API. API key must be configured in environment variables.</p>
      </footer>
    </div>
  );
};

export default App;
