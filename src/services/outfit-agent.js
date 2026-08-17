import { recommendOutfits as defaultRecommendOutfits } from '../domain/recommendation.js';
import { validateRecommendationResult } from '../domain/validation.js';
import { parseIntent } from './intent-parser.js';

function defaultReply(outfits, gaps) {
  if (outfits.length) {
    return `结合天气和你的衣橱，我准备了 ${outfits.length} 套搭配。你可以继续说“换一套”“正式一点”或“不要这件裤子”。`;
  }
  if (gaps.length) {
    return gaps.map(gap => gap.reason).join('；');
  }
  return '这次没有找到合适的组合，请告诉我更多场合要求。';
}

function explanationIsSafe(value, candidateIds) {
  if (!value || typeof value.reply !== 'string') return false;
  const ids = Array.isArray(value.garmentIds) ? value.garmentIds : [];
  return ids.every(id => candidateIds.has(id));
}

export function createOutfitAgent({
  weather,
  recommendOutfits = defaultRecommendOutfits,
  aiClient = null,
  now = () => new Date()
}) {
  async function run(input, mode) {
    const profile = input.profile || {};
    const garments = Array.isArray(input.garments) ? input.garments : [];
    const history = Array.isArray(input.history) ? input.history : [];
    const previousSession = input.session || {};
    const parsed = parseIntent({
      message: input.message,
      profile,
      session: previousSession,
      garments,
      now
    });

    if (!parsed.city) {
      return {
        session: { ...previousSession, constraints: parsed.constraints },
        weather: null,
        outfits: [],
        gaps: [],
        reply: '先告诉我你的常住城市，之后我会自动查询天气。',
        needsClarification: true
      };
    }

    const weatherResult = previousSession.weather &&
      previousSession.city === parsed.city &&
      previousSession.date === parsed.date
      ? previousSession.weather
      : await weather.getWeather({ city: parsed.city, date: parsed.date });

    const recommended = recommendOutfits({
      garments,
      profile,
      weather: weatherResult,
      constraints: parsed.constraints,
      history: mode === 'refine' && previousSession.selectedOutfit
        ? [previousSession.selectedOutfit, ...history]
        : history,
      limit: 3
    });

    const locked = new Set(parsed.constraints.lockedIds || []);
    const lockedOutfits = locked.size
      ? recommended.outfits.filter(outfit =>
          [...locked].every(id => outfit.garmentIds.includes(id))
        )
      : recommended.outfits;
    const allowedIds = new Set(garments.map(garment => garment.id));
    const validated = validateRecommendationResult(
      { ...recommended, outfits: lockedOutfits },
      allowedIds
    );
    const candidateIds = new Set(validated.outfits.flatMap(outfit => outfit.garmentIds));

    let reply = defaultReply(validated.outfits, validated.gaps);
    if (aiClient && validated.outfits.length) {
      try {
        const explanation = await aiClient.completeJson({
          system: 'Return JSON with reply and garmentIds. Mention only candidate garment IDs.',
          prompt: JSON.stringify({
            message: input.message,
            outfits: validated.outfits,
            allowedGarmentIds: [...candidateIds]
          }),
          model: null
        });
        if (explanationIsSafe(explanation, candidateIds)) {
          reply = explanation.reply;
        }
      } catch {
        // Deterministic recommendations remain usable when optional copy generation fails.
      }
    }

    const session = {
      id: previousSession.id || `session-${now().getTime()}`,
      city: parsed.city,
      date: parsed.date,
      constraints: parsed.constraints,
      weather: weatherResult,
      selectedOutfit: validated.outfits[0] || previousSession.selectedOutfit || null
    };

    return {
      session,
      weather: weatherResult,
      outfits: validated.outfits,
      gaps: validated.gaps,
      reply,
      needsClarification: false
    };
  }

  return {
    recommend: input => run(input, 'recommend'),
    refine: input => run(input, 'refine')
  };
}
