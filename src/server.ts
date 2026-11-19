import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { assertCloudflareAccessConfiguration } from './infrastructure/access-identity.js';

const port = Number(process.env.PORT || 3100);
assertCloudflareAccessConfiguration();
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
  const emailWorker = app.locals.customerEmailWorker;
  if (emailWorker) {
    const tick = () => void emailWorker.tick().catch(() => process.stderr.write('customer email queue requires review\n'));
    setInterval(tick, 5000).unref();
    tick();
  }
  const automation = app.locals.assignmentAutomation;
  if (automation) {
    const tick = () => void automation.tick().catch(() => process.stderr.write('assignment automation requires review\n'));
    setInterval(tick, 5000).unref();
    tick();
  }
  process.stdout.write(`tesis service listening on port ${port}\n`);
});
