/* Product and QA use this same DOM implementation. Data and writes are supplied
 * by their adapters; this module never invents a business total or makes a request.
 * Source mechanics and licenses are recorded in product-admin-motion.NOTICE.md. */

export function installProductAdminMotion(win = window) {
  if (win.ORDER_ADMIN_MOTION?.version === '20261121.1') return win.ORDER_ADMIN_MOTION;
  const doc = win.document, NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  const number = value => numeric(value) ? value.toLocaleString('ko-KR', {maximumFractionDigits: 1}) : '—';
  const element = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const svgEl = (tag, attrs = {}) => { const el = doc.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); return el; };
  const button = (label, className = '') => { const el = element('button', className, label); el.type = 'button'; return el; };
  const spring = (x, k = 420, c = 32) => ({x, v: 0, t: x, k, c, wait: 0});
  // Semi-implicit Euler, bounded substeps. A stalled tab cannot destabilize a spring.
  function step(s, dt, reduced) {
    if (reduced) { s.x = s.t; s.v = 0; s.wait = 0; return false; }
    if (s.wait > 0) { s.wait -= dt; return true; }
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (-s.k * (s.x - s.t) - s.c * s.v) * h; s.x += s.v * h; }
    if (Math.abs(s.x - s.t) < .001 && Math.abs(s.v) < .02) { s.x = s.t; s.v = 0; return false; }
    return true;
  }
  function scope(options = {}) {
    const controller = new win.AbortController(), frames = new Set(), timers = new Set(), cleanups = [];
    const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = () => (typeof options.reduced === 'function' ? options.reduced() : options.reduced) || Boolean(media?.matches);
    const on = (target, type, fn, extra = {}) => target?.addEventListener(type, fn, {...extra, signal: controller.signal});
    const frame = fn => { if (controller.signal.aborted) return 0; const id = win.requestAnimationFrame(t => { frames.delete(id); if (!controller.signal.aborted) fn(t); }); frames.add(id); return id; };
    const cancel = id => { win.cancelAnimationFrame(id); frames.delete(id); };
    const later = (fn, delay) => { const id = win.setTimeout(() => { timers.delete(id); if (!controller.signal.aborted) fn(); }, delay); timers.add(id); return id; };
    const clear = id => { win.clearTimeout(id); timers.delete(id); };
    const observe = (targets, fn) => { if (!win.ResizeObserver) return; const ro = new win.ResizeObserver(fn); for (const target of targets.filter(Boolean)) ro.observe(target); cleanups.push(() => ro.disconnect()); };
    const cleanup = fn => cleanups.push(fn);
    const destroy = () => { if (controller.signal.aborted) return; controller.abort(); for (const id of frames) win.cancelAnimationFrame(id); for (const id of timers) win.clearTimeout(id); frames.clear(); timers.clear(); for (const fn of cleanups.reverse()) fn(); };
    return {on, frame, cancel, later, clear, observe, cleanup, destroy, reduced, signal: controller.signal};
  }
  function loop(ctx, springs, paint) {
    let raf = 0, last = 0;
    const tick = now => { raf = 0; const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60; last = now; let moving = false; for (const s of springs()) moving = step(s, dt, ctx.reduced()) || moving; paint(); if (moving) raf = ctx.frame(tick); else last = 0; };
    const kick = () => { if (ctx.reduced()) { for (const s of springs()) step(s, 0, true); paint(); } else if (!raf) raf = ctx.frame(tick); };
    ctx.cleanup(() => ctx.cancel(raf));
    return kick;
  }
  function normalizeData(input = {}) {
    input = input || {};
    const seen = new Set();
    const periods = (Array.isArray(input.periods) ? input.periods : []).filter(p => p && typeof p.id === 'string' && !seen.has(p.id) && seen.add(p.id)).slice(0, 12).map(p => ({
      id: p.id, label: String(p.label ?? p.id), total: numeric(p.total) ? p.total : null, change: numeric(p.change) ? p.change : null,
      points: (Array.isArray(p.points) ? p.points : []).filter(p => p && numeric(p.value)).slice(0, 366).map(p => ({label: String(p.label ?? ''), value: p.value, note: String(p.note ?? '')})),
    }));
    const ids = new Set(), palette = ['#4169e1', '#51a7ae', '#a08add', '#deaa58', '#d78092', '#789ba9'];
    const segments = (Array.isArray(input.segments) ? input.segments : []).filter(s => s && typeof s.id === 'string' && numeric(s.amount) && s.amount >= 0 && !ids.has(s.id) && ids.add(s.id)).slice(0, 24).map((s, i) => ({
      id: s.id, label: String(s.label ?? s.id), amount: s.amount, color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : palette[i % palette.length],
    }));
    return {title: String(input.title || '업무 현황'), scopeLabel: String(input.scopeLabel || ''), unit: String(input.unit ?? '건'), periods, segments};
  }
  function renderDashboard(input = {}, layout) {
    const data = normalizeData(input);
    const cards = [
      '<article class="pm-widget surface" data-widget-id="widget-0"><h2>기간별 현황</h2><div data-pm-stat></div></article>',
      '<article class="pm-widget surface" data-widget-id="widget-1"><h2>추이 살펴보기</h2><div data-pm-metric></div></article>',
      '<article class="pm-widget surface" data-widget-id="widget-2"><h2>분류별 현황</h2><div data-pm-ring></div></article>',
    ];
    const order = validLayout(layout, ['widget-0', 'widget-1', 'widget-2']) ? layout : cards.map((_, i) => ({id: 'widget-' + i, wide: false}));
    return '<section class="pm-dashboard" data-pm-dashboard aria-label="'+esc(data.title)+'"><header><h2>'+esc(data.title)+'</h2><p class="pm-data-scope">'+esc(data.scopeLabel)+'</p></header><div class="pm-widget-grid qa-widget-grid" data-pm-widgets>'+order.map(row => cards[Number(row.id.slice(-1))].replace('class="pm-widget surface"', 'class="pm-widget surface'+(row.wide?' qa-widget-expanded':'')+'"')).join('')+'</div></section>';
  }
  function smoothPath(points, width = 320, height = 112) {
    if (!points.length) return {d: '', xy: []};
    const xy = points.map((value, i) => [4 + i / Math.max(1, points.length - 1) * (width - 8), 8 + (1 - clamp(value, -.05, 1.05)) * (height - 16)]);
    let d = 'M'+xy[0].map(v => v.toFixed(2)).join(' ');
    for (let i = 0; i < xy.length - 1; i++) { const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2; d += ' C'+(p1[0]+(p2[0]-p0[0])/6).toFixed(2)+' '+(p1[1]+(p2[1]-p0[1])/6).toFixed(2)+' '+(p2[0]-(p3[0]-p1[0])/6).toFixed(2)+' '+(p2[1]-(p3[1]-p1[1])/6).toFixed(2)+' '+p2.map(v=>v.toFixed(2)).join(' '); }
    return {d, xy};
  }
  function mountChart(host, input, options, metric = false) {
    const ctx = scope(options), original = [...host.childNodes];
    host.replaceChildren(); host.classList.add('pm-chart-card');
    const value = element('strong', 'pm-stat-value'), change = element('span', 'pm-stat-change'), tabs = element('div', 'pm-periods');
    tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '조회 기간');
    const pill = element('span', 'pm-period-pill'); pill.setAttribute('aria-hidden', 'true'); tabs.append(pill);
    const plot = element('div', 'pm-plot'), svg = svgEl('svg', {viewBox:'0 0 320 112', 'aria-hidden':true});
    const area = svgEl('path', {class:'pm-graph-area'}), line = svgEl('path', {class:'pm-graph-line', fill:'none'}), dot = svgEl('circle', {r:4, class:'pm-graph-dot'});
    const cursor = svgEl('line', {class:'pm-graph-cursor', y1:0, y2:112}), band = svgEl('rect', {class:'pm-graph-range', y:0, height:112});
    cursor.style.display = band.style.display = 'none'; svg.append(band, area, line, cursor, dot); plot.append(svg);
    const tip = element('output', 'pm-graph-tip'), empty = element('p', 'pm-data-empty', '표시할 데이터가 없습니다.'); tip.hidden = true; plot.append(tip, empty);
    const reading = element('p', 'pm-sr-only'); reading.setAttribute('aria-live', 'polite');
    host.append(tabs, value, change, plot, reading);
    if (metric) { plot.tabIndex = 0; plot.setAttribute('role', 'group'); plot.setAttribute('aria-label', '기간별 그래프. 방향키로 값을 확인하고 Shift와 함께 눌러 범위를 선택하세요.'); }
    let data, index = 0, points = [], buttons = [], selection = null, range = null, pointer = null, epoch = 0;
    const total = spring(0, 160, 22), delta = spring(0, 160, 22), left = spring(0, 380, 30), width = spring(0, 380, 30);
    const current = () => data?.periods[index];
    function paintReadout() {
      const p = current();
      if (!p || selection === null || !p.points[selection]) { tip.hidden = true; cursor.style.display = band.style.display = 'none'; return; }
      const at = p.points[selection], x = 4 + selection / Math.max(1, p.points.length - 1) * 312;
      cursor.style.display = ''; cursor.setAttribute('x1', x); cursor.setAttribute('x2', x);
      let text = at.label+' · '+number(at.value)+data.unit+(at.note?' · '+at.note:'');
      if (range) { const [a,b] = [Math.min(...range),Math.max(...range)]; const sum = p.points.slice(a,b+1).reduce((n,v)=>n+v.value,0); text = p.points[a].label+' – '+p.points[b].label+' · 합계 '+number(sum)+data.unit; band.style.display = ''; band.setAttribute('x',4+a/Math.max(1,p.points.length-1)*312); band.setAttribute('width',(b-a)/Math.max(1,p.points.length-1)*312); } else band.style.display = 'none';
      tip.hidden = false; tip.textContent = text; tip.style.left = clamp(x / 320 * 100, 18, 82)+'%'; reading.textContent = text;
    }
    const kick = loop(ctx, () => [...points, total, delta, left, width], () => {
      const p = current(), shape = smoothPath(points.map(p=>p.x)); line.setAttribute('d',shape.d); area.setAttribute('d',shape.d && shape.d+' L316 112 L4 112 Z');
      const tail = shape.xy.at(-1); dot.style.display = tail?'':'none'; if(tail){dot.setAttribute('cx',tail[0]);dot.setAttribute('cy',tail[1]);}
      value.textContent = p && p.total !== null ? number(ctx.reduced()?p.total:total.x)+data.unit : '—';
      change.textContent = p && p.change !== null ? (delta.x > 0 ? '+':'')+number(ctx.reduced()?p.change:delta.x)+'%' : '';
      pill.style.transform = 'translateX('+left.x.toFixed(2)+'px)'; pill.style.width = width.x.toFixed(2)+'px';
      paintReadout();
    });
    function choose(next, immediate = false) {
      index = clamp(next, 0, Math.max(0,data.periods.length-1)); epoch++; selection = range = pointer = null;
      const p = current(); empty.hidden = Boolean(p?.points.length); svg.style.visibility = p?.points.length?'visible':'hidden';
      buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
      const selected = buttons[index]; left.t = selected?.offsetLeft || 0; width.t = selected?.offsetWidth || 0;
      if(immediate){left.x=left.t;width.x=width.t;}
      total.t = p?.total ?? 0; delta.t = p?.change ?? 0;
      const values = p?.points.map(p=>p.value) || [], min = Math.min(0,...values), max = Math.max(1,...values), span = Math.max(1,max-min);
      points = values.map((v,i)=>{const s=points[i]||spring(0,200,17);s.t=(v-min)/span;s.wait=metric?0:i*.03;return s;});
      host.dataset.period = p?.id || ''; kick();
    }
    function update(next) {
      const oldId = current()?.id; data = normalizeData(next); for(const b of buttons)b.remove();
      buttons = data.periods.map((p,i)=>{const b=button(p.label);b.setAttribute('role','tab');b.dataset.period=p.id;ctx.on(b,'click',()=>choose(i));ctx.on(b,'keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;choose(n);buttons[n].focus();});tabs.append(b);return b;});
      tabs.hidden = buttons.length < 2; choose(Math.max(0,data.periods.findIndex(p=>p.id===oldId)),true);
    }
    const atX = x => { const p=current(),r=plot.getBoundingClientRect(); if(!p?.points.length)return null; const f=clamp((x-r.left)/Math.max(1,r.width),0,1), pin=p.points.findIndex((point,i)=>point.note&&Math.abs((i/Math.max(1,p.points.length-1)-f)*r.width)<12); return pin>=0?pin:Math.round(f*(p.points.length-1)); };
    if(metric){
      ctx.on(plot,'pointerdown',e=>{if(e.button!==0)return;selection=atX(e.clientX);pointer={id:e.pointerId,anchor:selection};range=null;plot.setPointerCapture?.(e.pointerId);paintReadout();});
      ctx.on(plot,'pointermove',e=>{if(!pointer&&e.pointerType!=='mouse')return;if(pointer&&pointer.id!==e.pointerId)return;selection=atX(e.clientX);if(pointer&&selection!==null&&selection!==pointer.anchor)range=[pointer.anchor,selection];paintReadout();});
      const release=e=>{if(pointer&&pointer.id!==e.pointerId)return;pointer=null;if(e.pointerType!=='mouse'&&!range)selection=null;paintReadout();};
      ctx.on(plot,'pointerup',release);ctx.on(plot,'pointercancel',release);ctx.on(plot,'lostpointercapture',release);
      ctx.on(plot,'pointerleave',()=>{if(!pointer&&!range){selection=null;paintReadout();}});
      ctx.on(plot,'keydown',e=>{const last=(current()?.points.length||0)-1;if(e.key==='Escape'){selection=range=null;paintReadout();return;}if(last<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const from=selection??last;selection=e.key==='Home'?0:e.key==='End'?last:clamp(from+(e.key==='ArrowRight'?1:-1),0,last);range=e.shiftKey?[range?.[0]??from,selection]:null;paintReadout();});
    }
    ctx.observe([tabs,host],()=>{const b=buttons[index];left.t=b?.offsetLeft||0;width.t=b?.offsetWidth||0;kick();});
    update(input);
    return {update,destroy(){ctx.destroy();host.replaceChildren(...original);host.classList.remove('pm-chart-card');delete host.dataset.period;}};
  }

  function mountRing(host, input, options) {
    const ctx=scope(options), original=[...host.childNodes];host.replaceChildren();host.classList.add('pm-ring-card');
    const wheel=element('div','pm-ring-wheel');wheel.tabIndex=0;wheel.setAttribute('role','slider');wheel.setAttribute('aria-label','분류별 현황. 방향키 또는 드래그로 선택');
    const svg=svgEl('svg',{viewBox:'0 0 240 240','aria-hidden':true}),group=svgEl('g'),marker=svgEl('path',{d:'M115 2 L125 2 L120 8 Z',class:'pm-ring-marker'});
    svg.append(group,marker);const readout=element('div','pm-ring-readout'),label=element('span'),amount=element('strong'),share=element('small');readout.append(label,amount,share);wheel.append(svg,readout);
    const legend=element('div','pm-ring-legend'),empty=element('p','pm-data-empty','표시할 분류 데이터가 없습니다.');host.append(wheel,legend,empty);
    let data,spans=[],paths=[],buttons=[],selected=0,drag=null;const angle=spring(0,121,2*.78*11);
    const wrap=deg=>(((deg+180)%360)+360)%360-180;
    const at=deg=>{const n=((deg%360)+360)%360;return Math.max(0,spans.findIndex(s=>n>=s.from&&n<s.to));};
    const polar=a=>[120+90*Math.sin(a*Math.PI/180),120-90*Math.cos(a*Math.PI/180)];
    const arc=(a,b)=>{const from=polar(a),to=polar(b);return 'M'+from.join(' ')+' A90 90 0 '+(b-a>180?1:0)+' 1 '+to.join(' ');};
    const paint=()=>{group.setAttribute('transform','rotate('+angle.x.toFixed(3)+' 120 120)');paths.forEach((p,i)=>{p.setAttribute('stroke-width',i===selected?'30':'22');p.setAttribute('opacity',i===selected?'1':'.42');});const item=data.segments[selected],total=data.segments.reduce((n,s)=>n+s.amount,0);label.textContent=item?.label||'';amount.textContent=item?number(item.amount)+data.unit:'';share.textContent=item&&total?number(item.amount/total*100)+'%':'';wheel.setAttribute('aria-valuemin','1');wheel.setAttribute('aria-valuemax',String(data.segments.length));wheel.setAttribute('aria-valuenow',String(selected+1));wheel.setAttribute('aria-valuetext',item?item.label+' '+number(item.amount)+data.unit:'데이터 없음');buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));};
    const kick=loop(ctx,()=>drag?[]:[angle],paint);
    function select(i,rest=angle.x){if(!spans.length)return;selected=clamp(i,0,spans.length-1);const goal=-spans[selected].mid;angle.t=rest+wrap(goal-rest);kick();}
    function update(next){const oldId=data?.segments[selected]?.id;data=normalizeData(next);const total=data.segments.reduce((n,s)=>n+s.amount,0);let start=0;spans=data.segments.map(s=>{const length=total?s.amount/total*360:0,span={from:start,to:start+length,mid:start+length/2};start+=length;return span;});group.replaceChildren();legend.replaceChildren();paths=spans.map((s,i)=>{const gap=Math.min(2.4,(s.to-s.from)*.35);const p=svgEl('path',{d:s.to>s.from?arc(s.from+gap/2,s.to-gap/2):'',fill:'none',stroke:data.segments[i].color});group.append(p);return p;});buttons=data.segments.map((s,i)=>{const b=button(s.label+' · '+number(s.amount)+data.unit);b.style.setProperty('--segment-color',s.color);ctx.on(b,'click',()=>select(i));legend.append(b);return b;});selected=Math.max(0,data.segments.findIndex(s=>s.id===oldId));angle.x=angle.t=-(spans[selected]?.mid||0);angle.v=0;wheel.hidden=legend.hidden=!total;empty.hidden=Boolean(total);paint();}
    const pointerAngle=e=>{const r=wheel.getBoundingClientRect();return Math.atan2(e.clientX-r.left-r.width/2,-(e.clientY-r.top-r.height/2))*180/Math.PI;};
    ctx.on(wheel,'pointerdown',e=>{if(e.button!==0||drag||!spans.length)return;wheel.setPointerCapture?.(e.pointerId);angle.v=0;drag={id:e.pointerId,angle:pointerAngle(e),time:e.timeStamp,moved:0,x:e.clientX,y:e.clientY,start:angle.x};wheel.dataset.dragging='true';});
    ctx.on(wheel,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;drag.moved=Math.max(drag.moved,Math.hypot(e.clientX-drag.x,e.clientY-drag.y));if(drag.moved<5)return;const a=pointerAngle(e),d=wrap(a-drag.angle),dt=Math.max((e.timeStamp-drag.time)/1000,1/240);angle.x+=d;angle.v=angle.v*.6+(d/dt)*.4;drag.angle=a;drag.time=e.timeStamp;selected=at(-angle.x);paint();});
    const release=e=>{if(!drag||e.pointerId!==drag.id)return;const saved=drag;drag=null;delete wheel.dataset.dragging;if(e.type==='pointercancel'){angle.v=0;select(at(-saved.start),saved.start);return;}if(saved.moved<5){const r=wheel.getBoundingClientRect(),radius=Math.hypot(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);if(radius>(90-22)/240*r.width)select(at(pointerAngle(e)-angle.x));else select(selected);return;}if(e.timeStamp-saved.time>80)angle.v=0;angle.v=clamp(angle.v,-1440,1440);const rest=angle.x+angle.v*.2;select(at(-rest),rest);};
    ctx.on(wheel,'pointerup',release);ctx.on(wheel,'pointercancel',release);ctx.on(wheel,'lostpointercapture',release);
    ctx.on(wheel,'keydown',e=>{if(!spans.length||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();select(e.key==='Home'?0:e.key==='End'?spans.length-1:(selected+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+spans.length)%spans.length);});
    update(input);return {update,destroy(){ctx.destroy();host.replaceChildren(...original);host.classList.remove('pm-ring-card');}};
  }

  function mountNav(nav, options) {
    const ctx=scope(options), indicator=element('span','pm-nav-indicator'), tip=element('span','pm-nav-tooltip');
    indicator.setAttribute('aria-hidden','true');tip.setAttribute('aria-hidden','true');nav.classList.add('pm-motion-nav');nav.append(indicator,tip);
    const left=spring(0,620,36),right=spring(0,620,36),top=spring(0,380,28),height=spring(0,380,28),alpha=spring(0,420,24);
    let active=null,hiddenTimer=0,started=false;const learned=[];
    const items=()=>[...nav.querySelectorAll('a,button')].filter(el=>!el.disabled&&!el.closest('[hidden],[inert]')&&!el.matches('[data-action=collapse],[data-qa-action=collapse-sidebar]'));
    const decorate=()=>{for(const el of items()){if(el.matches('[aria-expanded]')||el.querySelector('.t-learn-chevron'))continue;const original=el.classList.contains('t-learn'),tail=element('span','t-learn-chevron pm-nav-tail');tail.setAttribute('aria-hidden','true');tail.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path class="t-learn-arm t-learn-arm-top" d="M6 4L10 8"/><path class="t-learn-arm t-learn-arm-bot" d="M10 8L6 12"/></svg>';el.classList.add('t-learn');el.append(tail);learned.push({el,tail,original});}};
    const kick=loop(ctx,()=>[left,right,top,height,alpha],()=>{indicator.style.transform='translate3d('+left.x.toFixed(2)+'px,'+top.x.toFixed(2)+'px,0)';indicator.style.width=Math.max(0,right.x-left.x).toFixed(2)+'px';indicator.style.height=Math.max(0,height.x).toFixed(2)+'px';indicator.style.opacity=clamp(alpha.x,0,1).toFixed(3);tip.style.left=((left.x+right.x)/2)+'px';tip.style.top=(top.x+height.x+8)+'px';tip.style.opacity=nav.dataset.pmCompact==='true'?clamp(alpha.x,0,1):'0';});
    function point(el, snap=false){if(!el||!nav.contains(el))return;ctx.clear(hiddenTimer);active=el;const box=nav.getBoundingClientRect(),r=el.getBoundingClientRect(),x=r.left-box.left+nav.scrollLeft,y=r.top-box.top+nav.scrollTop,dir=x-left.t>=0;left.k=dir?190:620;left.c=dir?19:36;right.k=dir?620:190;right.c=dir?36:19;left.t=x;right.t=x+r.width;top.t=y;height.t=r.height;alpha.t=1;tip.textContent=el.getAttribute('aria-label')||el.textContent.trim();if(snap||!started){for(const s of [left,right,top,height]){s.x=s.t;s.v=0;}started=true;}kick();}
    const current=()=>items().find(el=>el.getAttribute('aria-current')==='page'||el.getAttribute('aria-selected')==='true'||el.classList.contains('active')||el.classList.contains('is-active')||el.classList.contains('is-current')||el.classList.contains('on'));
    function leave(){ctx.clear(hiddenTimer);hiddenTimer=ctx.later(()=>{const selected=current();if(selected)point(selected);else{alpha.t=0;active=null;kick();}},140);}
    ctx.on(nav,'pointerover',e=>{const el=e.target.closest('a,button');if(items().includes(el))point(el);});ctx.on(nav,'focusin',e=>{if(items().includes(e.target))point(e.target);});
    ctx.on(nav,'pointerleave',leave);ctx.on(nav,'focusout',e=>{if(!nav.contains(e.relatedTarget))leave();});
    ctx.on(nav,'keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;const all=items(),i=all.indexOf(e.target);if(i<0)return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?all.length-1:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+all.length)%all.length;all[n]?.focus();});
    ctx.observe([nav],()=>point(active||current(),true));
    if(win.MutationObserver){const mo=new win.MutationObserver(records=>{if(records.every(r=>r.target===tip||indicator.contains(r.target)))return;if(!nav.contains(indicator))nav.append(indicator,tip);decorate();point(current(),true);});mo.observe(nav,{childList:true});ctx.cleanup(()=>mo.disconnect());}
    decorate();point(current(),true);ctx.cleanup(()=>{indicator.remove();tip.remove();nav.classList.remove('pm-motion-nav');for(const {el,tail,original}of learned){tail.remove();if(!original)el.classList.remove('t-learn');}});return {destroy:ctx.destroy};
  }

  function mountSidebar(root, options) {
    const side=root.querySelector('[data-pm-sidebar],.qa-admin-sidebar,.qa-admin-side,.ops-sidebar'),toggle=root.querySelector('[data-action=collapse],[data-action=collapse-sidebar],[data-qa-action=collapse],[data-qa-action=collapse-sidebar],[data-pm-collapse]');
    if(!side||!toggle)return {destroy(){},toggleDepth(){return false;}};
    const ctx=scope(options),panel=side.parentElement,nav=side.querySelector('nav'),originalStyle=side.getAttribute('style'),panelStyle=panel.getAttribute('style');
    const labels=[...side.querySelectorAll('[data-pm-label],.qa-nav-label,.qa-admin-nav-label,.qa-admin-nav-item>span:not(.qa-nav-depth),.ops-nav>span')].filter(el=>!el.querySelector('svg'));
    const measuredWidth=side.getBoundingClientRect().width,compactWidth=measuredWidth>0&&measuredWidth<100?measuredWidth:64;
    const initialClass=panel.getAttribute('class'),initialExpanded=toggle.getAttribute('aria-expanded');
    if(measuredWidth>0&&measuredWidth<100){panel.classList.add(panel.classList.contains('qa-admin')?'is-collapsed':'collapsed');toggle.setAttribute('aria-expanded','false');}
    const width=spring(measuredWidth||212,260,24),rotate=spring(0,300,22),opacity=labels.map(el=>({el,s:spring(1,300,26),style:el.getAttribute('style')}));
    const openWidth=Math.max(212,width.x),icon=toggle.querySelector('svg'),oldIcon=icon?.getAttribute('style'),isGrid=win.getComputedStyle?.(panel).display==='grid';
    const kick=loop(ctx,()=>[width,rotate,...opacity.map(l=>l.s)],()=>{side.style.width=width.x.toFixed(2)+'px';side.style.flexBasis=width.x.toFixed(2)+'px';if(isGrid)panel.style.gridTemplateColumns=width.x.toFixed(2)+'px minmax(0,1fr)';if(icon)icon.style.transform='rotate('+(180*rotate.x).toFixed(2)+'deg)';for(const {el,s} of opacity){el.style.opacity=clamp(s.x,0,1);el.style.transform='translateX('+((1-clamp(s.x,0,1))*-10).toFixed(2)+'px)';} });
    const sync=()=>{const open=toggle.getAttribute('aria-expanded')!=='false';width.t=open?openWidth:compactWidth;rotate.t=open?0:1;if(nav)nav.dataset.pmCompact=String(!open);opacity.forEach(({s},i)=>{s.t=open?1:0;s.wait=open?.06+i*.04:0;});kick();};
    ctx.on(root,'click',e=>{if(e.target.closest('button')===toggle)ctx.later(sync,0);});
    if(win.MutationObserver){const mo=new win.MutationObserver(sync);mo.observe(toggle,{attributes:true,attributeFilter:['aria-expanded']});ctx.cleanup(()=>mo.disconnect());}
    sync();ctx.cleanup(()=>{if(originalStyle===null)side.removeAttribute('style');else side.setAttribute('style',originalStyle);if(panelStyle===null)panel.removeAttribute('style');else panel.setAttribute('style',panelStyle);for(const {el,style}of opacity){if(style===null)el.removeAttribute('style');else el.setAttribute('style',style);}if(icon){if(oldIcon===null)icon.removeAttribute('style');else icon.setAttribute('style',oldIcon);}if(nav)delete nav.dataset.pmCompact;if(initialClass===null)panel.removeAttribute('class');else panel.setAttribute('class',initialClass);if(initialExpanded===null)toggle.removeAttribute('aria-expanded');else toggle.setAttribute('aria-expanded',initialExpanded);});
    return {destroy:ctx.destroy};
  }

  function mountDepth(root, options) {
    const ctx=scope(options),records=[];
    for(const trigger of root.querySelectorAll('[data-action=submenu],[data-action=toggle-submenu],[data-qa-action=submenu],[data-qa-action=toggle-submenu],[data-pm-depth]')){
      const id=trigger.getAttribute('aria-controls'),sub=(id?[...root.querySelectorAll('[id]')].find(el=>el.id===id):null)||root.querySelector('.ops-subnav,#qa-admin-submenu');
      if(!sub||records.some(r=>r.sub===sub))continue;
      const old={parent:sub.parentElement,next:sub.nextSibling,hidden:sub.hidden,inert:sub.inert},group=element('div','t-acc pm-depth'),track=element('div','t-acc-panel'),inner=element('div','t-acc-panel-inner');
      sub.before(group);group.append(track);track.append(inner);inner.append(sub);sub.hidden=false;const open=trigger.getAttribute('aria-expanded')==='true';group.dataset.open=String(open);sub.inert=!open;sub.setAttribute('aria-hidden',String(!open));records.push({trigger,sub,old,group});
      const icon=trigger.querySelector('svg:last-child');if(icon){icon.classList.add('pm-depth-chevron');icon.style.transform=open?'scaleY(-1)':'scaleY(1)';}
    }
    function toggle(trigger){const row=records.find(r=>r.trigger===trigger);if(!row)return false;const open=trigger.getAttribute('aria-expanded')!=='true';trigger.setAttribute('aria-expanded',String(open));row.group.dataset.open=String(open);row.sub.inert=!open;row.sub.setAttribute('aria-hidden',String(!open));row.sub.classList.toggle('is-open',open);const icon=trigger.querySelector('.pm-depth-chevron');if(icon)icon.style.transform=open?'scaleY(-1)':'scaleY(1)';return true;}
    for(const el of root.querySelectorAll('[data-pm-learn],.ops-learn-more,.qa-learn-more')){
      if(el.querySelector('.t-learn-chevron'))continue;el.classList.add('t-learn');const span=element('span','t-learn-chevron');span.setAttribute('aria-hidden','true');span.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path class="t-learn-arm t-learn-arm-top" d="M6 4L10 8"/><path class="t-learn-arm t-learn-arm-bot" d="M10 8L6 12"/></svg>';el.append(span);ctx.cleanup(()=>{span.remove();el.classList.remove('t-learn');});
    }
    ctx.cleanup(()=>{for(const row of records){row.group.before(row.sub);row.group.remove();row.sub.hidden=row.old.hidden;row.sub.inert=row.old.inert;const icon=row.trigger.querySelector('.pm-depth-chevron');icon?.classList.remove('pm-depth-chevron');icon?.style.removeProperty('transform');}});
    return {toggle,destroy:ctx.destroy};
  }

  function validLayout(layout, ids) {
    return Array.isArray(layout)&&layout.length===ids.length&&layout.every(r=>r&&typeof r.id==='string'&&ids.includes(r.id)&&typeof r.wide==='boolean')&&new Set(layout.map(r=>r.id)).size===ids.length;
  }
  function mountWidgets(grid, options = {}) {
    const ctx=scope(options),cards=[...grid.children].filter(el=>el.nodeType===1),ids=cards.map((card,i)=>card.dataset.widgetId||'widget-'+i);
    if(!cards.length||new Set(ids).size!==ids.length)return {destroy(){},restoreLayout(){return false;}};
    const tools=element('div','qa-widget-edit pm-widget-edit'),edit=button('위젯 배치','btn text'),controls=element('span'),select=element('select'),status=element('p','pm-layout-status'),hint=element('p','pm-sr-only');
    edit.dataset.layout='edit';select.setAttribute('aria-label','배치를 바꿀 위젯');hint.id='pm-layout-help-'+Math.random().toString(36).slice(2);hint.textContent='이동 손잡이에서 Space 또는 Enter로 들고 방향키로 이동하세요. Escape는 이동을 취소합니다. 배치 적용을 눌러 저장합니다.';
    const make=(label,action)=>{const b=button(label,'btn text');b.dataset.layout=action;controls.append(b);return b;};controls.append(select);const back=make('앞으로','back'),forward=make('뒤로','forward'),size=make('너비 변경','size'),save=make('배치 적용','save'),cancel=make('취소','cancel'),retry=button('배치 다시 불러오기','btn text');retry.hidden=true;
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');controls.hidden=true;tools.append(edit,controls,retry,status,hint);grid.before(tools);grid.classList.add('pm-bento');
    const originalStyles=cards.map(card=>card.getAttribute('style')),originalIds=cards.map(card=>card.getAttribute('data-widget-id'));
    const bodies=cards.map(()=>({x:spring(0,420,2*Math.sqrt(420)*.76),y:spring(0,420,2*Math.sqrt(420)*.76),sx:spring(1,420,2*Math.sqrt(420)*.76),sy:spring(1,420,2*Math.sqrt(420)*.76),lift:spring(0,520,2*Math.sqrt(520)*.82),rx:spring(0,260,2*Math.sqrt(260)*.6),ry:spring(0,260,2*Math.sqrt(260)*.6)}));
    const grips=[],resizers=[];let editing=false,snapshot=null,drag=null,revision=0,busy=false,loaded=!options.loadLayout,loadEpoch=0,writeKey=null,suppressResize=null;
    const layout=()=>[...grid.children].filter(card=>cards.includes(card)).map(card=>({id:card.dataset.widgetId,wide:card.classList.contains('qa-widget-expanded')}));
    function base(card){return {left:card.offsetLeft,top:card.offsetTop,width:card.offsetWidth||card.getBoundingClientRect().width||1,height:card.offsetHeight||card.getBoundingClientRect().height||1};}
    const measure=()=>new Map(cards.map((card,i)=>{const r=base(card),b=bodies[i];return [card,{left:r.left+b.x.x,top:r.top+b.y.x,width:r.width*b.sx.x,height:r.height*b.sy.x}];}));
    const kick=loop(ctx,()=>bodies.flatMap((body,i)=>Object.entries(body).filter(([key])=>!drag||drag.card!==cards[i]||!['x','y'].includes(key)||drag.mode!=='pointer').map(([,s])=>s)),()=>{cards.forEach((card,i)=>{const b=bodies[i];card.style.transform='translate3d('+b.x.x.toFixed(2)+'px,'+b.y.x.toFixed(2)+'px,'+(b.lift.x*18).toFixed(2)+'px) rotateX('+b.rx.x.toFixed(2)+'deg) rotateY('+b.ry.x.toFixed(2)+'deg) scale('+b.sx.x.toFixed(4)+','+b.sy.x.toFixed(4)+')';card.style.boxShadow=b.lift.x>.01?'0 '+(6+b.lift.x*14).toFixed(1)+'px '+(16+b.lift.x*20).toFixed(1)+'px #14213d24':'';});});
    function flip(before,moved){const origin=base(moved||cards[0]);cards.forEach((card,i)=>{const prev=before.get(card),next=base(card),b=bodies[i];if(!prev)return;b.x.x=prev.left-next.left;b.y.x=prev.top-next.top;b.sx.x=prev.width/next.width;b.sy.x=prev.height/next.height;if(card!==moved){const delay=Math.min(.1,Math.hypot(next.left-origin.left,next.top-origin.top)*.00016);b.x.wait=b.y.wait=delay;}});kick();}
    function apply(entries,animate=true,moved){if(!validLayout(entries,ids))return false;const before=measure();for(const entry of entries){const card=cards[ids.indexOf(entry.id)];grid.append(card);card.classList.toggle('qa-widget-expanded',entry.wide);}if(animate)flip(before,moved);else{for(const body of bodies)for(const [k,s]of Object.entries(body)){s.x=s.t=k==='sx'||k==='sy'?1:0;s.v=0;}kick();}return true;}
    function announce(text){status.textContent=text;}
    function setBusy(value){busy=value;grid.setAttribute('aria-busy',String(value));for(const b of [edit,back,forward,size,save,cancel,...grips,...resizers])b.disabled=value||(!loaded&&b===edit);save.disabled=value||!options.saveLayout;select.disabled=value;}
    function setEdit(value){editing=value;edit.hidden=value;controls.hidden=!value;grid.dataset.editing=String(value);for(const b of [...grips,...resizers])b.hidden=!value;if(value){snapshot=layout();select.focus();}else edit.focus();}
    function reorder(card,to){const rows=layout(),from=rows.findIndex(r=>r.id===card.dataset.widgetId),next=clamp(to,0,rows.length-1);if(from===next)return;const [entry]=rows.splice(from,1);rows.splice(next,0,entry);apply(rows,true,card);announce((card.querySelector('h2')?.textContent||'위젯')+' '+(next+1)+'번째 위치');}
    function resize(card,wide){const rows=layout();rows.find(r=>r.id===card.dataset.widgetId).wide=wide;apply(rows,true,card);announce(wide?'위젯을 넓게 표시합니다.':'위젯을 기본 너비로 표시합니다.');}
    function endDrag(cancelled=false){if(!drag)return;const current=drag,body=bodies[cards.indexOf(current.card)];drag=null;body.lift.t=body.rx.t=body.ry.t=0;body.x.t=body.y.t=0;if(current.mode==='pointer'&&!cancelled){body.x.v=(current.vx||0)*400;body.y.v=(current.vy||0)*400;}if(cancelled)apply(current.snapshot,true,current.card);current.card.classList.remove('pm-widget-lifted');current.grip?.setAttribute('aria-pressed','false');current.grip?.focus({preventScroll:true});announce(cancelled?'위젯 이동을 취소했습니다.':'위젯 위치를 바꿨습니다. 배치 적용으로 저장하세요.');kick();}
    cards.forEach((card,i)=>{card.dataset.widgetId=ids[i];const title=card.querySelector('h2')?.textContent||'위젯 '+(i+1);const option=element('option','',title);option.value=String(i);select.append(option);const grip=button('⠿','pm-widget-grip'),resizer=button('↔','pm-widget-resizer');grip.dataset.widgetGrip=ids[i];grip.setAttribute('aria-label',title+' 이동');grip.setAttribute('aria-describedby',hint.id);grip.setAttribute('aria-pressed','false');resizer.dataset.widgetResize=ids[i];resizer.setAttribute('aria-label',title+' 너비 변경');grip.hidden=resizer.hidden=true;card.append(grip,resizer);grips.push(grip);resizers.push(resizer);
      ctx.on(grip,'pointerdown',e=>{if(!editing||busy||e.button!==0||drag)return;e.preventDefault();const r=card.getBoundingClientRect(),body=bodies[i];drag={mode:'pointer',id:e.pointerId,card,grip,snapshot:layout(),grabX:e.clientX-r.left,grabY:e.clientY-r.top,x:e.clientX,y:e.clientY,time:e.timeStamp,vx:0,vy:0};grip.setPointerCapture?.(e.pointerId);grip.setAttribute('aria-pressed','true');card.classList.add('pm-widget-lifted');body.lift.t=1;kick();});
      ctx.on(grip,'keydown',e=>{if(!editing||busy)return;if([' ','Enter'].includes(e.key)){e.preventDefault();if(drag?.card===card){endDrag();return;}if(drag)return;drag={mode:'keyboard',card,grip,snapshot:layout()};bodies[i].lift.t=1;grip.setAttribute('aria-pressed','true');card.classList.add('pm-widget-lifted');announce(title+' 선택. 방향키로 위치를 바꾸세요.');kick();return;}if(drag?.card!==card||drag.mode!=='keyboard')return;if(e.key==='Escape'){e.preventDefault();endDrag(true);}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const from=layout().findIndex(r=>r.id===ids[i]);reorder(card,e.key==='Home'?0:e.key==='End'?cards.length-1:from+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1));grip.focus({preventScroll:true});}});
      ctx.on(resizer,'keydown',e=>{if(!editing||busy||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();resize(card,e.key==='ArrowRight');});
      ctx.on(resizer,'click',e=>{if(suppressResize===resizer){suppressResize=null;e.preventDefault();return;}if(editing&&!busy&&!drag)resize(card,!card.classList.contains('qa-widget-expanded'));});
      ctx.on(resizer,'pointerdown',e=>{if(!editing||busy||e.button!==0||drag)return;e.preventDefault();drag={mode:'resize',id:e.pointerId,card,grip:resizer,snapshot:layout(),startX:e.clientX,width:base(card).width,moved:false};resizer.setPointerCapture?.(e.pointerId);});
    });
    ctx.on(win,'pointermove',e=>{if(!drag||drag.id!==e.pointerId||!['pointer','resize'].includes(drag.mode))return;e.preventDefault();if(drag.mode==='resize'){if(Math.abs(e.clientX-drag.startX)<12)return;drag.moved=true;const wide=drag.width+e.clientX-drag.startX>(grid.clientWidth||grid.getBoundingClientRect().width)*.65;if(wide!==drag.card.classList.contains('qa-widget-expanded'))resize(drag.card,wide);return;}const box=grid.getBoundingClientRect(),body=bodies[cards.indexOf(drag.card)],rect=base(drag.card),dt=Math.max(1,e.timeStamp-drag.time);drag.vx+=( (e.clientX-drag.x)/dt-drag.vx)*.35;drag.vy+=( (e.clientY-drag.y)/dt-drag.vy)*.35;drag.x=e.clientX;drag.y=e.clientY;drag.time=e.timeStamp;body.x.x=e.clientX-box.left-drag.grabX-rect.left;body.y.x=e.clientY-box.top-drag.grabY-rect.top;body.rx.t=clamp(-drag.vy*9,-8,8);body.ry.t=clamp(drag.vx*9,-8,8);const hit=[...grid.children].find(card=>{if(card===drag.card||!cards.includes(card))return false;const r=base(card),x=e.clientX-box.left,y=e.clientY-box.top;return x>=r.left&&x<=r.left+r.width&&y>=r.top&&y<=r.top+r.height;});if(hit){reorder(drag.card,[...grid.children].indexOf(hit));const after=base(drag.card);body.x.x=e.clientX-box.left-drag.grabX-after.left;body.y.x=e.clientY-box.top-drag.grabY-after.top;}kick();},{passive:false});
    ctx.on(win,'pointerup',e=>{if(drag?.id!==e.pointerId)return;const resizeDrag=drag.mode==='resize',moved=drag.moved,grip=drag.grip;endDrag();if(resizeDrag&&moved){suppressResize=grip;ctx.later(()=>{if(suppressResize===grip)suppressResize=null;},250);}});
    ctx.on(win,'pointercancel',e=>{if(drag?.id===e.pointerId)endDrag(true);});ctx.on(win,'keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();endDrag(true);}});
    ctx.on(tools,'click',async e=>{const action=e.target.closest('[data-layout]')?.dataset.layout;if(!action||busy)return;const card=cards[Number(select.value)];if(action==='edit'&&loaded){setEdit(true);return;}if(!editing)return;if(action==='back'||action==='forward')reorder(card,layout().findIndex(r=>r.id===card.dataset.widgetId)+(action==='back'?-1:1));if(action==='size')resize(card,!card.classList.contains('qa-widget-expanded'));if(action==='cancel'){endDrag(true);apply(snapshot);setEdit(false);announce('저장 전 배치로 되돌렸습니다.');}if(action==='save'&&options.saveLayout){endDrag();const desired=layout(),serialized=JSON.stringify(desired);if(writeKey?.serialized!==serialized)writeKey={serialized,key:win.crypto?.randomUUID?.()||'layout-'+Date.now()+'-'+Math.random().toString(36).slice(2)};setBusy(true);announce('배치를 저장하고 있습니다.');try{const result=await options.saveLayout({revision,layout:desired,requestKey:writeKey.key},{signal:ctx.signal});if(ctx.signal.aborted)return;const entries=result?.data?.layout||result?.layout;if(!validLayout(entries,ids)||JSON.stringify(entries)!==serialized)throw Error('LAYOUT_READBACK_MISMATCH');revision=result.revision??revision;apply(entries,false);writeKey=null;setEdit(false);announce('배치를 저장했습니다.');}catch(error){if(!ctx.signal.aborted)announce(error?.message==='REVISION_CONFLICT'?'다른 곳에서 배치가 변경되었습니다. 다시 불러온 후 적용해 주세요.':'배치를 저장하지 못했습니다. 다시 시도할 수 있습니다.');}finally{if(!ctx.signal.aborted)setBusy(false);}}});
    async function load(){const current=++loadEpoch;loaded=false;setBusy(true);retry.hidden=true;try{const result=await options.loadLayout({signal:ctx.signal});if(ctx.signal.aborted||current!==loadEpoch)return;const entries=result?.data?.layout||result?.layout;if(entries&&!apply(entries,false))throw Error('INVALID_LAYOUT');revision=result?.revision??0;loaded=true;announce('저장된 배치를 불러왔습니다.');}catch{if(!ctx.signal.aborted){retry.hidden=false;announce('저장된 배치를 불러오지 못했습니다. 다시 시도해 주세요.');}}finally{if(!ctx.signal.aborted&&current===loadEpoch)setBusy(false);}}
    ctx.on(retry,'click',load);if(options.loadLayout)load();else setBusy(false);
    const restoreLayout=value=>{if(editing||busy)return false;const entries=Array.isArray(value)?value:value?.data?.layout||value?.layout;if(value?.revision!==undefined)revision=value.revision;return apply(entries,false);};
    ctx.cleanup(()=>{drag=null;tools.remove();for(const b of [...grips,...resizers])b.remove();cards.forEach((card,i)=>{card.classList.remove('pm-widget-lifted');if(originalStyles[i]===null)card.removeAttribute('style');else card.setAttribute('style',originalStyles[i]);if(originalIds[i]===null)card.removeAttribute('data-widget-id');else card.setAttribute('data-widget-id',originalIds[i]);});grid.classList.remove('pm-bento');grid.removeAttribute('aria-busy');delete grid.dataset.editing;});
    return {destroy:ctx.destroy,restoreLayout,getLayout:layout};
  }

  function mountScrollIndex(root, options = {}) {
    const region=root.querySelector(options.regionSelector||'.terms-body'),content=region?.querySelector('[data-policy-content]')||region;
    if(!region||!content)return {destroy(){},refresh(){},jump(){}};
    const ctx=scope(options),rail=element('nav','pm-scroll-index'),head=element('span','pm-scroll-head'),label=element('span','pm-scroll-label');rail.setAttribute('aria-label','문서 목차');head.setAttribute('aria-hidden','true');label.setAttribute('aria-hidden','true');rail.append(head,label);region.parentElement.append(rail);region.parentElement.classList.add('pm-index-reading');
    let list=[],ticks=[],height=280,end=1,hover=null,drag=null,raf=0,tween=0,flash=0,active=-1,painted=false;const swell=[];
    const current=()=>{let n=0;list.forEach((s,i)=>{if(s.at<=region.scrollTop+1)n=i;});return n;};
    const nearest=y=>{let index=-1,distance=Infinity;list.forEach((s,i)=>{const d=Math.abs(s.pos*height-y);if(d<distance){index=i;distance=d;}});return {index,distance};};
    const placeLabel=(index,visible)=>{const s=list[index];label.textContent=s?.text||'';label.style.opacity=s&&visible?'1':'0';if(s)label.style.transform='translateY('+(s.pos*height).toFixed(1)+'px) translateY(-50%)';};
    function paint(){raf=0;head.style.transform='translateY('+(clamp(region.scrollTop/end,0,1)*height).toFixed(1)+'px)';const next=current();if(next!==active){active=next;ticks.forEach((tick,i)=>{tick.dataset.position=i<active?'passed':i===active?'current':'ahead';tick.tabIndex=i===active?0:-1;if(i===active)tick.setAttribute('aria-current','location');else tick.removeAttribute('aria-current');});if(painted&&hover===null&&!drag){placeLabel(active,true);ctx.clear(flash);flash=ctx.later(()=>{if(hover===null&&!drag)placeLabel(-1,false);},900);}}let moving=false;ticks.forEach((tick,i)=>{const y=list[i].pos*height,target=hover===null||ctx.reduced()?1:1+1.6*Math.exp(-((hover-y)**2)/(2*26*26)),value=(swell[i]??1)+(target-(swell[i]??1))*.35;swell[i]=Math.abs(value-target)<.005?target:value;moving||=swell[i]!==target;tick.style.setProperty('--swell',swell[i].toFixed(3));});painted=true;if(moving)schedule();}
    function schedule(){if(!raf)raf=ctx.frame(paint);}
    function stop(){ctx.cancel(tween);tween=0;}
    function jump(index){const target=list[index];if(!target)return;stop();const from=region.scrollTop,to=target.at;if(ctx.reduced()||Math.abs(to-from)<2){region.scrollTop=to;schedule();return;}const start=win.performance.now(),duration=clamp(260+Math.abs(to-from)*.12,300,650);const tick=now=>{const t=Math.min(1,(now-start)/duration),ease=t<.5?8*t**4:1-(-2*t+2)**4/2;region.scrollTop=from+(to-from)*ease;schedule();if(t<1)tween=ctx.frame(tick);else tween=0;};tween=ctx.frame(tick);}
    function refresh(){const headings=[...content.querySelectorAll(options.headingSelector||'h2,h3')];end=Math.max(region.scrollHeight-region.clientHeight,1);height=Math.max(80,Math.min(280,(region.clientHeight||328)-48));rail.style.height=height+'px';const origin=region.getBoundingClientRect().top;list=headings.map(el=>{const at=clamp(el.getBoundingClientRect().top-origin+region.scrollTop-16,0,end);return {el,text:el.textContent.trim(),at,pos:at/end};});for(const tick of ticks)tick.remove();ticks=list.map((s,i)=>{const b=button('','pm-scroll-tick');b.setAttribute('aria-label',s.text);b.style.top=(s.pos*height)+'px';b.style.setProperty('--tick-width',s.el.tagName==='H2'?'18px':'12px');ctx.on(b,'click',()=>jump(i));ctx.on(b,'focus',()=>{hover=s.pos*height;placeLabel(i,true);schedule();});ctx.on(b,'blur',()=>{if(!drag){hover=null;placeLabel(-1,false);schedule();}});ctx.on(b,'keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?ticks.length-1:clamp(i+(e.key==='ArrowDown'?1:-1),0,ticks.length-1);ticks[next].focus();});rail.append(b);return b;});rail.hidden=list.length<2;active=-1;paint();}
    const yAt=e=>clamp(e.clientY-rail.getBoundingClientRect().top,0,height);
    ctx.on(rail,'pointerdown',e=>{if(drag||e.button!==0)return;e.preventDefault();rail.setPointerCapture?.(e.pointerId);stop();const y=yAt(e);drag={id:e.pointerId,y,t:e.timeStamp,v:0,moved:false};hover=y;rail.dataset.dragging='true';placeLabel(nearest(y).index,true);schedule();});
    ctx.on(rail,'pointermove',e=>{const y=yAt(e);if(drag&&drag.id===e.pointerId){drag.v=drag.v*.4+((y-drag.y)/Math.max(e.timeStamp-drag.t,1))*.6;drag.moved||=Math.abs(y-drag.y)>3;drag.y=y;drag.t=e.timeStamp;if(drag.moved)region.scrollTop=y/height*end;}else if(e.pointerType!=='mouse')return;hover=y;placeLabel(nearest(y).index,true);schedule();});
    const release=e=>{if(!drag||drag.id!==e.pointerId)return;const {moved,y,v}=drag;drag=null;delete rail.dataset.dragging;if(e.pointerType!=='mouse'){hover=null;placeLabel(-1,false);}const hit=nearest(moved?y+v*120:y);if(e.type!=='pointercancel'&&hit.index>=0&&(!moved||hit.distance<18))jump(hit.index);schedule();};
    ctx.on(rail,'pointerup',release);ctx.on(rail,'pointercancel',release);ctx.on(rail,'lostpointercapture',release);ctx.on(rail,'pointerleave',()=>{if(!drag){hover=null;placeLabel(-1,false);schedule();}});
    ctx.on(region,'scroll',schedule,{passive:true});ctx.on(region,'wheel',stop,{passive:true});ctx.on(region,'touchstart',stop,{passive:true});ctx.on(region,'keydown',e=>{if(['PageDown','PageUp','ArrowDown','ArrowUp','Home','End'].includes(e.key))stop();});ctx.observe([content,region],refresh);
    refresh();ctx.cleanup(()=>{stop();rail.remove();region.parentElement?.classList.remove('pm-index-reading');});return {destroy:ctx.destroy,refresh,jump};
  }

  function reserveGooeySpace(root, group, ctx) {
    // A fixed action must leave a reachable tail in the content's own scroll
    // surface. Padding on the outer QA/product root cannot extend a nested page.
    const surface=(root.matches('.page,.ops-main')?root:[...root.querySelectorAll('.page,.ops-main')].find(el=>!el.closest('.product-panel-body,.product-auth-sheet,.obm-panel,[role=dialog],[role=alertdialog]')))||root;
    const tail=element('div','pm-gooey-clearance');tail.setAttribute('aria-hidden','true');
    tail.style.cssText='display:block;width:100%;flex:0 0 auto;grid-column:1 / -1;pointer-events:none';surface.append(tail);
    let owner=null,prior=null,applied='';
    const restore=()=>{if(owner&&owner.style.getPropertyValue('scroll-padding-bottom')===applied){if(prior.value)owner.style.setProperty('scroll-padding-bottom',prior.value,prior.priority);else owner.style.removeProperty('scroll-padding-bottom');}};
    const refresh=()=>{
      let next=surface;while(next&&next!==doc.documentElement){const style=win.getComputedStyle(next);if(/auto|scroll|overlay/.test(style.overflowY||style.overflow))break;next=next.parentElement;}
      next=next&&next!==doc.documentElement?next:(doc.scrollingElement||doc.documentElement);
      if(next!==owner){restore();owner=next;prior={value:owner.style.getPropertyValue('scroll-padding-bottom'),priority:owner.style.getPropertyPriority('scroll-padding-bottom'),minimum:parseFloat(win.getComputedStyle(owner).scrollPaddingBottom)||0};}
      const style=win.getComputedStyle(group),clearance=Math.ceil((group.getBoundingClientRect().height||56)+(parseFloat(style.bottom)||16)+16);
      const height=clearance+'px';if(tail.style.height!==height)tail.style.height=height;
      applied=Math.max(prior.minimum,clearance)+'px';if(owner.style.getPropertyValue('scroll-padding-bottom')!==applied)owner.style.setProperty('scroll-padding-bottom',applied,prior.priority);
    };
    refresh();ctx.on(win,'resize',refresh);ctx.on(win.visualViewport,'resize',refresh);ctx.observe([group,surface],refresh);
    ctx.cleanup(()=>{restore();tail.remove();});
  }

  function mountGooey(root, actions, options = {}) {
    const available=(Array.isArray(actions)?actions:[]).filter(a=>a&&typeof a.run==='function'&&typeof a.label==='string').slice(0,4);
    if(!available.length||root.querySelector('[data-product-gooey]'))return {destroy(){}};
    const ctx=scope(options),group=element('div','pm-gooey-menu');group.dataset.productGooey='';group.setAttribute('aria-label','빠른 작업');
    const id='pm-goo-'+Math.random().toString(36).slice(2),svg=svgEl('svg',{'aria-hidden':true,focusable:false,viewBox:'0 0 56 56',class:'pm-gooey-surface'}),defs=svgEl('defs'),filter=svgEl('filter',{id,filterUnits:'userSpaceOnUse',x:-42,y:-(available.length*66+42),width:140,height:available.length*66+140,'color-interpolation-filters':'sRGB'});
    // Libraries.dev Gooey/filter.tsx: SVG surface behind crisp children; classic
    // blur=6/contrast=18, threshold intercept 0.5-18*(5/12) = -7. Shared clock.
    filter.append(svgEl('feGaussianBlur',{in:'SourceGraphic',stdDeviation:6,result:'blur'}),svgEl('feColorMatrix',{in:'blur',type:'matrix',values:'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7',result:'goo'}),svgEl('feComposite',{in:'SourceGraphic',in2:'goo',operator:'atop',result:'shape'}));defs.append(filter);const surface=svgEl('g',{filter:'url(#'+id+')'});surface.append(svgEl('circle',{cx:28,cy:28,r:28}));svg.append(defs,surface);group.append(svg);
    const trigger=button('+','pm-gooey-trigger');trigger.setAttribute('aria-label','빠른 작업 열기');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',id+'-actions');const menu=element('div','pm-gooey-actions');menu.id=id+'-actions';menu.setAttribute('role','group');menu.setAttribute('aria-label','빠른 작업 목록');group.append(menu,trigger);root.append(group);
    let open=false;const rotation=spring(0,480,34),items=available.map((action,i)=>{const b=button('','pm-gooey-action'),icon=element('span','pm-gooey-icon',action.symbol||['↗','○','●','…'][i]),label=element('span','pm-gooey-label',action.label);b.append(icon,label);b.setAttribute('aria-label',action.label);b.tabIndex=-1;b.inert=true;const blob=svgEl('circle',{cx:28,cy:28,r:0});surface.append(blob);menu.append(b);ctx.on(b,'click',()=>{if(!open)return;setOpen(false);action.run();});return {button:b,blob,y:spring(0,320,17),scale:spring(0,320,17)};});
    const kick=loop(ctx,()=>[rotation,...items.flatMap(i=>[i.y,i.scale])],()=>{trigger.style.transform='rotate('+rotation.x.toFixed(2)+'deg)';for(const item of items){const scale=Math.max(0,item.scale.x);item.button.style.transform='translateY('+item.y.x.toFixed(2)+'px) scale('+scale.toFixed(4)+')';item.button.style.opacity=clamp(scale*2,0,1);item.button.style.visibility=open||scale>=.001?'visible':'hidden';item.blob.setAttribute('cy',(28+item.y.x).toFixed(2));item.blob.setAttribute('r',(24*scale).toFixed(3));}});
    function setOpen(next,focus=false){open=next;group.dataset.open=String(open);trigger.setAttribute('aria-expanded',String(open));trigger.setAttribute('aria-label',open?'빠른 작업 닫기':'빠른 작업 열기');rotation.t=open?45:0;items.forEach((item,i)=>{item.y.t=open?-(i+1)*66:0;item.scale.t=open?1:0;item.y.wait=item.scale.wait=open?i*.04:(items.length-1-i)*.025;item.button.tabIndex=open?0:-1;item.button.inert=!open;item.button.setAttribute('aria-hidden',String(!open));if(open)item.button.style.visibility='visible';});kick();if(focus)trigger.focus();}
    ctx.on(trigger,'click',()=>setOpen(!open));ctx.on(doc,'pointerdown',e=>{if(open&&!group.contains(e.target))setOpen(false);});ctx.on(group,'keydown',e=>{if(e.key==='Escape'&&open){e.preventDefault();setOpen(false,true);}if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();if(!open)setOpen(true);const i=items.findIndex(item=>item.button===e.target),next=e.key==='Home'?0:e.key==='End'?items.length-1:clamp(i+(e.key==='ArrowUp'?1:-1),0,items.length-1);items[next]?.button.focus();}});
    setOpen(false);reserveGooeySpace(root,group,ctx);
    // A modal owns interaction until it closes. Its underlying page keeps the
    // clearance, and the same Gooey returns when the modal releases the page.
    const syncOverlay=()=>{
      const blocked=[...root.querySelectorAll('dialog[open],[role=dialog][aria-modal=true],[role=alertdialog],.obm-panel,.qa-modal-layer,.functional-drawer[data-open=true]')].some(el=>!el.hidden&&!el.closest('[hidden]')&&win.getComputedStyle(el).display!=='none'&&win.getComputedStyle(el).visibility!=='hidden');
      if(blocked&&open)setOpen(false);if(group.inert!==blocked)group.inert=blocked;
      const visibility=blocked?'hidden':'';if(group.style.visibility!==visibility)group.style.visibility=visibility;
      if(blocked){if(group.getAttribute('aria-hidden')!=='true')group.setAttribute('aria-hidden','true');}else if(group.hasAttribute('aria-hidden'))group.removeAttribute('aria-hidden');
    };
    if(win.MutationObserver){const observer=new win.MutationObserver(syncOverlay);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','aria-hidden','inert','data-open']});ctx.cleanup(()=>observer.disconnect());}
    syncOverlay();ctx.cleanup(()=>group.remove());return {destroy:ctx.destroy};
  }

  function mount(root, options = {}) {
    const controllers=[],charts=[],rings=[],widgets=[];
    const resizeCards=[...root.querySelectorAll('.demo-resize:not(.t-resize)')];for(const card of resizeCards)card.classList.add('t-resize');controllers.push({destroy(){for(const card of resizeCards)card.classList.remove('t-resize');}});
    for(const nav of root.querySelectorAll('[data-pm-nav],#role-menu,.qa-admin-nav,.ops-sidebar nav'))controllers.push(mountNav(nav,options));
    controllers.push(mountSidebar(root,options));const depth=mountDepth(root,options);controllers.push(depth);
    const input=options.data||{};
    for(const host of root.querySelectorAll('[data-pm-stat]')){const control=mountChart(host,input,options);charts.push(control);controllers.push(control);}
    for(const host of root.querySelectorAll('[data-pm-metric]')){const control=mountChart(host,input,options,true);charts.push(control);controllers.push(control);}
    for(const host of root.querySelectorAll('[data-pm-ring]')){const control=mountRing(host,input,options);rings.push(control);controllers.push(control);}
    for(const grid of root.querySelectorAll('[data-pm-widgets],.qa-widget-grid')){const control=mountWidgets(grid,options);widgets.push(control);controllers.push(control);}
    if(options.actions)controllers.push(mountGooey(root,options.actions,options));
    let destroyed=false;return {destroy(){if(destroyed)return;destroyed=true;for(const c of controllers.reverse())c.destroy?.();},updateData(data){if(destroyed)return;const normalized=normalizeData(data);for(const el of root.querySelectorAll('.pm-data-scope'))el.textContent=normalized.scopeLabel;for(const el of root.querySelectorAll('[data-pm-dashboard]>header>h2'))el.textContent=normalized.title;for(const c of [...charts,...rings])c.update(normalized);},restoreLayout(value){return !destroyed&&widgets.map(c=>c.restoreLayout(value)).some(Boolean);},toggleDepth:depth.toggle};
  }
  win.ORDER_ADMIN_MOTION={version:'20261121.1',mount,mountGooey,mountScrollIndex,renderDashboard,normalizeData};
  return win.ORDER_ADMIN_MOTION;
}

export const productAdminMotionCss = ":root {\n  --resize-dur: 300ms;\n  --resize-ease: cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.t-resize {\n  transition:\n    width  var(--resize-dur) var(--resize-ease),\n    height var(--resize-dur) var(--resize-ease);\n  will-change: width, height;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .t-resize { transition: none !important; }\n}\n\n:root {\n  --learn-shift: 2px;\n  --learn-spread: 8deg;\n  --learn-in: 350ms;\n  --learn-out: 350ms;\n  --learn-ease: cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.t-learn-chevron {\n  display: inline-flex;\n  transform: translateX(0);\n  transition: transform var(--learn-out) var(--learn-ease);\n}\n.t-learn-arm {\n  transform-box: view-box;\n  transform-origin: 10px 8px;\n  vector-effect: non-scaling-stroke;\n  transition: transform var(--learn-out) var(--learn-ease);\n}\n.t-learn:hover .t-learn-chevron { transform: translateX(var(--learn-shift)); transition-duration: var(--learn-in); }\n.t-learn:hover .t-learn-arm { transition-duration: var(--learn-in); }\n.t-learn:hover .t-learn-arm-top { transform: rotate(var(--learn-spread)); }\n.t-learn:hover .t-learn-arm-bot { transform: rotate(calc(var(--learn-spread) * -1)); }\n\n@media (prefers-reduced-motion: reduce) {\n  .t-learn-chevron, .t-learn-arm { transition: none !important; }\n}\n\n:root {\n  --acc-expand: 250ms;\n  --acc-collapse: 250ms;\n  --acc-chevron: 250ms;\n  --acc-ease: cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n/* grid-template-rows 0fr → 1fr gives a clean height animation\n   with no JS measurement; the inner element clips overflow. */\n.t-acc-panel {\n  display: grid;\n  grid-template-rows: 0fr;\n  transition: grid-template-rows var(--acc-collapse) var(--acc-ease);\n}\n.t-acc[data-open=\"true\"] .t-acc-panel {\n  grid-template-rows: 1fr;\n  transition: grid-template-rows var(--acc-expand) var(--acc-ease);\n}\n.t-acc-panel-inner {\n  overflow: hidden;\n  opacity: 0;\n  filter: blur(2px);\n  transition:\n    opacity var(--acc-collapse) var(--acc-ease),\n    filter var(--acc-collapse) var(--acc-ease);\n}\n.t-acc[data-open=\"true\"] .t-acc-panel-inner {\n  opacity: 1;\n  filter: blur(0);\n  transition:\n    opacity var(--acc-expand) var(--acc-ease),\n    filter var(--acc-expand) var(--acc-ease);\n}\n/* Flip the chevron vertically to turn the \"v\" into a \"^\".\n   scaleY(-1) about the centre passes through a flat line at\n   the midpoint (same look as a `d:` path morph) but animates\n   in every browser, unlike CSS `d:` morphing (Chromium only).\n   The chevron path is symmetric about the 16x16 viewBox\n   centre, so the flip lands exactly on the \"^\"; non-scaling\n   -stroke keeps the stroke width constant through the flip. */\n.t-acc-chevron {\n  display: inline-flex;\n  transform: scaleY(1);\n  transform-origin: center;\n  transition: transform var(--acc-chevron) var(--acc-ease);\n}\n.t-acc-chevron path { vector-effect: non-scaling-stroke; }\n.t-acc[data-open=\"true\"] .t-acc-chevron {\n  transform: scaleY(-1);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .t-acc-panel, .t-acc-panel-inner, .t-acc-chevron {\n    transition: none !important;\n  }\n}\n.pm-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}\n.pm-dashboard{margin:20px 0;color:#192438}.pm-dashboard>header{display:flex;justify-content:space-between;gap:16px;align-items:baseline;flex-wrap:wrap}.pm-dashboard h2{font-size:16px;margin:0 0 14px}.pm-data-scope,.pm-data-empty{font-size:12px;color:#697386;line-height:1.7}.pm-widget-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.pm-widget{background:#fff;border:1px solid #e1e6ec;border-radius:20px;padding:20px;min-width:0}.pm-bento{position:relative;perspective:1200px;isolation:isolate}.pm-bento>article,.pm-bento>section,.pm-bento>div{position:relative;transform-origin:top left;will-change:transform}.pm-bento>.qa-widget-expanded{grid-column:1/-1}.pm-widget-edit{margin:12px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pm-widget-edit>span{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.pm-widget-edit [hidden],.pm-bento [hidden]{display:none!important}.pm-widget-edit button,.pm-widget-edit select{font:inherit;font-size:12px;border:1px solid #dce3ee;border-radius:8px;background:#fff;padding:8px 10px}.pm-layout-status{flex-basis:100%;font-size:12px;min-height:1.4em;margin:0;color:#53647b}.pm-widget-grip,.pm-widget-resizer{position:absolute;z-index:2;width:30px;height:30px;padding:0!important;border:1px solid #c8d3e4;background:#fff;color:#304f88;border-radius:8px;touch-action:none;cursor:grab;font-size:20px}.pm-widget-grip{right:8px;top:8px}.pm-widget-resizer{right:8px;bottom:8px;cursor:ew-resize}.pm-widget-lifted{z-index:4}.pm-widget-lifted .pm-widget-grip{cursor:grabbing}.pm-chart-card{min-width:0}.pm-stat-value{display:block;font-size:28px;font-weight:650;letter-spacing:-.04em;font-variant-numeric:tabular-nums;margin:10px 0 4px}.pm-stat-change{font-size:12px;color:#427a63;font-variant-numeric:tabular-nums}.pm-periods{display:inline-flex;isolation:isolate;position:relative;gap:2px;padding:3px;background:#f3f5f8;border-radius:10px}.pm-periods[hidden]{display:none}.pm-periods button{font:inherit;font-size:11px;padding:5px 10px;position:relative;z-index:1;border:0;background:none;color:#65718a;border-radius:7px;cursor:pointer}.pm-periods button[aria-selected=true]{color:#253b5e}.pm-period-pill{position:absolute;top:3px;bottom:3px;left:0;background:white;border-radius:7px;box-shadow:0 1px 3px #1d2b4214;pointer-events:none}.pm-plot{position:relative;min-height:112px;margin-top:12px;touch-action:pan-y;outline-offset:4px}.pm-plot svg{display:block;width:100%;height:112px;overflow:visible}.pm-graph-line{stroke:#4169e1;stroke-width:2.5;vector-effect:non-scaling-stroke}.pm-graph-area{fill:#4169e110}.pm-graph-dot{fill:#4169e1;stroke:white;stroke-width:2}.pm-graph-cursor{stroke:#7185aa;stroke-width:1;stroke-dasharray:3 3}.pm-graph-range{fill:#4169e119}.pm-graph-tip{position:absolute;top:-20px;transform:translateX(-50%);font-size:11px;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis;background:#172844;color:#fff;padding:7px 9px;border-radius:7px;box-shadow:0 4px 12px #1728441a;pointer-events:none}.pm-graph-tip[hidden]{display:none}.pm-ring-wheel{position:relative;width:min(100%,240px);aspect-ratio:1;margin:0 auto;touch-action:none;cursor:grab;border-radius:50%;outline-offset:3px}.pm-ring-wheel[data-dragging=true]{cursor:grabbing}.pm-ring-wheel>svg{display:block;width:100%;height:100%}.pm-ring-marker{fill:#203756}.pm-ring-readout{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none;text-align:center;gap:5px}.pm-ring-readout span{font-size:12px;color:#718096}.pm-ring-readout strong{font-size:24px;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.pm-ring-readout small{font-size:11px;color:#718096}.pm-ring-legend{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}.pm-ring-legend button{font:inherit;font-size:11px;border:1px solid #e0e6ef;border-radius:7px;background:#fff;padding:5px 8px}.pm-ring-legend button:before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--segment-color);margin-right:5px}.pm-ring-legend button[aria-pressed=true]{background:#f0f4fa;border-color:#acbdd5}.pm-motion-nav{position:relative;isolation:isolate}.pm-motion-nav>a,.pm-motion-nav>button,.pm-motion-nav .qa-admin-nav-item,.pm-motion-nav .ops-nav{position:relative;z-index:1;background:transparent}.pm-nav-indicator{position:absolute;left:0;top:0;border-radius:9px;background:#e6edf9;z-index:0;pointer-events:none;transition:none!important}.pm-nav-tooltip{position:absolute;transform:translateX(-50%);padding:7px 10px;border-radius:8px;background:#182a45;color:#fff;font-size:11px;white-space:nowrap;z-index:5;pointer-events:none}.pm-motion-nav .qa-nav-hover,.pm-motion-nav .ops-nav-indicator{display:none!important}.pm-depth .ops-subnav{display:block!important;height:auto!important}.pm-depth .t-acc-panel{padding:0}.pm-depth-chevron{transform-origin:center;transition:transform var(--acc-chevron) var(--acc-ease)}.t-learn{display:inline-flex;align-items:center;gap:4px}.pm-index-reading{position:relative}.pm-index-reading .terms-body{padding-right:64px}.pm-scroll-index{position:absolute;right:8px;top:24px;width:34px;touch-action:none;user-select:none}.pm-scroll-index[hidden]{display:none}.pm-scroll-index:before{content:'';position:absolute;top:0;bottom:0;left:16px;border-left:1px solid #e0e5ed}.pm-scroll-tick{position:absolute;left:0;width:34px;height:20px;margin-top:-10px;padding:0;border:0;background:none;cursor:pointer}.pm-scroll-tick:after{content:'';display:block;margin-left:auto;width:var(--tick-width,12px);height:2px;background:#b4bfce;border-radius:2px;transform:scaleX(var(--swell,1));transform-origin:right center}.pm-scroll-tick[data-position=passed]:after{background:#7c95b6}.pm-scroll-tick[data-position=current]:after{background:#355fd0}.pm-scroll-tick:focus-visible{outline:2px solid #4169e1;outline-offset:1px;border-radius:4px}.pm-scroll-head{position:absolute;right:-4px;top:-3px;width:6px;height:6px;border-radius:50%;background:#355fd0;pointer-events:none}.pm-scroll-label{position:absolute;right:39px;top:0;max-width:180px;font-size:11px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding:6px 9px;border-radius:7px;color:#fff;background:#243952;opacity:0;pointer-events:none}.terms-body [data-policy-content] section{margin:0 0 28px}.terms-body [data-policy-content] p{font-size:13px;line-height:1.85;white-space:pre-wrap}.pm-policy-meta,.pm-policy-status{font-size:12px;line-height:1.6;color:#62758b}.pm-policy-meta{margin:12px 0}.pm-gooey-menu{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));width:56px;height:56px;z-index:50;isolation:isolate}.pm-gooey-surface{position:absolute;inset:0;width:56px;height:56px;overflow:visible;pointer-events:none;z-index:-1;fill:#365fd2;filter:drop-shadow(0 5px 10px #20396724);will-change:filter,transform}.pm-gooey-trigger,.pm-gooey-action{border:0!important;box-shadow:none!important;background:transparent!important;color:white!important;padding:0!important;display:grid;place-items:center;position:absolute;inset:0;font:inherit;cursor:pointer;transform-origin:center;transition:none!important}.pm-gooey-trigger{width:56px;height:56px;border-radius:50%;font-size:30px}.pm-gooey-action{width:48px;height:48px;left:4px;top:4px;border-radius:50%;visibility:hidden}.pm-gooey-icon{font-size:20px}.pm-gooey-label{position:absolute;right:58px;color:#253955;background:white;border:1px solid #e5eaf1;box-shadow:0 3px 12px #14284b0d;font-size:11px;padding:6px 9px;border-radius:8px;white-space:nowrap}.pm-gooey-trigger:focus-visible,.pm-gooey-action:focus-visible{outline:3px solid #a2b8ff;outline-offset:3px}\n@media(max-width:860px){.pm-widget-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pm-widget-grid>.pm-widget:last-child{grid-column:1/-1}.pm-widget{padding:16px}}\n@media(max-width:560px){.pm-widget-grid{grid-template-columns:1fr}.pm-widget-grid>.pm-widget{grid-column:1}.pm-gooey-menu{right:16px;bottom:16px}.pm-layout-status{max-width:100%}.pm-widget-edit select{max-width:180px}}\n@media(prefers-reduced-motion:reduce){.pm-depth-chevron{transition:none!important}.pm-bento>article,.pm-bento>section,.pm-bento>div{will-change:auto}}\n";
