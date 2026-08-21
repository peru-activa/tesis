import { createApp } from './app.js';

const port = Number(process.env.PORT || 3100);

createApp().listen(port, '0.0.0.0', () => {
  process.stdout.write(`tesis service listening on port ${port}\n`);
});

