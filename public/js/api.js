export class ApiError extends Error {
  constructor(code, status, body) {
    super(code);
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

async function request(path, body, timeoutMs = 18_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(payload.error || 'REQUEST_FAILED', response.status, payload);
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('TIMEOUT', 0, {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  weather: input => request('/api/weather', input),
  analyzeGarment: (imageDataUrl, existingCategory) =>
    request('/api/garments/analyze', { imageDataUrl, existingCategory }, 30_000),
  recommend: input => request('/api/agent/recommend', input),
  refine: input => request('/api/agent/refine', input)
};
