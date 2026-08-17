const SCHEMA_VERSION = 2;
const KEYS = {
  garments: 'dressup_v2_garments',
  profile: 'dressup_v2_profile',
  calendar: 'dressup_v2_calendar',
  inspo: 'dressup_v2_inspo',
  history: 'dressup_v2_history',
  feedback: 'dressup_v2_feedback',
  tryOn: 'dressup_v2_try_on',
  migrated: 'dressup_v2_migrated'
};

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function strings(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function migrateGarment(value = {}) {
  return {
    id: String(value.id || `garment-${globalThis.crypto?.randomUUID?.() || Date.now()}`),
    imgSrc: String(value.imgSrc || ''),
    category: String(value.category || 'other'),
    subtype: String(value.subtype || ''),
    primaryColor: String(value.primaryColor || value.colorName || ''),
    secondaryColors: strings(value.secondaryColors),
    pattern: String(value.pattern || ''),
    material: String(value.material || ''),
    thickness: String(value.thickness || 'unknown'),
    seasons: strings(value.seasons),
    warmth: Number.isFinite(value.warmth) ? value.warmth : null,
    formality: String(value.formality || 'casual'),
    styles: strings(value.styles),
    functional: strings(value.functional),
    tagConfidence: Number.isFinite(value.tagConfidence) ? value.tagConfidence : null,
    tagSource: String(value.tagSource || 'legacy'),
    status: ['available', 'laundry', 'stored', 'disabled'].includes(value.status)
      ? value.status
      : 'available',
    fav: Boolean(value.fav),
    worn: Number.isFinite(value.worn) ? Math.max(0, value.worn) : 0,
    lastWornAt: value.lastWornAt || null,
    addedAt: value.addedAt || null,
    schemaVersion: SCHEMA_VERSION
  };
}

function migrate(storage) {
  if (storage.getItem(KEYS.migrated) === 'true') return;

  const existingGarments = storage.getItem(KEYS.garments);
  const legacyGarments = parseJson(storage.getItem('dressup_clothes'), []);
  const legacyCalendar = parseJson(storage.getItem('dressup_calendar'), {});
  const legacyInspo = parseJson(storage.getItem('dressup_inspo'), []);

  if (existingGarments === null) {
    storage.setItem(KEYS.garments, JSON.stringify(
      Array.isArray(legacyGarments) ? legacyGarments.map(migrateGarment) : []
    ));
  }
  if (storage.getItem(KEYS.profile) === null) {
    storage.setItem(KEYS.profile, JSON.stringify({ schemaVersion: SCHEMA_VERSION }));
  }
  if (storage.getItem(KEYS.calendar) === null) {
    storage.setItem(KEYS.calendar, JSON.stringify(legacyCalendar));
  }
  if (storage.getItem(KEYS.inspo) === null) {
    storage.setItem(KEYS.inspo, JSON.stringify(legacyInspo));
  }
  if (storage.getItem(KEYS.history) === null) {
    storage.setItem(KEYS.history, JSON.stringify([]));
  }
  if (storage.getItem(KEYS.feedback) === null) {
    storage.setItem(KEYS.feedback, JSON.stringify([]));
  }
  if (storage.getItem(KEYS.tryOn) === null) {
    storage.setItem(KEYS.tryOn, JSON.stringify(null));
  }

  storage.setItem(KEYS.migrated, 'true');
}

function normalizedProfile(profile = {}) {
  const city = typeof profile.city === 'string' ? profile.city.trim() : '';
  const temperatureSensitivity = profile.temperatureSensitivity || '';
  if (!city) throw new TypeError('city is required');
  if (!['cold', 'normal', 'neutral', 'warm'].includes(temperatureSensitivity)) {
    throw new TypeError('temperatureSensitivity is required');
  }
  const arrays = ['styles', 'likedColors', 'avoidedColors', 'forbidden'];
  const result = { ...profile, city, temperatureSensitivity, schemaVersion: SCHEMA_VERSION };
  for (const key of arrays) result[key] = Array.isArray(profile[key]) ? profile[key] : [];
  result.accessories = profile.accessories !== false;
  return result;
}

export function createStore(storage = globalThis.localStorage) {
  if (!storage) {
    throw new TypeError('A storage implementation is required');
  }
  migrate(storage);

  const read = (key, fallback) => parseJson(storage.getItem(key), fallback);
  const write = (key, value) => {
    storage.setItem(key, JSON.stringify(value));
    return value;
  };

  return {
    getGarments: () => read(KEYS.garments, []).map(migrateGarment),
    saveGarments: garments => write(KEYS.garments, garments.map(migrateGarment)),
    getProfile: () => read(KEYS.profile, {}),
    saveProfile: profile => write(KEYS.profile, normalizedProfile(profile)),
    getCalendar: () => read(KEYS.calendar, {}),
    saveCalendar: calendar => write(KEYS.calendar, calendar),
    getInspo: () => read(KEYS.inspo, []),
    saveInspo: inspo => write(KEYS.inspo, inspo),
    getHistory: () => read(KEYS.history, []),
    saveHistory: history => write(KEYS.history, history),
    getGarment: id => read(KEYS.garments, []).map(migrateGarment).find(item => item.id === id) || null,
    getFeedback: () => read(KEYS.feedback, []),
    recordFeedback(feedback) {
      const createdAt = new Date().toISOString();
      const event = {
        ...feedback,
        id: `feedback-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
        garmentIds: Array.isArray(feedback.garmentIds) ? feedback.garmentIds : [],
        createdAt
      };
      if (event.type === 'worn') {
        const ids = new Set(event.garmentIds);
        const garments = read(KEYS.garments, []).map(migrateGarment).map(item =>
          ids.has(item.id)
            ? { ...item, worn: item.worn + 1, lastWornAt: createdAt }
            : item
        );
        write(KEYS.garments, garments);
      }
      write(KEYS.feedback, [...read(KEYS.feedback, []), event]);
      return event;
    },
    undoFeedback(eventId) {
      const events = read(KEYS.feedback, []);
      const event = events.find(item => item.id === eventId);
      if (!event || event.undoneAt) return false;
      const undoneAt = new Date().toISOString();
      if (event.type === 'worn') {
        const ids = new Set(event.garmentIds);
        const garments = read(KEYS.garments, []).map(migrateGarment).map(item =>
          ids.has(item.id)
            ? { ...item, worn: Math.max(0, item.worn - 1) }
            : item
        );
        write(KEYS.garments, garments);
      }
      write(KEYS.feedback, events.map(item => item.id === eventId ? { ...item, undoneAt } : item));
      return true;
    },
    getTryOnSelection: () => read(KEYS.tryOn, null),
    saveTryOnSelection: selection => write(KEYS.tryOn, selection)
  };
}

export { SCHEMA_VERSION };
