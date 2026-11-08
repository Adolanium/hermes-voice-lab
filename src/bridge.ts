export interface VoiceProject {
  version: 1;
  name: string;
  patch: Record<string, number>;
  events: Array<{time: number; duration: number; params: Record<string, number>}>;
  text?: string;
  sequence?: Array<{note: number; vowel: string; enabled: boolean}>;
  bpm?: number;
}
export interface VoiceLabBridge {
  scope(): {projectId: string; sessionId: string};
  load(): Promise<VoiceProject | null>;
  save(project: VoiceProject): Promise<VoiceProject>;
  render(project: VoiceProject): Promise<{path: string; media: string; metadata: Record<string, unknown>}>;
  subscribe(listener: (project: VoiceProject) => void): () => void;
}
