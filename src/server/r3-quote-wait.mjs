// The server decides when a quote is issued. Timers only draw the waiting state.
export function createQuoteWait({paint, schedule = setTimeout, unschedule = clearTimeout}) {
  let active = null;

  function clearTimers(request) {
    for (const timer of request.timers) unschedule(timer);
  }

  function stop(phase = 'idle') {
    if (active) {
      const previous = active;
      active = null;
      clearTimers(previous);
      previous.controller.abort();
    }
    paint(phase, []);
  }

  async function request(task, labels) {
    stop();
    const pending = {controller: new AbortController(), timers: []};
    active = pending;
    paint('entry', []);
    labels.forEach((label, index) => {
      pending.timers.push(schedule(() => {
        if (active === pending) paint('comparing', labels.slice(Math.max(0, index - 2), index + 1));
      }, 3500 + index * 500));
    });
    try {
      const response = await task(pending.controller.signal);
      if (active !== pending) return null;
      clearTimers(pending);
      active = null;
      paint('complete', []);
      return response;
    } catch (error) {
      if (active !== pending) return null;
      clearTimers(pending);
      active = null;
      paint('error', []);
      throw error;
    }
  }
  return {request, stop};
}
