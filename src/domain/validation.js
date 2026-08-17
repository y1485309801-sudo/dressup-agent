const GARMENT_STATUSES = new Set(['available', 'laundry', 'stored', 'disabled']);
const TEMPERATURE_SENSITIVITIES = new Set(['cold', 'neutral', 'warm']);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean)
    : [];
}

export function validateProfile(value) {
  const profile = requireObject(value, 'profile');
  const city = requireText(profile.city, 'city');
  const temperatureSensitivity = profile.temperatureSensitivity || 'neutral';

  if (!TEMPERATURE_SENSITIVITIES.has(temperatureSensitivity)) {
    throw new TypeError('temperatureSensitivity is invalid');
  }

  return { city, temperatureSensitivity };
}

export function validateGarment(value) {
  const garment = requireObject(value, 'garment');
  const status = garment.status || 'available';

  if (!GARMENT_STATUSES.has(status)) {
    throw new TypeError(`status is invalid: ${status}`);
  }

  return {
    id: requireText(garment.id, 'garment.id'),
    imgSrc: requireText(garment.imgSrc, 'garment.imgSrc'),
    category: requireText(garment.category, 'garment.category'),
    subtype: text(garment.subtype),
    primaryColor: text(garment.primaryColor || garment.colorName),
    secondaryColors: stringList(garment.secondaryColors),
    pattern: text(garment.pattern),
    material: text(garment.material),
    thickness: text(garment.thickness, 'unknown'),
    seasons: stringList(garment.seasons),
    warmth: Number.isFinite(garment.warmth) ? garment.warmth : null,
    formality: text(garment.formality, 'casual'),
    styles: stringList(garment.styles),
    functional: stringList(garment.functional),
    tagConfidence: Number.isFinite(garment.tagConfidence) ? garment.tagConfidence : null,
    tagSource: text(garment.tagSource, 'manual'),
    status,
    fav: Boolean(garment.fav),
    worn: Number.isFinite(garment.worn) ? Math.max(0, garment.worn) : 0,
    lastWornAt: text(garment.lastWornAt) || null,
    addedAt: text(garment.addedAt) || null,
    schemaVersion: 2
  };
}

export function validateRecommendationRequest(value) {
  const request = requireObject(value, 'recommendation request');
  const garments = Array.isArray(request.garments)
    ? request.garments.map(validateGarment)
    : [];

  return {
    message: requireText(request.message, 'message'),
    city: requireText(request.city, 'city'),
    date: text(request.date) || null,
    garments,
    profile: request.profile && typeof request.profile === 'object' ? request.profile : {},
    constraints: request.constraints && typeof request.constraints === 'object'
      ? request.constraints
      : {}
  };
}

export function validateRecommendationResult(value, allowedIds) {
  const result = requireObject(value, 'recommendation result');
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);
  const outfits = Array.isArray(result.outfits) ? result.outfits : [];

  for (const outfit of outfits) {
    requireObject(outfit, 'outfit');
    if (!Array.isArray(outfit.garmentIds)) {
      throw new TypeError('outfit.garmentIds must be an array');
    }
    for (const id of outfit.garmentIds) {
      if (!allowed.has(id)) {
        throw new TypeError(`garment id is not allowed: ${id}`);
      }
    }
  }

  return { ...result, outfits };
}
