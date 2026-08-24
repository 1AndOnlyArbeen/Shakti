import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import dbConnect from './db/index.js';
import app from './app.js';
import { initSignaling } from './socket/signaling.js';
import { ensureRagService } from './utils/ragAutostart.js';
import { getRedis, closeRedis, isRedisConfigured } from './utils/redis.js';

const port = process.env.PORT || 8000;

// Safety net: a stray rejected promise or thrown async error (e.g. a flaky
// upstream AI/RAG call that slips past a local try/catch) should be logged, NOT
// take the whole server down. The request that caused it still fails, but the
// process keeps serving everyone else.
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
});

// Dial Redis at boot rather than on the first request that wants it. Lazily
// connecting meant the first few requests silently used the in-process fallback
// and /health reported 'unavailable' for a connection that was merely not
// attempted yet. Non-blocking: getRedis() returns immediately and the client
// reports its own state.
if (isRedisConfigured()) getRedis();

dbConnect()
    .then(() => {
        // Wrap Express in an HTTP server so socket.io (WebRTC signaling) can share the port.
        const server = http.createServer(app);
        initSignaling(server);

        // SIGTERM is what `docker stop` and compose send. Close the listener and
        // the Redis socket before exiting so in-flight requests finish and the
        // next boot does not inherit a half-open connection.
        const shutdown = (signal) => async () => {
            console.log(`[shutdown] ${signal} received, closing server`);
            server.close(async () => {
                await closeRedis();
                process.exit(0);
            });
            // Do not hang forever on a stuck connection.
            setTimeout(() => process.exit(1), 10000).unref();
        };
        process.on('SIGTERM', shutdown('SIGTERM'));
        process.on('SIGINT', shutdown('SIGINT'));

        server.listen(port, () => {
            console.log(`Tempu backend running on port ${port}`);

            // Bring up the Python RAG service (:8100) once the backend is
            // serving. Fire-and-forget: it reuses an existing instance, never
            // blocks startup, and never throws. See utils/ragAutostart.js.
            ensureRagService();
        });
    })
    .catch((error) => {
        console.error('Database connection failed:', error);
        process.exit(1);
    });
