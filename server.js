import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createAiClient } from './src/services/ai-client.js';
import { createGarmentAnalyzer } from './src/services/garment-analyzer.js';
import { createWeatherService } from './src/services/weather.js';

const config = loadConfig();
const aiClient = createAiClient(config);
const services = {
  weather: createWeatherService({ baseUrl: config.weatherBaseUrl }),
  garmentAnalyzer: createGarmentAnalyzer({ aiClient })
};
const app = createApp({ config, services });

app.listen(config.port, () => {
  console.log(`Dressup Agent listening on port ${config.port}`);
});
