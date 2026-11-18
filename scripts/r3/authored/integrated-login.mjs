// An authenticated QA fixture already validates the form and drives its success
// state. Animate only that validated exit and delegate every other navigation.
export function mountIntegratedLogin() {
  const login = window.ORDER_DESIGN_MODULES.find(item => item.id === 'login');
  const mount = login.mount;
  login.mount = (root, state, api) => {
    let leaving = false, active = true, transition;
    const dispose = mount(root, state, {...api, select(screen, next) {
      if (screen !== 'login' || next !== 'success')
        return api.select(screen, next);
      if (leaving) return;
      leaving = true;
      const content = root.querySelector('.auth-layout.compact');
      if (api.reduced() || !content?.animate) return api.select(screen, next);
      content.inert = true;
      transition = content.animate([
        {transform:'translateX(0)', opacity:1},
        {transform:'translateX(22%)', opacity:0}
      ], {duration:230, easing:'cubic-bezier(.32,0,.67,.55)', fill:'forwards'});
      // A removed iframe must never navigate its replacement.
      transition.finished.then(() => { if (active) api.select(screen, next); }, () => {});
    }});
    return () => { active = false; transition?.cancel(); dispose?.(); };
  };
}
