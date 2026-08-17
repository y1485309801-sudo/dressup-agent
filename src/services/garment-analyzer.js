const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED = {
  category: new Set(['top', 'bottom', 'outer', 'dress', 'shoes', 'bag', 'accessory', 'other']),
  pattern: new Set(['solid', 'stripe', 'plaid', 'print', 'texture', 'other']),
  thickness: new Set(['light', 'medium', 'heavy']),
  season: new Set(['spring', 'summer', 'autumn', 'winter']),
  formality: new Set(['casual', 'smart-casual', 'business', 'formal', 'sport'])
};

function analyzerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function stringArray(value, allowed, label) {
  if (!Array.isArray(value)) return [];
  const result = value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
  if (allowed && result.some(item => !allowed.has(item))) {
    throw analyzerError('INVALID_AI_RESPONSE', `Unknown ${label} value`);
  }
  return result;
}

function requiredEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw analyzerError('INVALID_AI_RESPONSE', `Unknown or missing ${label}`);
  }
  return value;
}

function imageBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const payload = dataUrl.slice(comma + 1).replace(/=+$/, '');
  return Math.ceil(payload.length * 3 / 4);
}

export function createGarmentAnalyzer({ aiClient }) {
  return {
    async analyze({ imageDataUrl, existingCategory } = {}) {
      if (typeof imageDataUrl !== 'string' || !/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
        throw analyzerError('INVALID_IMAGE', 'A JPEG, PNG, or WebP data URL is required');
      }
      if (imageBytes(imageDataUrl) > MAX_IMAGE_BYTES) {
        throw analyzerError('IMAGE_TOO_LARGE', 'Image exceeds the 8 MB limit');
      }
      if (!aiClient) {
        throw analyzerError('AI_NOT_CONFIGURED', 'AI garment analysis is not configured');
      }

      const raw = await aiClient.completeJson({
        imageDataUrl,
        system: [
          'Return exactly one JSON object describing only the visible garment.',
          'Never infer or discuss a person, body, gender, age, attractiveness, or body shape.',
          'Use only the allowed enum values provided in the user prompt.'
        ].join(' '),
        prompt: `Analyze this garment. Existing category: ${existingCategory || 'unknown'}. Allowed categories: top,bottom,outer,dress,shoes,bag,accessory,other. Allowed thickness: light,medium,heavy. Allowed seasons: spring,summer,autumn,winter. Allowed formality: casual,smart-casual,business,formal,sport.`
      });

      const confidence = Number(raw?.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw analyzerError('INVALID_AI_RESPONSE', 'confidence must be between 0 and 1');
      }

      const tags = {
        category: requiredEnum(raw.category, ALLOWED.category, 'category'),
        subtype: typeof raw.subtype === 'string' ? raw.subtype.trim() : '',
        primaryColor: typeof raw.primaryColor === 'string' ? raw.primaryColor.trim() : '',
        secondaryColors: stringArray(raw.secondaryColors, null, 'secondary color'),
        pattern: requiredEnum(raw.pattern || 'other', ALLOWED.pattern, 'pattern'),
        material: typeof raw.material === 'string' ? raw.material.trim() : '',
        thickness: requiredEnum(raw.thickness, ALLOWED.thickness, 'thickness'),
        seasons: stringArray(raw.seasons, ALLOWED.season, 'season'),
        warmth: Number.isFinite(raw.warmth) ? Math.max(0, Math.min(5, raw.warmth)) : null,
        formality: requiredEnum(raw.formality || 'casual', ALLOWED.formality, 'formality'),
        styles: stringArray(raw.styles, null, 'style'),
        functional: stringArray(raw.functional, null, 'functional')
      };
      const missingRequired = !tags.subtype || !tags.primaryColor;

      return {
        tags,
        confidence,
        needsReview: confidence < 0.75 || missingRequired
      };
    }
  };
}
