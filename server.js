import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createAiClient } from './src/services/ai-client.js';
import { createGarmentAnalyzer } from './src/services/garment-analyzer.js';
import { createOutfitAgent } from './src/services/outfit-agent.js';
import { createWeatherService } from './src/services/weather.js';

const config = loadConfig();
const aiClient = createAiClient(config);
const weather = createWeatherService({ baseUrl: config.weatherBaseUrl });
const services = {
  weather,
  garmentAnalyzer: createGarmentAnalyzer({ aiClient }),
  agent: createOutfitAgent({ weather, aiClient })
};
const app = createApp({ config, services });

app.listen(config.port, () => {
  console.log(`Dressup Agent listening on port ${config.port}`);
});
