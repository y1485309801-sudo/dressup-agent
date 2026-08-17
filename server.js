import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const app = createApp({ config, services: {} });

app.listen(config.port, () => {
  console.log(`Dressup Agent listening on port ${config.port}`);
});
