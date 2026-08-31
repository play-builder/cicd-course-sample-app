import express from 'express';
import { config } from './config.js';
import { state } from './state.js';
import { metricsMiddleware, registry } from './metrics.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rootHandler(req, res) {
  if (config.latencyMs > 0) {
    await sleep(config.latencyMs);
  }

  if (config.failureRate > 0 && Math.random() < config.failureRate) {
    res.status(500).json({
      error: 'injected failure',
      version: config.version,
      pod: config.podName,
    });
    return;
  }

  res.json({
    message: 'playbuilder sample app',
    version: config.version,
    gitSha: config.gitSha,
    pod: config.podName,
    node: config.nodeName,
  });
}

function healthzHandler(req, res) {
  res.json({ status: 'alive' });
}

function readyzHandler(req, res) {
  if (!state.ready) {
    res.status(503).json({ status: 'not ready', reason: state.reason });
    return;
  }
  res.json({ status: 'ready' });
}

function versionHandler(req, res) {
  res.json({
    version: config.version,
    gitSha: config.gitSha,
    buildDate: config.buildDate,
    nodeVersion: process.version,
    pod: config.podName,
  });
}

function configHandler(req, res) {
  const keys = config.secretKeys.map((name) => {
    const value = process.env[name];
    const present = typeof value === 'string' && value.length > 0;
    return { name, present, length: present ? value.length : 0 };
  });

  res.json({
    failureRate: config.failureRate,
    latencyMs: config.latencyMs,
    readyDelayMs: config.readyDelayMs,
    shutdownDelayMs: config.shutdownDelayMs,
    keys,
  });
}

async function metricsHandler(req, res) {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(metricsMiddleware);

  app.get('/', rootHandler);
  app.get('/healthz', healthzHandler);
  app.get('/readyz', readyzHandler);
  app.get('/version', versionHandler);
  app.get('/config', configHandler);
  app.get('/metrics', metricsHandler);

  app.use((req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  return app;
}
