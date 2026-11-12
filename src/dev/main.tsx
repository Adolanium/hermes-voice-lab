/** Standalone page: the development preview and the hosted web demo (not the Hermes integration). */
import React from 'react';
import {createRoot} from 'react-dom/client';
import VoiceLab from '../ui/VoiceLab';
import type {VoiceLabBridge} from '../bridge';
import {validateProject} from '../core/project';

const KEY = 'hermes-voice-lab.preview.';
const bridge: VoiceLabBridge = {
  kind: 'standalone',
  scopeLabel: 'Web · saved in this browser',
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

const theme = new URLSearchParams(location.search).get('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(<VoiceLab bridge={bridge} />);
