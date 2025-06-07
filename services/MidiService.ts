
import { MIDI_NOTE_ON, MIDI_NOTE_OFF, MIDI_PITCH_BEND, MIDI_CC } from '../constants';
import { MidiMessage } from '../types';

type MidiCallback = (message: MidiMessage) => void;
type PitchBendCallback = (bendValue: number) => void; // -1 to 1
type ControlChangeCallback = (control: number, value: number) => void;


export class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private onNoteEvent: MidiCallback;
  private onPitchBendEvent: PitchBendCallback;
  private onCcEvent: ControlChangeCallback;
  public inputs: MIDIInput[] = [];
  private activeInput: MIDIInput | null = null;

  constructor(
    onNoteEvent: MidiCallback, 
    onPitchBendEvent: PitchBendCallback,
    onCcEvent: ControlChangeCallback
  ) {
    this.onNoteEvent = onNoteEvent;
    this.onPitchBendEvent = onPitchBendEvent;
    this.onCcEvent = onCcEvent;
  }

  async initialize(): Promise<string[]> {
    if (navigator.requestMIDIAccess) {
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.inputs = Array.from(this.midiAccess.inputs.values());
        
        this.midiAccess.onstatechange = (event: Event) => {
            const midiEvent = event as MIDIConnectionEvent;
            console.log('MIDI state changed:', midiEvent.port.name, midiEvent.port.state);
            if (this.midiAccess) { // Ensure midiAccess is still valid
              this.inputs = Array.from(this.midiAccess.inputs.values());
            } else {
              this.inputs = [];
            }
            
            // TODO: Notify App to re-render MIDI device list
            // If active input disconnected, try to select another one or nullify
            if (this.activeInput && this.activeInput.state === 'disconnected') {
                this.activeInput.onmidimessage = null; // remove old listener
                this.activeInput = null;
                if (this.inputs.length > 0) {
                    this.selectDevice(this.inputs[0].id); // try to select first available
                }
            }
        };

        return this.inputs.map(input => input.name || `Unknown MIDI Input ${input.id}`);
      } catch (error) {
        console.error('Failed to get MIDI access:', error);
        return [];
      }
    } else {
      console.warn('Web MIDI API not supported in this browser.');
      return [];
    }
  }

  selectDevice(deviceId: string | null): boolean {
    if (!this.midiAccess) return false;

    // Clear listener from previous device
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
    }

    if (deviceId === null) {
        this.activeInput = null;
        console.log("MIDI input deselected.");
        return true;
    }
    
    const selectedInput = this.inputs.find(input => input.id === deviceId);

    if (selectedInput) {
      this.activeInput = selectedInput;
      this.activeInput.onmidimessage = this.handleMidiMessage.bind(this);
      console.log(`MIDI Input selected: ${selectedInput.name}`);
      return true;
    }
    console.warn(`MIDI Input with ID ${deviceId} not found.`);
    return false;
  }

  private handleMidiMessage(event: MIDIMessageEvent) {
    const [commandWithChannel, noteOrControl, velocityOrValue] = event.data;
    const command = commandWithChannel & 0xF0; // Mask out channel
    // const channel = commandWithChannel & 0x0F;

    switch (command) {
      case MIDI_NOTE_ON:
        if (velocityOrValue > 0) { // Note On
          this.onNoteEvent({ command, note: noteOrControl, velocity: velocityOrValue });
        } else { // Note On with velocity 0 is equivalent to Note Off
          this.onNoteEvent({ command: MIDI_NOTE_OFF, note: noteOrControl, velocity: 0 });
        }
        break;
      case MIDI_NOTE_OFF:
        this.onNoteEvent({ command, note: noteOrControl, velocity: velocityOrValue });
        break;
      case MIDI_PITCH_BEND:
        const bendValue = ((velocityOrValue << 7) + noteOrControl - 8192) / 8192; // Calculate -1 to 1
        this.onPitchBendEvent(bendValue);
        break;
      case MIDI_CC:
        this.onCcEvent(noteOrControl, velocityOrValue);
        break;
      default:
        // console.log(`Unhandled MIDI command: ${command}`);
    }
  }

  public getAvailableDevices(): {id: string, name: string}[] {
    return this.inputs.map(input => ({ id: input.id, name: input.name || `Unknown MIDI Input ${input.id}` }));
  }

  public getActiveDeviceId(): string | null {
    return this.activeInput ? this.activeInput.id : null;
  }
}
