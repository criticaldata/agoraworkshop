import { createPreviewApp } from './app.js';

const port = Number(process.env.WP06_PREVIEW_PORT ?? 3006);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WP06_PREVIEW_PORT must be an integer from 1 to 65535.');
const server = createPreviewApp().listen(port, '127.0.0.1', () => {
  console.log(`WP06 preview: http://127.0.0.1:${port}`);
  console.log('Local, read-only analysis. No model calls or saved uploads. Ctrl+C to stop.');
});
server.on('error', error => { console.error(`WP06 preview could not start: ${error.message}`); process.exitCode = 1; });
