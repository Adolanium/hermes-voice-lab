/** Build-time asset module supplied by scripts/build.mjs. Keeps source-only
 * worktrees typecheckable before generated bundles are built. */
declare module '*generated/assets' {
  export const wasmBase64: string;
  export const lexiconBase64: string;
  export const workletSource: string;
}
