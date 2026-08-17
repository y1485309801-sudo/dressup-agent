import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createWeatherService } from './src/services/weather.js';

const config = loadConfig();
const services = {
  weather: createWeatherService({ baseUrl: config.weatherBaseUrl })
};
const app = createApp({ config, services });

app.listen(config.port, () => {
  console.log(`Dressup Agent listening on port ${config.port}`);
});
