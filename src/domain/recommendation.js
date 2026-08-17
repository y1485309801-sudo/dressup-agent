const VARIANTS = ['safe', 'comfort', 'style'];
const FORMALITY = new Map([
  ['sport', 0],
  ['casual', 1],
  ['smart-casual', 2],
  ['business', 3],
  ['formal', 4]
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function currentTemperature(weather) {
  const value = weather?.current?.apparentTemperature;
  return Number.isFinite(value) ? value : 20;
}

function isWet(weather) {
  return Number(weather?.current?.precipitation || 0) > 0 ||
    Number(weather?.daily?.precipitationProbability || 0) >= 50;
}

function seasonForTemperature(temperature) {
  if (temperature <= 10) return 'winter';
  if (temperature <= 18) return 'autumn';
  if (temperature >= 27) return 'summer';
  return 'spring';
}

function isWaterproof(garment) {
  return list(garment.functional).includes('waterproof');
}

function filterGarments(garments, constraints, weather) {
  const forbiddenIds = new Set(list(constraints.forbiddenIds));
  const forbiddenCategories = new Set(list(constraints.forbiddenCategories));
  const forbiddenColors = new Set(list(constraints.forbiddenColors));
  const temperature = currentTemperature(weather);
  const season = seasonForTemperature(temperature);
  const wet = isWet(weather);

  return list(garments).filter(garment => {
    if (!garment || garment.status !== 'available') return false;
    if (forbiddenIds.has(garment.id)) return false;
    if (forbiddenCategories.has(garment.category)) return false;
    if (forbiddenColors.has(garment.primaryColor)) return false;
    if (list(garment.seasons).length && !garment.seasons.includes(season)) return false;
    if (garment.category === 'outer' && temperature <= 8 && Number(garment.warmth || 0) < 4) {
      return false;
    }
    if (wet && (garment.category === 'outer' || garment.category === 'shoes') && !isWaterproof(garment)) {
      return false;
    }
    return true;
  });
}

function byCategory(garments, category) {
  return garments.filter(garment => garment.category === category);
}

function wardrobeGaps(groups, { needsOuter, wet }) {
  const gaps = [];
  if (!groups.tops.length && !groups.dresses.length) {
    gaps.push({ category: 'top', reason: '没有可穿的上装或连衣装' });
  }
  if (groups.tops.length && !groups.bottoms.length) {
    gaps.push({ category: 'bottom', reason: '没有可穿的下装' });
  }
  if (!groups.shoes.length) {
    gaps.push({ category: 'shoes', reason: wet ? '没有适合雨天的鞋' : '没有可穿的鞋' });
  }
  if (needsOuter && !groups.outers.length) {
    gaps.push({
      category: 'outer',
      reason: wet ? '衣橱暂时缺少适合雨天的外套' : '天气较冷，但衣橱暂时缺少适合的外套'
    });
  }
  return gaps;
}

function combinations(groups, needsOuter) {
  const outfits = [];
  const outers = needsOuter ? groups.outers : [null];

  for (const top of groups.tops) {
    for (const bottom of groups.bottoms) {
      for (const shoes of groups.shoes) {
        for (const outer of outers) {
          outfits.push([top, bottom, shoes, outer].filter(Boolean));
          if (outfits.length >= 500) return outfits;
        }
      }
    }
  }

  for (const dress of groups.dresses) {
    for (const shoes of groups.shoes) {
      for (const outer of outers) {
        outfits.push([dress, shoes, outer].filter(Boolean));
        if (outfits.length >= 500) return outfits;
      }
    }
  }
  return outfits;
}

function formalityScore(garments, requested) {
  const target = FORMALITY.get(requested) ?? FORMALITY.get('smart-casual');
  const distances = garments.map(garment =>
    Math.abs((FORMALITY.get(garment.formality) ?? 1) - target)
  );
  const average = distances.reduce((sum, value) => sum + value, 0) / garments.length;
  return Math.max(0, 25 - average * 8);
}

function preferenceScore(garments, profile) {
  const preferred = new Set(list(profile.preferredStyles));
  if (!preferred.size) return 12;
  const matches = garments.reduce(
    (sum, garment) => sum + list(garment.styles).filter(style => preferred.has(style)).length,
    0
  );
  return Math.min(20, matches * 7);
}

function colorScore(garments) {
  const colors = garments.map(garment => garment.primaryColor).filter(Boolean);
  const unique = new Set(colors);
  return Math.max(5, 15 - Math.max(0, unique.size - 3) * 3);
}

function recencyScore(garments, history) {
  const recentIds = new Set(list(history).slice(0, 7).flatMap(item => list(item.garmentIds)));
  const repeated = garments.filter(garment => recentIds.has(garment.id)).length;
  return Math.max(0, 10 - repeated * 3);
}

function candidate(garments, request) {
  const temperature = currentTemperature(request.weather);
  const warmth = garments.reduce((sum, garment) => sum + Number(garment.warmth || 0), 0);
  const styles = new Set(garments.flatMap(garment => list(garment.styles)));
  const preferred = new Set(list(request.profile.preferredStyles));
  const styleMatches = [...styles].filter(style => preferred.has(style)).length;
  const weatherScore = 30;
  const occasionScore = formalityScore(garments, request.constraints.formality);
  const preferences = preferenceScore(garments, request.profile);
  const colors = colorScore(garments);
  const recency = recencyScore(garments, request.history);

  return {
    garments,
    score: Math.round((weatherScore + occasionScore + preferences + colors + recency) * 10) / 10,
    warmth,
    styleMatches,
    temperature,
    reasons: [
      `适合体感温度 ${temperature}°C`,
      occasionScore >= 17 ? '符合这次场合的正式度' : '在舒适与场合之间做了平衡',
      preferences >= 12 ? '贴近你的常用风格' : '颜色组合容易驾驭'
    ]
  };
}

function selectVariants(candidates, limit) {
  const selected = [];
  for (const variant of VARIANTS.slice(0, limit)) {
    const ranked = [...candidates].sort((left, right) => {
      const adjust = item => {
        if (variant === 'comfort') return item.score + item.warmth * 2;
        if (variant === 'style') return item.score + item.styleMatches * 6;
        return item.score;
      };
      return adjust(right) - adjust(left) ||
        left.garments.map(item => item.id).join('|').localeCompare(
          right.garments.map(item => item.id).join('|')
        );
    });
    const next = ranked.find(item => {
      const signature = item.garments.map(garment => garment.id).sort().join('|');
      return !selected.some(existing => existing.signature === signature);
    });
    if (!next) break;
    selected.push({
      ...next,
      variant,
      signature: next.garments.map(garment => garment.id).sort().join('|')
    });
  }
  return selected;
}

export function recommendOutfits({
  garments = [],
  profile = {},
  weather = {},
  constraints = {},
  history = [],
  limit = 3
} = {}) {
  const temperature = currentTemperature(weather);
  const wet = isWet(weather);
  const needsOuter = temperature <= 12 || wet;
  const eligible = filterGarments(garments, constraints, weather);
  const groups = {
    tops: byCategory(eligible, 'top'),
    bottoms: byCategory(eligible, 'bottom'),
    dresses: byCategory(eligible, 'dress'),
    shoes: byCategory(eligible, 'shoes'),
    outers: byCategory(eligible, 'outer')
  };
  const gaps = wardrobeGaps(groups, { needsOuter, wet });
  if (gaps.length) return { outfits: [], gaps };

  const request = { profile, weather, constraints, history };
  const candidates = combinations(groups, needsOuter).map(items => candidate(items, request));
  const selected = selectVariants(candidates, Math.max(1, Math.min(3, limit)));

  return {
    outfits: selected.map((item, index) => ({
      id: `outfit-${index + 1}`,
      garmentIds: item.garments.map(garment => garment.id),
      score: item.score,
      variant: item.variant,
      reasons: item.reasons,
      temperatureRange: {
        min: Math.round(item.temperature - 4),
        max: Math.round(item.temperature + 4)
      },
      occasion: constraints.occasion || 'daily'
    })),
    gaps: []
  };
}
