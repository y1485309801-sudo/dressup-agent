const SCHEMA_VERSION = 2;
const KEYS = {
  garments: 'dressup_v2_garments',
  profile: 'dressup_v2_profile',
  calendar: 'dressup_v2_calendar',
  inspo: 'dressup_v2_inspo',
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
    id: String(value.id || `garment-${crypto.randomUUID?.() || Date.now()}`),
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

  storage.setItem(KEYS.migrated, 'true');
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
    saveProfile: profile => write(KEYS.profile, { ...profile, schemaVersion: SCHEMA_VERSION }),
    getCalendar: () => read(KEYS.calendar, {}),
    saveCalendar: calendar => write(KEYS.calendar, calendar),
    getInspo: () => read(KEYS.inspo, []),
    saveInspo: inspo => write(KEYS.inspo, inspo)
  };
}

export { SCHEMA_VERSION };
