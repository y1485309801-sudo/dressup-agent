export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3001),
    baseUrl: env.BASE_URL || '',
    allowedOrigins: (env.ALLOWED_ORIGINS || 'http://localhost:3001')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    jimengAk: env.JIMENG_AK || '',
    jimengSk: env.JIMENG_SK || '',
    jimengConfigured: Boolean(env.JIMENG_AK && env.JIMENG_SK),
    aiBaseUrl: (env.AI_BASE_URL || '').replace(/\/$/, ''),
    aiApiKey: env.AI_API_KEY || '',
    aiVisionModel: env.AI_VISION_MODEL || '',
    aiChatModel: env.AI_CHAT_MODEL || '',
    aiConfigured: Boolean(env.AI_BASE_URL && env.AI_API_KEY && env.AI_CHAT_MODEL),
    weatherBaseUrl: (env.WEATHER_API_BASE_URL || 'https://api.open-meteo.com')
      .replace(/\/$/, ''),
    rateLimit: {
      limit: Number(env.RATE_LIMIT_MAX || 30),
      windowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60_000)
    }
  };
}
