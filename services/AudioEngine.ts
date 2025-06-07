
import { SynthParams, OscillatorParams, Waveform, EnvelopeParams, FilterParams, NoiseParams, LFOParams } from '../types';

interface PolyVoice {
  id: number; 
  note: number | null;
  velocity: number; 
  isActive: boolean; 
  isReleasing: boolean; 
  startTime: number; 

  oscillators: {
    oscNode: OscillatorNode;
    gainNode: GainNode; 
  }[];
  
  noiseNode?: AudioBufferSourceNode;
  noiseGainNode?: GainNode;         

  filterNode: BiquadFilterNode;
  vcaNode: GainNode; 

  scheduledStopTimeouts: number[]; // Corrected type from NodeJS.Timeout to number
}

const MAX_POLYPHONY = 8;

export class AudioEngine {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  
  private lfoOscNode?: OscillatorNode;
  private lfoGainPitchNode?: GainNode; 
  private lfoGainFilterNode?: GainNode;

  private whiteNoiseBuffer?: AudioBuffer;
  private pinkNoiseBuffer?: AudioBuffer;

  private voices: PolyVoice[] = [];
  
  private currentParams: SynthParams;
  private pitchBendMultiplier: number = 1.0;

  constructor(initialParams: SynthParams) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    
    this.currentParams = JSON.parse(JSON.stringify(initialParams)); 

    this.preloadNoiseBuffers(); 

    for (let i = 0; i < MAX_POLYPHONY; i++) {
      const filterNode = this.audioContext.createBiquadFilter();
      const vcaNode = this.audioContext.createGain();
      vcaNode.gain.value = 0; 

      filterNode.connect(vcaNode);
      vcaNode.connect(this.masterGain);

      this.voices.push({
        id: i,
        note: null,
        velocity: 0,
        isActive: false,
        isReleasing: false,
        startTime: 0,
        oscillators: [],
        filterNode: filterNode,
        vcaNode: vcaNode,
        scheduledStopTimeouts: [],
      });
    }
    
    this.applyParamsToEngineGlobally(this.currentParams); 
  }

  private preloadNoiseBuffers() {
    const bufferSize = this.audioContext.sampleRate * 1; 
    this.whiteNoiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const whiteOutput = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      whiteOutput[i] = Math.random() * 2 - 1;
    }

    this.pinkNoiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const pinkOutput = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkOutput[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      pinkOutput[i] *= 0.11; 
      b6 = white * 0.115926;
    }
  }

  private applyParamsToEngineGlobally(params: SynthParams) {
    const now = this.audioContext.currentTime;
    this.masterGain.gain.setValueAtTime(params.masterVolume, now);

    if (params.lfo.enabled) {
      if (!this.lfoOscNode || this.lfoOscNode.type !== params.lfo.waveform || this.lfoOscNode.frequency.value !== params.lfo.rate) {
        this.setupLFO(params.lfo); 
      }
      if (this.lfoGainPitchNode) this.lfoGainPitchNode.gain.setValueAtTime(params.lfo.pitchAmount * 100, now); 
      if (this.lfoGainFilterNode) this.lfoGainFilterNode.gain.setValueAtTime(params.lfo.filterAmount * 1000, now);
    } else if (this.lfoOscNode) {
      this.teardownLFO();
    }
  }

  private setupLFO(lfoParams: LFOParams) {
    this.teardownLFO(); 

    if (!lfoParams.enabled) return;

    this.lfoOscNode = this.audioContext.createOscillator();
    this.lfoOscNode.type = lfoParams.waveform;
    this.lfoOscNode.frequency.setValueAtTime(lfoParams.rate, this.audioContext.currentTime);
    
    this.lfoGainPitchNode = this.audioContext.createGain();
    this.lfoGainPitchNode.gain.setValueAtTime(lfoParams.pitchAmount * 100, this.audioContext.currentTime);

    this.lfoGainFilterNode = this.audioContext.createGain();
    this.lfoGainFilterNode.gain.setValueAtTime(lfoParams.filterAmount * 1000, this.audioContext.currentTime);

    if(this.lfoOscNode){
        this.lfoOscNode.connect(this.lfoGainPitchNode);
        this.lfoOscNode.connect(this.lfoGainFilterNode);
        this.lfoOscNode.start();
    }
    this.voices.forEach(voice => {
        if (voice.isActive && !voice.isReleasing) {
            this.connectLFOToVoice(voice);
        }
    });
  }

  private teardownLFO() {
    if (this.lfoOscNode) {
      try { this.lfoOscNode.stop(); } catch (e) {}
      this.lfoOscNode.disconnect();
      this.lfoOscNode = undefined;
    }
    if (this.lfoGainPitchNode) {
      this.lfoGainPitchNode.disconnect();
      this.lfoGainPitchNode = undefined;
    }
    if (this.lfoGainFilterNode) {
      this.lfoGainFilterNode.disconnect();
      this.lfoGainFilterNode = undefined;
    }
    this.voices.forEach(voice => this.disconnectLFOFromVoice(voice));
  }
  
  private connectLFOToVoice(voice: PolyVoice) {
    if (!this.currentParams.lfo.enabled) return;

    voice.oscillators.forEach(osc => {
        if (this.lfoGainPitchNode && this.currentParams.lfo.pitchAmount > 0) {
            try { this.lfoGainPitchNode.connect(osc.oscNode.detune); } catch(e) { /* console.warn("LFO Pitch connect failed", e) */ }
        }
    });
    if (this.lfoGainFilterNode && this.currentParams.lfo.filterAmount > 0) {
         try { this.lfoGainFilterNode.connect(voice.filterNode.frequency); } catch(e) { /* console.warn("LFO Filter connect failed", e) */ }
    }
  }

  private disconnectLFOFromVoice(voice: PolyVoice) {
    if (this.lfoGainPitchNode) {
        voice.oscillators.forEach(osc => {
            try { this.lfoGainPitchNode!.disconnect(osc.oscNode.detune); } catch(e) {}
        });
    }
    if (this.lfoGainFilterNode) {
         try { this.lfoGainFilterNode!.disconnect(voice.filterNode.frequency); } catch(e) {}
    }
  }

  private midiNoteToFrequency(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  private applyEnvelope(
    param: AudioParam, 
    envelope: EnvelopeParams, 
    baseValue: number,
    peakValue: number, 
    sustainLevelProportion: number
  ) {
    const now = this.audioContext.currentTime;
    param.cancelScheduledValues(now);
    // Explicitly set the starting point of the envelope.
    // For VCA, baseValue is 0. For Filter, it's the calculated filterBaseCutoff.
    param.setValueAtTime(baseValue, now);
    param.linearRampToValueAtTime(peakValue, now + Math.max(0.001, envelope.attack)); 
    param.linearRampToValueAtTime(sustainLevelProportion * peakValue, now + Math.max(0.001, envelope.attack) + Math.max(0.001, envelope.decay));
  }

  private releaseEnvelope(param: AudioParam, releaseTime: number, targetValue: number = 0) {
    const now = this.audioContext.currentTime;
    param.cancelScheduledValues(now);
    // Set current value at "now" to ensure smooth transition if already mid-envelope.
    // Then ramp to target. If it was already at target (e.g. sustain 0), it holds.
    param.setValueAtTime(param.value, now); 
    param.linearRampToValueAtTime(targetValue, now + Math.max(0.001, releaseTime));
  }
  
  private findVoiceForNoteOn(note: number): PolyVoice | null {
    if (this.voices.length === 0) {
        console.error("AudioEngine: No voices available in the pool.");
        return null;
    }

    // 1. Retrigger same note if already playing/releasing
    const retriggerVoice = this.voices.find(v => v.note === note && (v.isActive || v.isReleasing));
    if (retriggerVoice) {
        this.stopVoice(retriggerVoice, true); // Hard stop the old instance of this note
        return retriggerVoice;
    }

    // 2. Find a completely free voice (not active, not releasing)
    const freeVoice = this.voices.find(v => !v.isActive && !v.isReleasing);
    if (freeVoice) {
        return freeVoice;
    }

    // 3. Steal a voice. No free voices left.
    let candidatesForStealing: PolyVoice[];

    //    a. Prefer to steal the oldest voice that is *only* in its release phase (isActive=false, isReleasing=true).
    candidatesForStealing = this.voices.filter(v => v.isReleasing && !v.isActive);
    if (candidatesForStealing.length > 0) {
        candidatesForStealing.sort((a, b) => a.startTime - b.startTime); // Smallest startTime is oldest
        const voiceToSteal = candidatesForStealing[0];
        this.stopVoice(voiceToSteal, true);
        return voiceToSteal;
    }

    //    b. If no "only releasing" voices, steal the oldest actively sounding voice (isActive=true, isReleasing=false).
    candidatesForStealing = this.voices.filter(v => v.isActive && !v.isReleasing);
    if (candidatesForStealing.length > 0) {
        candidatesForStealing.sort((a, b) => a.startTime - b.startTime);
        const voiceToSteal = candidatesForStealing[0];
        this.stopVoice(voiceToSteal, true);
        return voiceToSteal;
    }
    
    //    c. Fallback: If all voices are in an unusual state (e.g., all isActive=true AND isReleasing=true, or some other combination),
    //       or if MAX_POLYPHONY is very low. This should be rare. Steal the overall oldest voice by startTime from the entire pool.
    //       (Excludes truly free voices, as step 2 should have caught them).
    if (this.voices.length > 0) { // Should always be true if we passed the initial check
        console.warn("AudioEngine: findVoiceForNoteOn using fallback stealing logic (overall oldest from non-free).");
        // Consider all voices that are not free (as free ones covered by step 2)
        const nonFreeVoices = this.voices.filter(v => v.isActive || v.isReleasing);
        if (nonFreeVoices.length > 0) {
            nonFreeVoices.sort((a, b) => a.startTime - b.startTime);
            const voiceToSteal = nonFreeVoices[0];
            this.stopVoice(voiceToSteal, true);
            return voiceToSteal;
        }
    }

    console.error("AudioEngine: CRITICAL - Could not find any voice to use or steal. This should not happen.");
    return null; // Should be unreachable if MAX_POLYPHONY > 0
  }

  public noteOn(note: number, velocity: number) {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error("Error resuming AudioContext:", err));
    }
    
    const voice = this.findVoiceForNoteOn(note);
    if (!voice) {
        console.warn(`AudioEngine: No voice available for note ${note}. Note will not play.`);
        return; 
    }

    const now = this.audioContext.currentTime;

    voice.note = note;
    voice.velocity = velocity;
    voice.isActive = true;
    voice.isReleasing = false;
    voice.startTime = now;
    voice.scheduledStopTimeouts.forEach(clearTimeout);
    voice.scheduledStopTimeouts = [];

    voice.oscillators = []; 
    this.currentParams.oscillators.forEach(oscParam => {
      if (!oscParam.enabled || oscParam.level === 0) return;

      const oscNode = this.audioContext.createOscillator();
      const baseFrequency = this.midiNoteToFrequency(note + oscParam.octave * 12);
      const tunedFrequency = baseFrequency * Math.pow(2, oscParam.tune / 1200);
      
      oscNode.type = oscParam.waveform;
      
      // Glide logic is very basic for polyphony; mostly new notes start at target pitch.
      oscNode.frequency.setValueAtTime(tunedFrequency * this.pitchBendMultiplier, now);
      
      const gainNode = this.audioContext.createGain();
      gainNode.gain.setValueAtTime(oscParam.level, now); 
      
      oscNode.connect(gainNode);
      gainNode.connect(voice.filterNode); 

      oscNode.start(now);
      voice.oscillators.push({ oscNode, gainNode });
    });

    if (this.currentParams.noise.enabled && this.currentParams.noise.level > 0) {
        if(voice.noiseGainNode) voice.noiseGainNode.disconnect();
        if(voice.noiseNode) { try {voice.noiseNode.stop();} catch(e){} voice.noiseNode.disconnect(); }

        voice.noiseGainNode = this.audioContext.createGain();
        voice.noiseGainNode.gain.setValueAtTime(this.currentParams.noise.level, now);

        voice.noiseNode = this.audioContext.createBufferSource();
        voice.noiseNode.buffer = this.currentParams.noise.type === 'pink' ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;
        voice.noiseNode.loop = true;
        
        voice.noiseNode.connect(voice.noiseGainNode);
        voice.noiseGainNode.connect(voice.filterNode); 
        voice.noiseNode.start(now);
    } else { 
        if(voice.noiseGainNode) { voice.noiseGainNode.gain.setValueAtTime(0, now); }
        if(voice.noiseNode) { try {voice.noiseNode.stop(now + 0.01); /* schedule stop slightly ahead */} catch(e){} voice.noiseNode.disconnect(); voice.noiseNode = undefined;}
    }

    voice.filterNode.type = this.currentParams.filter.type;
    voice.filterNode.Q.setValueAtTime(this.currentParams.filter.resonance, now);

    let filterBaseCutoff = this.currentParams.filter.cutoff;
    if (this.currentParams.filter.keyboardTracking > 0) {
      const noteDelta = note - 60; 
      filterBaseCutoff += noteDelta * (this.currentParams.filter.keyboardTracking * 20); // Adjust sensitivity if needed
      filterBaseCutoff = Math.max(20, Math.min(this.audioContext.sampleRate / 2, filterBaseCutoff));
    }
    
    const ampEnvPeak = 1.0 * (velocity / 127); 
    this.applyEnvelope(
      voice.vcaNode.gain,
      this.currentParams.ampEnvelope,
      0, 
      ampEnvPeak,
      this.currentParams.ampEnvelope.sustain
    );

    const filterEnv = this.currentParams.filterEnvelope;
    const filterEnvModAmount = this.currentParams.filter.envelopeAmount * 5000; 

    const filterAttackTarget = Math.max(20, Math.min(this.audioContext.sampleRate / 2, filterBaseCutoff + filterEnvModAmount));
    const filterSustainTarget = Math.max(20, Math.min(this.audioContext.sampleRate / 2, filterBaseCutoff + (filterEnv.sustain * filterEnvModAmount)));
    
    voice.filterNode.frequency.cancelScheduledValues(now); 
    voice.filterNode.frequency.setValueAtTime(filterBaseCutoff, now); 
    voice.filterNode.frequency.linearRampToValueAtTime(filterAttackTarget, now + Math.max(0.001, filterEnv.attack));
    voice.filterNode.frequency.linearRampToValueAtTime(
        filterSustainTarget, 
        now + Math.max(0.001, filterEnv.attack) + Math.max(0.001, filterEnv.decay)
    );
    
    this.connectLFOToVoice(voice);
  }

  public noteOff(note: number) {
    const now = this.audioContext.currentTime;
    const voicesToEnd = this.voices.filter(v => v.note === note && (v.isActive || v.isReleasing));

    voicesToEnd.forEach(voice => {
      if (!voice.isActive && voice.isReleasing && voice.note !== note ) return; // Already fully stopped or different note

      voice.isActive = false; // Mark as not active (won't be picked for stealing active voices)
      voice.isReleasing = true; // Now in release phase

      this.releaseEnvelope(voice.vcaNode.gain, this.currentParams.ampEnvelope.release, 0);

      let filterReleaseTarget = this.currentParams.filter.cutoff; // Default target is base cutoff
      if (this.currentParams.filter.keyboardTracking > 0 && voice.note) {
        const noteDelta = voice.note - 60;
        filterReleaseTarget += noteDelta * (this.currentParams.filter.keyboardTracking * 20);
        filterReleaseTarget = Math.max(20, Math.min(this.audioContext.sampleRate / 2, filterReleaseTarget));
      }
      // Ensure the filter release target respects envelope amount if sustain was high
      // This part can be tricky: if filter env amount is positive, release should go downwards towards base.
      // If negative, it might go upwards towards base.
      // Current releaseEnvelope takes absolute target. A simpler approach is to use the filter's current value and ramp towards a non-modulated base.
      this.releaseEnvelope(voice.filterNode.frequency, this.currentParams.filterEnvelope.release, filterReleaseTarget); // Target base cutoff


      const totalReleaseTime = Math.max(
        this.currentParams.ampEnvelope.release, 
        this.currentParams.filterEnvelope.release
      );
      
      const stopTime = now + totalReleaseTime + 0.05; 

      voice.oscillators.forEach(osc => {
        try { osc.oscNode.stop(stopTime); } catch (e) {}
      });
      if (voice.noiseNode) {
        try { voice.noiseNode.stop(stopTime); } catch(e) {}
      }

      const cleanupTimeoutId = window.setTimeout(() => { // Use window.setTimeout
        // Check if the voice is still the one we intended to clean up and is still releasing for this note
        if (voice.isReleasing && voice.note === note) { 
             this.stopVoice(voice, false); // Perform final cleanup (not hard stop, just resource free)
        }
      }, (totalReleaseTime + 0.1) * 1000); 
      voice.scheduledStopTimeouts.push(cleanupTimeoutId);
    });
  }

  private stopVoice(voice: PolyVoice, hardStop: boolean = false) {
    const now = this.audioContext.currentTime;
    voice.scheduledStopTimeouts.forEach(clearTimeout);
    voice.scheduledStopTimeouts = [];

    voice.oscillators.forEach(osc => {
      try {
        if (hardStop) osc.oscNode.stop(now);
        osc.oscNode.disconnect();
        osc.gainNode.disconnect();
      } catch (e) {}
    });
    voice.oscillators = [];

    if (voice.noiseNode) {
        try { 
            if (hardStop) voice.noiseNode.stop(now);
            voice.noiseNode.disconnect(); 
        } catch(e) {}
        voice.noiseNode = undefined;
    }
    if (voice.noiseGainNode) {
        try { voice.noiseGainNode.disconnect(); } catch(e) {}
        voice.noiseGainNode = undefined;
    }

    this.disconnectLFOFromVoice(voice);

    if (hardStop) { 
        voice.vcaNode.gain.cancelScheduledValues(now);
        voice.vcaNode.gain.setValueAtTime(0, now);
        voice.filterNode.frequency.cancelScheduledValues(now);
        // Reset filter to a neutral value. Could use currentParams.filter.cutoff or a more derived base.
        let baseFilterCutoff = this.currentParams.filter.cutoff;
        if (voice.note && this.currentParams.filter.keyboardTracking > 0) {
            const noteDelta = voice.note - 60;
            baseFilterCutoff += noteDelta * (this.currentParams.filter.keyboardTracking * 20);
            baseFilterCutoff = Math.max(20, Math.min(this.audioContext.sampleRate / 2, baseFilterCutoff));
        }
        voice.filterNode.frequency.setValueAtTime(baseFilterCutoff, now);
    }
    
    // Only reset these if not a hard stop for re-triggering the *same note*
    // If hardStop is true, the calling function (noteOn) will immediately set new note, velocity etc.
    if (!hardStop || (hardStop && voice.note === null)) { // If it's a cleanup or full stop
        voice.note = null;
        voice.velocity = 0;
        voice.startTime = 0; 
    }
    // isActive and isReleasing are managed by the calling context (noteOn/noteOff/steal)
    voice.isActive = false;
    voice.isReleasing = false;
  }
  
  public setPitchBend(bendValue: number) { 
    this.pitchBendMultiplier = Math.pow(2, (bendValue * 2) / 12); 

    const now = this.audioContext.currentTime;
    this.voices.forEach(voice => {
      if ((voice.isActive || voice.isReleasing) && voice.note !== null) {
        voice.oscillators.forEach((oscComp, index) => {
          // Ensure that currentParams.oscillators has an entry for this index
          const oscParam = this.currentParams.oscillators.find(p => p.id === oscComp.oscNode.type + voice.note + index) || this.currentParams.oscillators[index];
          // A more robust way might be to store oscId on oscComp or use index if arrays are stable
          
          if (oscParam && oscParam.enabled) { 
            const baseFrequency = this.midiNoteToFrequency(voice.note! + oscParam.octave * 12);
            const tunedFrequency = baseFrequency * Math.pow(2, oscParam.tune / 1200);
            const newFrequency = tunedFrequency * this.pitchBendMultiplier;
            oscComp.oscNode.frequency.linearRampToValueAtTime(newFrequency, now + 0.01);
          }
        });
      }
    });
  }

  public updateParams(newParams: SynthParams) {
    const oldParams = JSON.parse(JSON.stringify(this.currentParams)); 
    this.currentParams = JSON.parse(JSON.stringify(newParams)); 

    this.applyParamsToEngineGlobally(this.currentParams); 

    if (oldParams.filter.type !== this.currentParams.filter.type ||
        oldParams.filter.resonance !== this.currentParams.filter.resonance) {
        const now = this.audioContext.currentTime;
        this.voices.forEach(voice => {
            if (voice.isActive && !voice.isReleasing) { 
                if(voice.filterNode.type !== this.currentParams.filter.type) {
                    voice.filterNode.type = this.currentParams.filter.type;
                }
                if(voice.filterNode.Q.value !== this.currentParams.filter.resonance) {
                    voice.filterNode.Q.setValueAtTime(this.currentParams.filter.resonance, now);
                }
            }
        });
    }
    
    const lfoConfigChanged = oldParams.lfo.enabled !== this.currentParams.lfo.enabled ||
                             oldParams.lfo.waveform !== this.currentParams.lfo.waveform ||
                             oldParams.lfo.rate !== this.currentParams.lfo.rate ||
                             oldParams.lfo.pitchAmount !== this.currentParams.lfo.pitchAmount ||
                             oldParams.lfo.filterAmount !== this.currentParams.lfo.filterAmount;

    if (lfoConfigChanged) {
        // If LFO basic params changed, re-setup or teardown
        if (this.currentParams.lfo.enabled) {
            this.setupLFO(this.currentParams.lfo); // This will tear down and set up again
        } else {
            this.teardownLFO();
        }
        // Reconnect LFO to active voices with new settings
        this.voices.forEach(voice => {
            if (voice.isActive && !voice.isReleasing) {
                this.disconnectLFOFromVoice(voice); // Disconnect old LFO effect
                if (this.currentParams.lfo.enabled) {
                    this.connectLFOToVoice(voice); // Connect new LFO effect
                }
            }
        });
    }
  }

  public getAudioContext(): AudioContext {
    return this.audioContext;
  }

  public dispose() {
    this.voices.forEach(voice => this.stopVoice(voice, true)); 
    this.teardownLFO();
    if (this.masterGain) this.masterGain.disconnect();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
    }
  }
}
