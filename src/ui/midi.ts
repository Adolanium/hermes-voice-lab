/** Web MIDI input: note on/off from every connected device (asked for on a click). */
import {useEffect, useRef, useState} from 'react';

export type MidiStatus = 'off' | 'on' | 'unavailable' | 'denied';

export function useMidi(onNoteOn: (midi: number, velocity: number) => void, onNoteOff: (midi: number) => void) {
  const [status, setStatus] = useState<MidiStatus>('off');
  const [inputs, setInputs] = useState<string[]>([]);
  const cb = useRef({onNoteOn, onNoteOff});
  cb.current = {onNoteOn, onNoteOff};
  const access = useRef<MIDIAccess | null>(null);

  const handle = (e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const command = data[0] & 0xf0;
    if (command === 0x90 && data[2] > 0) cb.current.onNoteOn(data[1], data[2] / 127);
    else if (command === 0x80 || (command === 0x90 && data[2] === 0)) cb.current.onNoteOff(data[1]);
  };
  const attach = () => {
    const a = access.current;
    if (!a) return;
    const names: string[] = [];
    a.inputs.forEach(input => {
      input.onmidimessage = handle;
      names.push(input.name || 'MIDI input');
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
    a.onstatechange = null;
    a.inputs.forEach(input => { input.onmidimessage = null; });
  }, []);
  return {status, inputs, enable};
}
