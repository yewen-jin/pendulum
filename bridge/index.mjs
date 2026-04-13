// Pendulum bridge: OSC (UDP) -> WebSocket fan-out.
// Receives OSC from AbletonOSC (music machine) and MobMuPlat (phone),
// normalizes to {path, args, t} and broadcasts to all browser clients.

import osc from 'osc';
import { WebSocketServer } from 'ws';

const OSC_PORT = Number(process.env.OSC_PORT ?? 9000);
const WS_PORT = Number(process.env.WS_PORT ?? 9001);
const HOST = '0.0.0.0';

const udp = new osc.UDPPort({
  localAddress: HOST,
  localPort: OSC_PORT,
  metadata: false,
});

const wss = new WebSocketServer({ host: HOST, port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`[ws] client connected (${clients.size} total) from ${req.socket.remoteAddress}`);
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });
  ws.on('error', (e) => console.warn('[ws] error', e.message));
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

udp.on('ready', () => {
  console.log(`[osc] listening on udp://${HOST}:${OSC_PORT}`);
  console.log(`[ws]  listening on ws://${HOST}:${WS_PORT}`);
});

udp.on('message', (m) => {
  // m = { address: '/x/y', args: [...] }
  broadcast({ path: m.address, args: m.args, t: Date.now() });
});

udp.on('error', (e) => console.warn('[osc] error', e.message));

udp.open();
