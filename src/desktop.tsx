import React, {useMemo} from 'react';
import {host, useValue, captureGatewayFileDownload, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA} from '@hermes/plugin-sdk';
import VoiceLab from './VoiceLab';
import type {VoiceLabBridge, VoiceProject} from './bridge';

function SessionLab({ctx}: {ctx:any}) {
  const stored = useValue(host.state.focusedStoredSessionId);
  const runtime = useValue(host.state.focusedSessionId);
  const profile = useValue(host.state.focusedSessionProfile);
  const sessionId = stored || runtime || 'scratch';
  const bridge = useMemo<VoiceLabBridge>(() => {
    const projectId = 'main';
    const scope = () => ({projectId,sessionId});
    const assertScope = () => {
      const focused = host.state.focusedStoredSessionId.get() || host.state.focusedSessionId.get() || 'scratch';
      if (focused !== sessionId || host.state.focusedSessionProfile.get() !== profile) throw new Error('Conversation changed; reopen this project.');
    };
    return {
      scope,
      async load() {
        assertScope();
        return (await ctx.rest(`/projects/${projectId}?session_id=${encodeURIComponent(sessionId)}`)).project;
      },
      async save(project) {
        assertScope();
        return (await ctx.rest(`/projects/${projectId}`, {method:'PUT',body:{session_id:sessionId,project}})).project;
      },
      async render(project) {
        assertScope();
        const download = captureGatewayFileDownload();
        await ctx.rest(`/projects/${projectId}`, {method:'PUT',body:{session_id:sessionId,project}});
        assertScope();
        const result = await ctx.rest('/render', {method:'POST',body:{project_id:projectId,session_id:sessionId},timeoutMs:90000});
        await download(result.path, `${project.name || 'voice-study'}.wav`);
        return result;
      },
      subscribe(listener) {
        return host.onEvent('plugin.hermes-voice-lab.project.updated', ({payload}:any) => {
          if (payload.project_id === projectId && payload.session_id === sessionId && host.state.focusedSessionProfile.get() === profile) listener(payload.project as VoiceProject);
        });
      },
    };
  }, [ctx,sessionId,profile]);
  return React.createElement(VoiceLab,{key:`${profile}:${sessionId}`,bridge});
}

export default {
  id:'hermes-voice-lab', name:'Voice Lab', defaultEnabled:false,
  register(ctx:any) {
    ctx.register({id:'voice-lab-route',area:ROUTES_AREA,data:{path:'/voice-lab'},render:()=>React.createElement(SessionLab,{ctx})});
    ctx.register({id:'voice-lab-nav',area:SIDEBAR_NAV_AREA,data:{path:'/voice-lab',label:'Voice Lab',codicon:'unmute'}});
    ctx.register({id:'voice-lab-open',area:PALETTE_AREA,data:{id:'voice-lab-open',label:'Open Voice Lab',run:()=>host.navigate('/voice-lab')}});
  },
};
