// Adapt the user's original animation player to the isolated QA frame. The exported
// document retains its editable vector art, including when motion is disabled.
export function installWaitPlayer(montages) {
  const component = window.ORDER_DESIGN_MODULES.find(item => item.id === 'quote-wait');
  const mountLayout = component.mount;
  component.mount = function(root, state, api) {
    const stopLayout = mountLayout?.(root, state, api);
    const host = root.querySelector('.mf-wait-avatar');
    const phase = {entry:'entry', 'fast-response':'entry', comparing:'comparing',
      'slow-response':'comparing', delayed:'delayed', complete:'complete'}[state];
    if (!host || !phase) return stopLayout;
    const slot = document.createElement('div');
    slot.setAttribute('aria-hidden', 'true');
    // Keep the original vector as fallback until the player is mounted.
    const vector = host.querySelector('svg');
    slot.hidden = true;
    host.append(slot);
    let ended = false;
    let player;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    function setMotion() {
      if (!player) return;
      if (motion.matches) {
        player.pause();
        player.seek(phase === 'entry' ? 3.5 : 0);
      } else player.play();
    }
    window.BloubR4.mountBloub(slot, montages[phase], {autoplay:false, ariaLabel:'계란 애니메이션'}).then(instance => {
      if (ended) { instance.destroy(); return; }
      player = instance;
      if (vector) vector.style.display = 'none';
      slot.hidden = false;
      setMotion();
      motion.addEventListener('change', setMotion);
    }).catch(() => {
      slot.remove();
      if (vector) vector.style.display = '';
    });
    return () => {
      ended = true;
      motion.removeEventListener('change', setMotion);
      player?.destroy();
      stopLayout?.();
    };
  };
}
