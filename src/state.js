export const state = {
  ready: false,
  shuttingDown: false,
  reason: 'starting',
};

export function markReady() {
  state.ready = true;
  state.reason = 'ready';
}

export function markShuttingDown() {
  state.ready = false;
  state.shuttingDown = true;
  state.reason = 'shutting down';
}
