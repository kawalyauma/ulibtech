import { serve } from '@hono/node-server';
import { closeRedis } from '@edushare/cache';
import { closeDb } from '@edushare/database';
import { closeQueues } from '@edushare/jobs';
import { createApp } from './app';
import { createServices } from './services';

const services = createServices();
const app = createApp(services);
const port = services.env.API_PORT;

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});

// Uploads can be slow on poor connections.
if ('requestTimeout' in server) (server as unknown as { requestTimeout: number }).requestTimeout = 30 * 60 * 1000;

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([closeQueues(), closeRedis(), closeDb()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
