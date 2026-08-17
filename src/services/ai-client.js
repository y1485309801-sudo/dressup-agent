function aiError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function parseJsonContent(content) {
  if (typeof content !== 'string') {
    throw aiError('INVALID_AI_RESPONSE', 'AI response content is missing');
  }
  const cleaned = content.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (cause) {
    throw aiError('INVALID_AI_RESPONSE', 'AI response is not valid JSON', cause);
  }
}

export function createAiClient(config = {}, fetchFn = globalThis.fetch) {
  if (!config.aiConfigured || !config.aiBaseUrl || !config.aiApiKey) {
    return null;
  }

  return {
    async completeJson({ system, prompt, imageDataUrl, model }) {
      let response;
      try {
        response = await fetchFn(`${config.aiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.aiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model || config.aiVisionModel || config.aiChatModel,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: imageDataUrl } }
                ]
              }
            ]
          })
        });
      } catch (cause) {
        throw aiError('AI_UNAVAILABLE', 'AI provider is unavailable', cause);
      }

      if (!response?.ok) {
        throw aiError('AI_UNAVAILABLE', `AI provider returned ${response?.status || 'an error'}`);
      }

      const payload = await response.json();
      return parseJsonContent(payload?.choices?.[0]?.message?.content);
    }
  };
}
