/** Web MIDI input: note on/off from every connected device (asked for on a click). */
import {useEffect, useRef, useState} from 'react';

export type MidiStatus = 'off' | 'on' | 'unavailable' | 'denied';

export function useMidi(onNoteOn: (midi: number, velocity: number, source: string) => void, onNoteOff: (midi: number, source: string) => void) {
  const [status, setStatus] = useState<MidiStatus>('off');
  const [inputs, setInputs] = useState<string[]>([]);
  const cb = useRef({onNoteOn, onNoteOff});
  cb.current = {onNoteOn, onNoteOff};
  const held = useRef(new Map<string, {midi: number; input: string}>());
  const access = useRef<MIDIAccess | null>(null);

  const handle = (e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const command = data[0] & 0xf0;
    const source = `midi:${(e.target as MIDIInput)?.id}:${data[0] & 0x0f}:${data[1]}`;
    if (command === 0x90 && data[2] > 0) {
      held.current.set(source, {midi: data[1], input: (e.target as MIDIInput).id});
      cb.current.onNoteOn(data[1], data[2] / 127, source);
    } else if (command === 0x80 || (command === 0x90 && data[2] === 0)) {
      held.current.delete(source);
      cb.current.onNoteOff(data[1], source);
    }
  };
  const attach = () => {
    const a = access.current;
    if (!a) return;
    const names: string[] = [];
    a.inputs.forEach(input => {
      input.onmidimessage = handle;
      names.push(input.name || 'MIDI input');
    });
    held.current.forEach(({midi, input}, source) => {
      if (a.inputs.get(input)?.state === 'connected') return;
      cb.current.onNoteOff(midi, source);
      held.current.delete(source);
    });
    setInputs(names);
  };
  const enable = async () => {
    if (access.current) return;
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      setStatus('unavailable');
      return;
    }
    try {
      access.current = await navigator.requestMIDIAccess();
      access.current.onstatechange = attach;
      attach();
      setStatus('on');
    } catch {
      setStatus('denied');
    }
  };
  useEffect(() => () => {
    const a = access.current;
    if (!a) return;
    held.current.forEach(({midi}, source) => cb.current.onNoteOff(midi, source));
    held.current.clear();
    a.onstatechange = null;
    a.inputs.forEach(input => { input.onmidimessage = null; });
  }, []);
  return {status, inputs, enable};
}
