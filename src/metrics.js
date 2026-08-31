import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { config } from './config.js';

export const registry = new Registry();

registry.setDefaultLabels({
  app: 'sample-app',
  version: config.version,
});

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'HTTP 요청 수',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 응답 시간',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 3],
  registers: [registry],
});

export function metricsMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const route = req.route?.path ?? 'unmatched';
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, elapsedSeconds);
  });

  next();
}
