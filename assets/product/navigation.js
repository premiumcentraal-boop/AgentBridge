// A self-contained visual prototype. These controls never call a carrier API.
export const NAV_ITEMS = [
  { id:'overview', label:'Overview', path:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { id:'routes', label:'Route drafts', path:'M7 17 17 7M7 7h10v10M4 12v7a1 1 0 0 0 1 1h7' },
  { id:'connection', label:'Connection', path:'M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l2-2' },
  { id:'activity', label:'Activity', path:'M3 12a9 9 0 1 0 3-6M3 3v6h6M12 7v5l3 2' },
  { id:'settings', label:'Settings', path:'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0' },
  { id:'design', label:'Design boards', path:'M3 3h18v18H3zM3 9h18M9 9v12' },
];
const controlPaths = {
  phone:'M5 3h4l1 5-2 2a14 14 0 0 0 6 6l2-2 5 1v4a2 2 0 0 1-2 2C10 20 4 14 3 5a2 2 0 0 1 2-2',
  mute:'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  muted:'M3 3l18 18M9 9v3a3 3 0 0 0 5 2M15 9V6a3 3 0 0 0-5-2M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M8 22h8',
  end:'M3 14v4h5v-4a10 10 0 0 1 8 0v4h5v-4C16 7 8 7 3 14z',
  return:'M5 12h14M13 6l6 6-6 6',
  collapse:'M4 4h16v16H4zM10 4v16M16 9l-3 3 3 3',
  expand:'M4 4h16v16H4zM10 4v16M14 9l3 3-3 3',
  moon:'M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10',
  sun:'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
};
const svg = (path, size=17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const controlIcon = (name,size) => svg(controlPaths[name],size);
const themes = ['signal','material','atlas'];
const defaultState = () => ({ theme:'signal', scheme:'dark', compact:false, active:true, muted:false, page:'overview', callView:false });
const wave = '<span class="nav-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';

function callCard(state) {
  if (!state.active) return `<div class="nav-call-card nav-call-idle"><span class="nav-idle-icon">${controlIcon('phone',20)}</span><strong class="nav-expanded-label">No active call</strong><small class="nav-expanded-label">Ready for the next connection.</small><button type="button" data-nav-action="restart" class="nav-restart" aria-label="Restart the simulated call">${controlIcon('return',15)}<span class="nav-expanded-label">Restart preview</span></button></div>`;
  return `<div class="nav-call-card ${state.muted?'nav-call-muted':''}"><div class="nav-call-status"><i></i><span class="nav-expanded-label">ACTIVE CALL</span><small class="nav-expanded-label">DEMO</small></div><button type="button" class="nav-call-recipient" data-nav-action="return" aria-label="Return to the simulated London studio call"><span class="nav-call-avatar">${controlIcon('phone',17)}</span><span class="nav-expanded-label"><strong>London studio</strong><small>Grok Bot · United Kingdom</small></span></button><div class="nav-call-audio">${wave}<time aria-label="Simulated call duration 2 minutes 34 seconds">02:34</time></div><div class="nav-call-controls"><button type="button" data-nav-action="mute" aria-label="${state.muted?'Unmute':'Mute'} simulated call" aria-pressed="${state.muted}">${controlIcon(state.muted?'muted':'mute',15)}</button><button type="button" data-nav-action="return" aria-label="Return to simulated call">${controlIcon('return',15)}</button><button type="button" class="nav-end-call" data-nav-action="end" aria-label="End simulated call">${controlIcon('end',15)}</button></div></div>`;
}
function detailContent(state) {
  if(state.callView) return `<div class="nav-demo-call"><span class="nav-demo-call-avatar">${controlIcon('phone',30)}</span><span class="nav-preview-kicker">${state.active?'SIMULATED ACTIVE CALL':'PREVIEW CALL ENDED'}</span><h3>London studio</h3><p>+44 20 7946 0123</p><strong>${state.active?'02:34':'Call ended'}</strong><span>${state.active?(state.muted?'Microphone muted in preview':'Grok Bot is the conversational voice'):'No real telephone connection was made.'}</span></div>`;
  const title=NAV_ITEMS.find(item=>item.id===state.page).label;
  const tables={
    overview:'<div class="nav-demo-stats"><div><span>ROUTING</span><strong>Paused</strong></div><div><span>ROUTE DRAFTS</span><strong>03</strong></div></div>',
    routes:'<p class="nav-demo-description">Your destinations, prepared for review.</p>',
    connection:'<dl class="nav-demo-properties"><div><dt>Private backend</dt><dd>Not connected</dd></div><div><dt>Assigned number</dt><dd>Not configured</dd></div><div><dt>Discovery tools</dt><dd>Read-only</dd></div></dl>',
    activity:'<div class="nav-demo-event">Route draft saved <small>Workspace event · Sample</small></div><div class="nav-demo-event">Guidance preference updated <small>Workspace event · Sample</small></div>',
    settings:'<dl class="nav-demo-properties"><div><dt>Guidance</dt><dd>Simple</dd></div><div><dt>Workspace</dt><dd>Victor</dd></div><div><dt>Theme</dt><dd>Navigation preview only</dd></div></dl>',
    design:'<div class="nav-demo-directions"><span>01 / Signal</span><span>02 / Material</span><span>03 / Atlas</span></div>',
  };
  const routes=['overview','routes'].includes(state.page)?`<div class="nav-demo-table"><span class="nav-preview-kicker">ROUTE DRAFTS</span>${['London studio','New York office','San Francisco team'].map(name=>`<div><span>${name}</span><small>Draft</small></div>`).join('')}</div>`:'';
  return `<span class="nav-preview-kicker">VICTOR WORKSPACE / ${title.toUpperCase()}</span><h3>${state.page==='overview'?'Your connection,<br>always in view.':title}</h3>${tables[state.page]}${routes}`;
}
function previewInner(state) {
  return `<div class="nav-preview-heading"><div><span class="design-kicker">A SHARED NAVIGATION LANGUAGE</span><h2>The call stays with you.</h2><p>Floating navigation in all three directions. Try the expanded and compact layouts.</p></div><span class="nav-preview-label">Interactive concept</span></div><div class="nav-preview-toolbar"><div class="nav-theme-options" role="group" aria-label="Navigation design direction">${themes.map(theme=>`<button type="button" data-nav-theme="${theme}" aria-pressed="${state.theme===theme}"><i class="nav-theme-dot nav-dot-${theme}"></i>${theme[0].toUpperCase()+theme.slice(1)}</button>`).join('')}</div><button type="button" class="nav-size-toggle" data-nav-action="compact" aria-pressed="${state.compact}" aria-label="${state.compact?'Expand':'Collapse'} navigation preview">${controlIcon(state.compact?'expand':'collapse',15)}${state.compact?'Expand':'Compact'}</button></div><div class="nav-preview-stage ${state.compact?'nav-is-compact':''}" data-theme="${state.theme}" data-scheme="${state.scheme}"><aside class="nav-floating" aria-label="AgentBridge navigation preview"><div class="nav-floating-brand"><span>⌁</span><b class="nav-expanded-label">AgentBridge</b><button type="button" data-nav-action="compact" aria-label="${state.compact?'Expand':'Collapse'} navigation">${controlIcon(state.compact?'expand':'collapse',14)}</button></div>${callCard(state)}<span class="nav-group-label nav-expanded-label">WORKSPACE</span><nav class="nav-floating-links" aria-label="Preview workspace navigation">${NAV_ITEMS.map(item=>`<button type="button" data-nav-page="${item.id}" aria-pressed="${state.page===item.id&&!state.callView}" aria-label="${item.label}" title="${item.label}">${svg(item.path)}<span class="nav-expanded-label">${item.label}</span>${item.id==='routes'?'<small class="nav-expanded-label">03</small>':''}</button>`).join('')}</nav><div class="nav-floating-footer"><div class="nav-scheme-switch" role="group" aria-label="Navigation appearance">${['dark','light'].map(scheme=>`<button type="button" data-nav-scheme="${scheme}" aria-pressed="${state.scheme===scheme}" aria-label="${scheme==='dark'?'Dark':'Light'} navigation">${controlIcon(scheme==='dark'?'moon':'sun',13)}<span class="nav-expanded-label">${scheme==='dark'?'Dark':'Light'}</span></button>`).join('')}</div><div class="nav-owner"><span class="nav-owner-avatar">V</span><div class="nav-expanded-label"><strong>Victor</strong><small>Workspace owner</small></div><span class="nav-expanded-label">⌘</span></div></div></aside><div class="nav-demo-surface"><div class="nav-demo-surface-top"><span>AgentBridge / Studio</span><span>PREVIEW</span></div><div class="nav-demo-body">${detailContent(state)}</div><p class="nav-demo-footnote">Navigation concept · Call and records are simulated.</p></div></div><p class="nav-prototype-note">The call card remains at the top of both navigation layouts. These controls demonstrate visual states only; they do not place or control real calls.</p><p class="nav-preview-announcement" aria-live="polite" role="status">${state.active?(state.muted?'Simulated microphone muted.':'Simulated call active.'): 'Simulated call ended.'}</p>`;
}
export function renderNavigationPreview() {
  return `<section class="navigation-preview" data-navigation-preview>${previewInner(defaultState())}</section>`;
}
const boundHosts=new WeakSet();
export function bindNavigationPreview(scope=document) {
  scope.querySelectorAll('[data-navigation-preview]').forEach(host=>{
    if(boundHosts.has(host))return;
    boundHosts.add(host);const state=defaultState();
    host.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||!host.contains(button))return;
      let focusSelector;
      if(themes.includes(button.dataset.navTheme)){state.theme=button.dataset.navTheme;focusSelector=`[data-nav-theme="${state.theme}"]`;}
      else if(NAV_ITEMS.some(item=>item.id===button.dataset.navPage)){state.page=button.dataset.navPage;state.callView=false;focusSelector=`[data-nav-page="${state.page}"]`;}
      else if(['dark','light'].includes(button.dataset.navScheme)){state.scheme=button.dataset.navScheme;focusSelector=`[data-nav-scheme="${state.scheme}"]`;}
      else if(button.dataset.navAction){
        const action=button.dataset.navAction;focusSelector=`[data-nav-action="${action}"]`;
        if(action==='compact')state.compact=!state.compact;
        else if(action==='mute'&&state.active)state.muted=!state.muted;
        else if(action==='end'){state.active=false;state.muted=false;state.callView=true;focusSelector='[data-nav-action="restart"]';}
        else if(action==='return')state.callView=true;
        else if(action==='restart'){state.active=true;state.muted=false;state.callView=true;focusSelector='[data-nav-action="return"]';}
        else return;
      }else return;
      host.innerHTML=previewInner(state);host.querySelector(focusSelector)?.focus({preventScroll:true});
    });
  });
}
