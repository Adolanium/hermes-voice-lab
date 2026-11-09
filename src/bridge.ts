/** Host adapter interface: Hermes Desktop (src/desktop.tsx) or the standalone preview. */
import type {Mode, Project} from './core/project';
import type {JamAnswer} from './performance/jam';

export type UpdateOrigin = 'agent' | 'desktop' | 'remote';

export interface VoiceLabBridge {
  kind: 'hermes' | 'standalone';
  /** Human label for where the project is saved. */
  scopeLabel: string;
  load(): Promise<Project | null>;
  save(project: Project): Promise<void>;
  /** Project changes made elsewhere (agent tools or another window). */
  subscribe(listener: (project: Project, origin: UpdateOrigin, changed?: string[]) => void): () => void;
  /** Render with the backend renderer and offer the file for download. */
  exportWav?(project: Project, mode: Mode): Promise<{path: string; seconds?: number}>;
  /** Plugin-scoped key/value storage for presets and preferences. */
  storage: {get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void};
  /** Save/open project JSON through the host's file door. */
  files?: {save(name: string, text: string): Promise<string | null>; open(): Promise<string | null>};
  notify?(message: string, kind?: 'info' | 'error'): void;
  /** Jam with the agent: send a phrase as a chat turn, and hear its sung answers. */
  jam?: {send(text: string): Promise<void>; subscribe(listener: (answer: JamAnswer) => void): () => void};
}
