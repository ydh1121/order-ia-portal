// Browser-only controls. The review frame and signed role page provide their own data and actions.
export function createCustomerControls() {
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const motion = (el, keyframes, timing) => !document.hidden && !reduced() && el.animate
    ? el.animate(keyframes, timing) : null;

  function deckLayout(stage,{signal}={}){
    const jobs=new Map();let revision=0;
    function cancel(){++revision;for(const [card,job]of jobs){job.animation?.cancel();Object.assign(card.style,job.original);}jobs.clear();delete stage.dataset.r3FlipActive;}
    function update(write,{animate=true}={}){
      // Capture the current painted frame before interrupting an earlier flip.
      const before=new Map([...stage.children].map(card=>[card,card.getBoundingClientRect()]));
      cancel();const at=revision;
      const original=new Map([...stage.children].map(card=>[card,{transition:card.style.transition,scale:card.style.scale,translate:card.style.translate}]));
      for(const card of stage.children)card.style.transition='none';
      write();
      // The caller has now put the same cards in its chosen date order. Keep
      // that order visible as they gather, without a long tail for many cards.
      const cards=[...stage.children],stagger=Math.min(60,180/Math.max(1,cards.length-1));
      for(const [index,card] of cards.entries()){
        const prior=original.get(card)||{transition:card.style.transition,scale:card.style.scale,translate:card.style.translate},from=before.get(card),to=card.getBoundingClientRect();
        if(!animate||reduced()||!from?.width||!to.width||!from.height||!to.height){Object.assign(card.style,prior);continue;}
        const scale=from.width/to.width+' '+from.height/to.height;
        card.style.scale=scale;card.style.translate='0px';
        const scaled=card.getBoundingClientRect(),translate=(from.left-scaled.left)+'px '+(from.top-scaled.top)+'px';
        card.style.scale=prior.scale;card.style.translate=prior.translate;
        // Backwards fill holds the captured painted frame during its delay,
        // including when another mode change interrupts an unfinished FLIP.
        const a=motion(card,[{scale,translate},{scale:prior.scale||'1',translate:prior.translate||'0px'}],{duration:420,delay:index*stagger,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
        if(!a){Object.assign(card.style,prior);continue;}
        const job={animation:a,original:prior};jobs.set(card,job);stage.dataset.r3FlipActive='true';
        a.finished.then(()=>{if(revision!==at||jobs.get(card)!==job)return;a.cancel();Object.assign(card.style,prior);jobs.delete(card);if(!jobs.size)delete stage.dataset.r3FlipActive;},()=>{});
      }
    }
    signal?.addEventListener('abort',cancel,{once:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();},{signal});
    return {update,cancel};
  }

  function swipeDeck(stage, { enabled, top, step, signal }) {
    let drag = null;
    let suppress = false;
    let flight = null;
    const reset = () => {
      if (drag) {
        drag.card.style.removeProperty('translate');
        drag.card.style.removeProperty('rotate');
        drag.card.style.removeProperty('transition');
      }
      drag = null;
    };
    stage.addEventListener('pointerdown', event => {
      if (!enabled() || !event.isPrimary || event.button !== 0 || event.target.closest('button,a,input,select')) return;
      flight?.cancel();
      const card = top();
      if (!card || !card.contains(event.target)) return;
      drag = { card, x: event.clientX, y: event.clientY, id: event.pointerId, started: performance.now(), moved: false };
      suppress = false;
    }, { signal });
    stage.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
        if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
        drag.moved = true;
        drag.card.setPointerCapture?.(event.pointerId);
      }
      drag.card.style.translate = dx + 'px ' + dy * .18 + 'px';
      drag.card.style.rotate = Math.max(-12, Math.min(12, dx / 12)) + 'deg';
    }, { signal });
    function finish(event) {
      if (!drag || event.pointerId !== drag.id) return;
      const { card, x, started, moved } = drag;
      const dx = event.clientX - x, elapsed = Math.max(1, performance.now() - started);
      const accept = event.type === 'pointerup' && moved &&
        (Math.abs(dx) > Math.min(110, card.clientWidth * .28) || (Math.abs(dx) > 28 && Math.abs(dx) / elapsed > .65));
      const startTranslate = card.style.translate || '0px', startRotate = card.style.rotate || '0deg';
      suppress = moved;
      reset();
      if (!moved) return;
      const direction = dx < 0 ? 1 : -1;
      const dest = accept ? (-direction * card.clientWidth * 1.13) + 'px' : '0px';
      flight = motion(card, [{ translate: startTranslate, rotate: startRotate }, { translate: dest, rotate: accept ? -direction * 13 + 'deg' : '0deg' }],
        { duration: accept ? 165 : 290, easing: accept ? 'ease-in' : 'cubic-bezier(.2,1.22,.4,1)' });
      if (accept) {
        if (flight) flight.onfinish = () => { step(direction); flight = null; };
        else step(direction);
      }
    }
    stage.addEventListener('pointerup', finish, { signal });
    stage.addEventListener('pointercancel', finish, { signal });
    stage.addEventListener('click', event => {
      if (suppress) { event.stopImmediatePropagation(); event.preventDefault(); suppress = false; }
    }, { signal, capture: true });
    const stop = () => { flight?.cancel(); flight = null; reset(); };
    signal.addEventListener('abort', stop, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal });
    return stop;
  }

  function slidePanel(panel, write, direction) {
    const current = panel.querySelector(':scope > .customer-panel-page');
    if (!direction) {
      const page = document.createElement('div');
      page.className = 'customer-panel-page';
      write(page); panel.replaceChildren(page);
      return page;
    }
    const page = document.createElement('div');
    page.className = 'customer-panel-page';
    write(page);
    for (const old of panel.querySelectorAll('.customer-panel-leaving')) old.remove();
    const right = direction > 0;
    let outgoing;
    if (current) {
      outgoing=document.createElement('div');
      outgoing.className='customer-panel-leaving';
      outgoing.inert=true;
      outgoing.setAttribute('aria-hidden','true');
      current.before(outgoing);
      const surface=outgoing.attachShadow({mode:'closed'});
      for(const style of document.querySelectorAll('style'))surface.append(style.cloneNode(true));
      const skin=document.createElement('div');skin.className=panel.closest('.ds')?'ds':'';
      surface.append(skin);skin.append(current);
      current.classList.remove('customer-panel-page');
      current.inert = true;
      current.setAttribute('aria-hidden', 'true');
      // Remove live IDs from the outgoing form before mounting the incoming one.
      for (const el of current.querySelectorAll('[id]')) el.removeAttribute('id');
    }
    panel.append(page);
    const timing = { duration: 220, easing: 'cubic-bezier(.22,.75,.25,1)' };
    const leaving = outgoing && motion(outgoing, [{ translate: '0%', opacity: 1 }, { translate: right ? '-34%' : '100%', opacity: .2 }], timing);
    if (leaving) { leaving.onfinish = () => outgoing.remove(); leaving.oncancel = () => outgoing.remove(); }
    else outgoing?.remove();
    motion(page, [{ translate: right ? '100%' : '-34%', opacity: .45 }, { translate: '0%', opacity: 1 }], timing);
    return page;
  }

  // The two menu actions use only the outward/reverse fan sequence from Liquid Taffy.
  function speedDial(trigger, items, signal) {
    const buttons = [...items.querySelectorAll('button')];
    let generation = 0;
    let active = [];
    function set(open) {
      if (open === (trigger.getAttribute('aria-expanded') === 'true')) return;
      const version = ++generation;
      const poses = buttons.map(btn => getComputedStyle(btn).translate);
      for (const animation of active) animation.cancel();
      active = [];
      trigger.setAttribute('aria-expanded', String(open));
      items.hidden = false; items.inert = !open;
      const origin = trigger.getBoundingClientRect();
      for (const [index, btn] of buttons.entries()) {
        const b = btn.getBoundingClientRect(); const y = origin.top + origin.height / 2 - (b.top + b.height / 2);
        const x = origin.right - origin.width / 2 - (b.right - b.width / 2);
        const inward = x + 'px ' + y + 'px';
        const current = poses[index] !== 'none' ? poses[index] : open ? inward : '0px';
        const go = motion(btn, [
          { translate: current, opacity: open ? .15 : 1 },
          { translate: open ? '0px' : inward, opacity: open ? 1 : 0 }
        ], { duration: open ? 450 : 180, delay: open ? (buttons.length - index - 1) * 45 : index * 40,
             easing: open ? 'linear(0,.18 11%,.54 17%,.88 25%,1.095 33.3%,1.18 44.4%,1.08 61.1%,1.0035 72.2%,.968 86.1%,1)' : 'cubic-bezier(.4,0,.7,1)',
             fill: 'backwards' });
        if (go) active.push(go);
      }
      if (!open) {
        if (!active.length) items.hidden = true;
        else Promise.allSettled(active.map(a => a.finished)).then(() => { if (generation === version) items.hidden = true; });
      }
    }
    signal.addEventListener('abort', () => { ++generation; for (const a of active) a.cancel(); }, { once: true });
    return set;
  }
  return { motion, swipeDeck, deckLayout, slidePanel, speedDial };
}
