import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Web server + WebSocket for real-time studio observation.
 * Serves the static UI and streams events to connected viewers.
 */
export class StudioServer {
  constructor({ port = 3000, eventBus, timeline }) {
    this._port = port;
    this._eventBus = eventBus;
    this._timeline = timeline;
    this._wss = null;
  }

  start() {
    const app = express();
    app.use(express.static(path.join(__dirname, 'public')));

    const server = createServer(app);
    this._wss = new WebSocketServer({ server });

    this._wss.on('connection', (ws) => {
      // Send recent history on connect
      const recent = this._timeline.recent(200);
      ws.send(JSON.stringify({ type: 'history', events: recent }));
    });

    // Stream all new events to connected viewers
    this._eventBus.onAny((event) => {
      const msg = JSON.stringify({ type: 'event', event });
      for (const client of this._wss.clients) {
        if (client.readyState === 1) client.send(msg);
      }
    });

    server.listen(this._port, () => {
      console.log(`Studio UI: http://localhost:${this._port}`);
    });
  }
}
