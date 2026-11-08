/** Standalone development preview (not the Hermes integration). */
import React from 'react';
import {createRoot} from 'react-dom/client';
import VoiceLab from '../ui/VoiceLab';
import type {VoiceLabBridge} from '../bridge';
import {validateProject} from '../core/project';

const KEY = 'hermes-voice-lab.preview.';
const bridge: VoiceLabBridge = {
  kind: 'standalone',
  scopeLabel: 'Preview · saved in this browser',
  async load() {
    const raw = localStorage.getItem(KEY + 'project');
    return raw ? validateProject(JSON.parse(raw)) : null;
  },
  async save(project) {
    localStorage.setItem(KEY + 'project', JSON.stringify(project));
  },
  subscribe() {
    return () => {};
  },
  storage: {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(KEY + key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(KEY + key, JSON.stringify(value));
    },
  },
};

if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(<VoiceLab bridge={bridge} />);
