/* Small server-rendered pages: sign in, accept an invite, approve an AI agent,
   the owner's Team page and the "Connect an AI agent" page. Plain HTML with a
   little inline script; they talk to the same /api as the app. */
import fs from 'node:fs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--accent:#5b45e0;--accent-ink:#fff;--bad:#c0392b;--ok:#1f8a4c;--field:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1c1c1f;--ink:#ececee;--muted:#9a9aa2;--line:#2c2c31;--accent:#8f7cff;--accent-ink:#111;--field:#232327}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Inter,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 16px 64px}main.narrow{max-width:420px;padding-top:12vh}
h1{font-size:24px;margin:0 0 4px;letter-spacing:-.01em}h2{font-size:17px;margin:32px 0 8px}p{margin:6px 0}.muted{color:var(--muted)}.small{font-size:13px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:24px;font-weight:600}.brand svg{width:22px;height:22px}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 4px}
input[type=email],input[type=password],input[type=text]{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--ink);font:inherit}
input:focus{outline:2px solid var(--accent);outline-offset:-1px}
button,.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
button.primary,.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}button:disabled{opacity:.6;cursor:default}
button.link{border:0;background:none;padding:0;color:var(--accent);font-weight:500}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.spacer{flex:1}
.err{color:var(--bad);min-height:20px;font-size:14px;margin-top:10px}.ok{color:var(--ok)}
table{width:100%;border-collapse:collapse;margin-top:8px}td,th{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:600}
code,.code{font:13px/1.4 ui-monospace,Consolas,monospace;background:var(--field);border:1px solid var(--line);border-radius:6px;padding:2px 6px;word-break:break-all}
.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-top:16px}
.checks label{display:flex;gap:8px;align-items:center;font-weight:500;margin:6px 0}.checks select{margin-left:auto}
select{padding:6px 8px;border-radius:6px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit}
.items{margin:4px 0 8px 26px;display:none}.items.on{display:block}.items label{font-weight:400}
a{color:var(--accent)}
`;

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`;

function page(title, body, { narrow = false, script = '' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><main${narrow ? ' class="narrow"' : ''}><div class="brand">${LOGO}PrePro Studio</div>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

const POST_JSON = `async function post(url, body, method){const r=await fetch(url,{method:method||'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||('Error '+r.status));return j}`;

export function loginPage(next) {
  return page(
    'Sign in · PrePro Studio',
    `<h1>Sign in</h1><p class="muted">Use the email your invite was sent to.</p>
<form id="f"><label for="e">Email</label><input id="e" type="email" autocomplete="username" required autofocus>
<label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required>
<div class="err" id="err"></div><button class="primary" type="submit" id="b">Sign in</button></form>
<p class="muted small" style="margin-top:24px">Forgot your password? Ask the owner for a new sign-in link.</p>`,
    {
      narrow: true,
      script: `${POST_JSON}const next=${JSON.stringify(safeNext(next))};document.getElementById('f').onsubmit=async(ev)=>{ev.preventDefault();const b=document.getElementById('b'),err=document.getElementById('err');b.disabled=true;err.textContent='';try{await post('/api/login',{email:document.getElementById('e').value,password:document.getElementById('p').value});location.href=next}catch(e){err.textContent=e.message;b.disabled=false}}`,
    },
  );
}

export function invitePage(token, info) {
  if (!info) return page('Link expired · PrePro Studio', `<h1>This link has expired</h1><p class="muted">It was already used, or it is more than 7 days old. Ask the owner for a new sign-in link.</p><p style="margin-top:20px"><a href="/login">Go to sign in</a></p>`, { narrow: true });
  return page(
    'Set your password · PrePro Studio',
    `<h1>Welcome${info.name ? `, ${esc(info.name)}` : ''}</h1><p class="muted">Set a password for <strong>${esc(info.email)}</strong>. You'll use it to sign in from now on.</p>
<form id="f"><label for="p">New password</label><input id="p" type="password" autocomplete="new-password" minlength="10" required autofocus>
<label for="p2">Repeat it</label><input id="p2" type="password" autocomplete="new-password" minlength="10" required>
<p class="muted small">At least 10 characters.</p><div class="err" id="err"></div><button class="primary" type="submit" id="b">Set password and open PrePro Studio</button></form>`,
    {
      narrow: true,
      script: `${POST_JSON}document.getElementById('f').onsubmit=async(ev)=>{ev.preventDefault();const p=document.getElementById('p').value,b=document.getElementById('b'),err=document.getElementById('err');if(p!==document.getElementById('p2').value){err.textContent='The two passwords are different.';return}b.disabled=true;err.textContent='';try{await post('/api/invite',{token:${JSON.stringify(token)},password:p});location.href='/'}catch(e){err.textContent=e.message;b.disabled=false}}`,
    },
  );
}

export function consentPage({ client, user, params, csrf }) {
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  return page(
    'Allow access · PrePro Studio',
    `<h1>Allow ${esc(client.name)}?</h1>
<p class="muted">${esc(client.name)} wants to work in PrePro Studio as <strong>${esc(user.email)}</strong>. It will see and change only what you can see and change.</p>
<p class="muted small">It works in your open PrePro Studio tab, so keep one open while it works. You can disconnect it any time on the Connect an AI agent page.</p>
<form method="post" action="/oauth/authorize" style="margin-top:20px">${hidden}<input type="hidden" name="csrf" value="${esc(csrf)}">
<div class="row"><button class="primary" name="decision" value="allow" type="submit">Allow</button><button name="decision" value="deny" type="submit">Cancel</button></div></form>`,
    { narrow: true },
  );
}

export function errorPage(title, message) {
  return page(`${title} · PrePro Studio`, `<h1>${esc(title)}</h1><p class="muted">${esc(message)}</p><p style="margin-top:20px"><a href="/">Back to PrePro Studio</a></p>`, { narrow: true });
}

const TAB_LABELS = { productions: 'Productions', marketing: 'Marketing Spaces', business: 'Business Management' };

export function teamPage({ user, people, docs }) {
  const docsJson = JSON.stringify(docs);
  const peopleJson = JSON.stringify(people);
  return page(
    'Team · PrePro Studio',
    `<div class="row"><h1>Team</h1><span class="spacer"></span><a class="btn" href="/">Back to PrePro Studio</a></div>
<p class="muted">Add people and choose what they see. Personal Finances and Training are only ever yours.</p>
<div class="box"><h2 style="margin-top:0">Add a person</h2>
<form id="add"><div class="row"><div style="flex:2;min-width:220px"><label for="em">Email</label><input id="em" type="email" required></div><div style="flex:1;min-width:160px"><label for="nm">Name</label><input id="nm" type="text"></div></div>
<label>Can see</label><div class="checks" id="addTabs"></div>
<div class="err" id="addErr"></div><button class="primary" type="submit">Add and create sign-in link</button></form>
<div id="linkOut"></div></div>
<h2>People</h2><table><thead><tr><th>Person</th><th>Can see</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<p class="muted small" style="margin-top:24px">Signed in as ${esc(user.email)} (owner).</p>`,
    {
      script: `${POST_JSON}
const DOCS=${docsJson};let PEOPLE=${peopleJson};const LABELS=${JSON.stringify(TAB_LABELS)};
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function tabEditor(prefix,tabs){return Object.keys(LABELS).map(t=>{const v=tabs&&tabs[t];const list=DOCS[t]||[];const chosen=v&&Array.isArray(v.items)?v.items:[];
return '<label><input type="checkbox" data-tab="'+t+'" '+(v?'checked':'')+'> '+LABELS[t]+'<select data-scope="'+t+'"><option value="all"'+(!v||v.items==='all'?' selected':'')+'>Everything</option><option value="some"'+(v&&v.items!=='all'?' selected':'')+'>Only chosen</option></select></label>'
+'<div class="items'+(v&&v.items!=='all'?' on':'')+'" data-items="'+t+'">'+(list.length?list.map(d=>'<label><input type="checkbox" data-doc="'+esc(d.id)+'" '+(chosen.includes(d.id)?'checked':'')+'> '+esc(d.title)+'</label>').join(''):'<span class="muted small">Nothing here yet.</span>')+'</div>'}).join('')}
function wire(el){el.querySelectorAll('select[data-scope]').forEach(s=>s.onchange=()=>{el.querySelector('[data-items="'+s.dataset.scope+'"]').classList.toggle('on',s.value==='some')})}
function readTabs(el){const out={};for(const t of Object.keys(LABELS)){const on=el.querySelector('input[data-tab="'+t+'"]').checked;if(!on){out[t]=null;continue}const scope=el.querySelector('select[data-scope="'+t+'"]').value;out[t]={level:'edit',items:scope==='all'?'all':[...el.querySelectorAll('[data-items="'+t+'"] input[data-doc]:checked')].map(i=>i.dataset.doc)}}return out}
function summary(p){if(p.owner)return 'Everything (owner)';const s=Object.keys(LABELS).filter(t=>p.tabs[t]).map(t=>LABELS[t]+(p.tabs[t].items==='all'?'':' ('+p.tabs[t].items.length+' chosen)'));return s.length?s.join(', '):'Nothing yet'}
function render(){document.getElementById('rows').innerHTML=PEOPLE.map(p=>'<tr data-uid="'+p.uid+'"><td><strong>'+esc(p.name)+'</strong><br><span class="muted small">'+esc(p.email)+'</span>'+(p.disabled?'<br><span class="small" style="color:var(--bad)">Turned off</span>':p.invitePending?'<br><span class="muted small">Has not set a password yet</span>':'')+'</td><td>'+esc(summary(p))+'<div class="edit" style="display:none"></div></td><td>'+(p.owner?'':'<div class="row" style="justify-content:flex-end"><button class="link" data-act="edit">Edit</button><button class="link" data-act="link">New sign-in link</button><button class="link" data-act="toggle">'+(p.disabled?'Turn on':'Turn off')+'</button><button class="link" data-act="remove" style="color:var(--bad)">Remove</button></div>')+'</td></tr>').join('');
document.querySelectorAll('button[data-act]').forEach(b=>b.onclick=()=>act(b.closest('tr').dataset.uid,b.dataset.act,b))}
async function reload(){PEOPLE=(await (await fetch('/api/team')).json()).people;render()}
function showLink(link,email){document.getElementById('linkOut').innerHTML='<div class="box"><p><strong>Send this link to '+esc(email)+'</strong> (it works once, for 7 days):</p><p><span class="code" id="lnk">'+esc(link)+'</span></p><button id="cp">Copy link</button></div>';document.getElementById('cp').onclick=()=>{navigator.clipboard.writeText(link);document.getElementById('cp').textContent='Copied'};document.getElementById('linkOut').scrollIntoView({behavior:'smooth'})}
async function act(uid,what,btn){const p=PEOPLE.find(x=>x.uid===uid);try{
if(what==='edit'){const tr=btn.closest('tr'),box=tr.querySelector('.edit');if(box.style.display==='block'){box.style.display='none';return}box.innerHTML='<div class="checks">'+tabEditor('e',p.tabs)+'</div><button class="primary" data-save>Save</button>';box.style.display='block';wire(box);box.querySelector('[data-save]').onclick=async()=>{await post('/api/team/'+uid,{tabs:readTabs(box)},'PATCH');await reload()};return}
if(what==='link'){const r=await post('/api/team/'+uid+'/link');showLink(r.link,p.email);await reload();return}
if(what==='toggle'){await post('/api/team/'+uid,{disabled:!p.disabled},'PATCH');await reload();return}
if(what==='remove'){if(!confirm('Remove '+p.email+'? Their login is deleted. What they made stays.'))return;await post('/api/team/'+uid,{},'DELETE');await reload();return}
}catch(e){alert(e.message)}}
const addTabs=document.getElementById('addTabs');addTabs.innerHTML=tabEditor('a',{productions:null,marketing:null,business:null});wire(addTabs);
document.getElementById('add').onsubmit=async(ev)=>{ev.preventDefault();const err=document.getElementById('addErr');err.textContent='';try{const email=document.getElementById('em').value;const r=await post('/api/team',{email,name:document.getElementById('nm').value,tabs:readTabs(addTabs)});showLink(r.link,email);ev.target.reset();addTabs.innerHTML=tabEditor('a',{});wire(addTabs);await reload()}catch(e){err.textContent=e.message}};
render();`,
    },
  );
}

export function connectPage({ user, base, pats, apps }) {
  const mcp = `${base}/mcp`;
  return page(
    'Connect an AI agent · PrePro Studio',
    `<div class="row"><h1>Connect an AI agent</h1><span class="spacer"></span><a class="btn" href="/">Back to PrePro Studio</a></div>
<p class="muted">An agent works in PrePro Studio as you (${esc(user.email)}) and sees only what you can see. It works in your open PrePro Studio tab, so keep one open while it works.</p>
<h2>Claude (claude.ai or the Claude app)</h2>
<p>Settings, Connectors, <strong>Add custom connector</strong>. Name it PrePro Studio and paste this URL:</p>
<p><span class="code">${esc(mcp)}</span> <button class="link" data-copy="${esc(mcp)}">Copy</button></p>
<p class="muted small">Claude then opens a sign-in window here; sign in and press Allow.</p>
<h2>Claude Code, Cursor, VS Code and other tools</h2>
<p>Create a personal token, then add the server with it. For Claude Code:</p>
<p><span class="code">claude mcp add --transport http prepro-studio ${esc(mcp)} --header "Authorization: Bearer YOUR_TOKEN"</span></p>
<form id="pat" class="row" style="margin-top:12px"><input type="text" id="patName" placeholder="Token name, e.g. Claude Code on my laptop" style="flex:1;min-width:220px" required><button class="primary" type="submit">Create token</button></form>
<div id="patOut"></div>
<h2>Connected</h2>
<table><tbody>
${apps.map((a) => `<tr><td>${esc(a.name)}<br><span class="muted small">Signed in with OAuth</span></td><td style="text-align:right"><button class="link" data-app="${esc(a.clientId)}" style="color:var(--bad)">Disconnect</button></td></tr>`).join('')}
${pats.map((p) => `<tr><td>${esc(p.name)}<br><span class="muted small">Personal token, created ${new Date(p.created).toLocaleDateString()}</span></td><td style="text-align:right"><button class="link" data-pat="${esc(p.id)}" style="color:var(--bad)">Revoke</button></td></tr>`).join('')}
${!apps.length && !pats.length ? '<tr><td class="muted">Nothing connected yet.</td></tr>' : ''}
</tbody></table>`,
    {
      script: `${POST_JSON}
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText(b.dataset.copy);b.textContent='Copied'});
document.getElementById('pat').onsubmit=async(ev)=>{ev.preventDefault();try{const r=await post('/api/tokens',{name:document.getElementById('patName').value});document.getElementById('patOut').innerHTML='<div class="box"><p><strong>Your token</strong> (shown once; keep it secret):</p><p><span class="code">'+r.token+'</span></p><button id="cpt">Copy token</button></div>';document.getElementById('cpt').onclick=()=>{navigator.clipboard.writeText(r.token);document.getElementById('cpt').textContent='Copied'}}catch(e){alert(e.message)}};
document.querySelectorAll('[data-pat]').forEach(b=>b.onclick=async()=>{await post('/api/tokens/'+b.dataset.pat,{},'DELETE');location.reload()});
document.querySelectorAll('[data-app]').forEach(b=>b.onclick=async()=>{await post('/api/apps/'+encodeURIComponent(b.dataset.app),{},'DELETE');location.reload()});`,
    },
  );
}

/* The no-sign-in review page (server/review/): its data comes from /api/review/<token>. */
let reviewAssets = null;
export function reviewPage(token) {
  reviewAssets ??= {
    css: fs.readFileSync(new URL('./review/review.css', import.meta.url), 'utf8'),
    js: fs.readFileSync(new URL('./review/review.js', import.meta.url), 'utf8'),
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Review</title><style>${reviewAssets.css}</style></head>
<body data-token="${esc(token)}"><main><div class="brand">${LOGO}PrePro Studio review</div><div id="app"><p class="muted">Loading…</p></div></main><script>${reviewAssets.js}</script></body></html>`;
}

/** Only same-site paths are allowed as a post-sign-in destination. */
export function safeNext(next) {
  const n = String(next || '/');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/';
}
