function readInt(raw, fallback) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readRate(raw, fallback) {
  const parsed = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0), 1);
}

function readList(raw, fallback) {
  const items = (raw ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

export const config = {
  port: readInt(process.env.PORT, 3000),

  version: process.env.APP_VERSION ?? 'dev',
  gitSha: process.env.GIT_SHA ?? 'unknown',
  buildDate: process.env.BUILD_DATE ?? 'unknown',
  podName: process.env.POD_NAME ?? 'local',
  nodeName: process.env.NODE_NAME ?? 'local',

  failureRate: readRate(process.env.FAILURE_RATE, 0),
  latencyMs: readInt(process.env.LATENCY_MS, 0),
  readyDelayMs: readInt(process.env.READY_DELAY_MS, 0),
  shutdownDelayMs: readInt(process.env.SHUTDOWN_DELAY_MS, 5000),

  secretKeys: readList(process.env.SECRET_KEYS, ['DB_HOST', 'DB_PASSWORD', 'API_KEY']),
};
