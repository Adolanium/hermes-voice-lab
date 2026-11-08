/** Public SDK subset consumed by the adapter. Runtime supplied by Hermes Desktop. */
declare module '@hermes/plugin-sdk' {
  export interface Atom<T> {get():T; subscribe(callback:(value:T)=>void):()=>void}
  export const host: {
    state: {focusedStoredSessionId:Atom<string|null>;focusedSessionId:Atom<string|null>;focusedSessionProfile:Atom<string>};
    onEvent(type:string,listener:(event:{payload:unknown})=>void):()=>void;
    navigate(path:string):void;
  };
  export function useValue<T>(atom:Atom<T>):T;
  export function captureGatewayFileDownload():(storedPath:string,suggestedName:string)=>Promise<void>;
  export const ROUTES_AREA:string;
  export const SIDEBAR_NAV_AREA:string;
  export const PALETTE_AREA:string;
}
