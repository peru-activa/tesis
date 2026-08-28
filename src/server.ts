import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3100);
let io: Server | undefined;
const app = createApp({
  onOrderUpdated: () => io?.emit('orders.changed'),
  onQuotationUpdated: () => io?.emit('quotations.changed'),
});
const httpServer = createServer(app);
io = new Server(httpServer, {
  cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:5173' },
});

httpServer.listen(port, '0.0.0.0', () => {
  process.stdout.write(`tesis service listening on port ${port}\n`);
});
