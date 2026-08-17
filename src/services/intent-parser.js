const CATEGORY_TERMS = [
  { category: 'outer', terms: ['外套', '大衣', '风衣', '夹克'] },
  { category: 'bottom', terms: ['裤子', '下装', '裙子'] },
  { category: 'top', terms: ['上衣', '衬衫', '毛衣', 'T恤'] },
  { category: 'shoes', terms: ['鞋子', '鞋'] }
];

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function destinationCity(message) {
  const match = message.match(/去([\u4e00-\u9fff]{2,6}?)(?:见|开会|出差|旅游|玩|办事|参加|$)/);
  return match?.[1] || '';
}

function referencedId(message, prefix, garments, selectedIds) {
  const selected = new Set(selectedIds || []);
  const action = prefix.startsWith('保留') ? '保留' : /不要/.test(prefix) ? '不要' : '换掉';
  const actionIndex = message.indexOf(action);
  if (actionIndex < 0) return null;
  const segment = message.slice(actionIndex + action.length).split(/[，,。；;]/)[0];
  const categoryEntry = CATEGORY_TERMS.find(entry =>
    entry.terms.some(term => segment.includes(term))
  );
  if (!categoryEntry) return null;
  return garments.find(item => selected.has(item.id) && item.category === categoryEntry.category)?.id ||
    garments.find(item => item.category === categoryEntry.category)?.id ||
    null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function parseIntent({
  message,
  profile = {},
  session = {},
  garments = [],
  now = () => new Date()
}) {
  const text = String(message || '').trim();
  const previous = session.constraints || {};
  const constraints = {
    ...previous,
    lockedIds: [...(previous.lockedIds || [])],
    forbiddenIds: [...(previous.forbiddenIds || [])],
    forbiddenCategories: [...(previous.forbiddenCategories || [])],
    forbiddenColors: [...(previous.forbiddenColors || [])]
  };

  const city = destinationCity(text) || session.city || profile.city || '';
  const baseDate = now();
  if (text.includes('明天')) baseDate.setUTCDate(baseDate.getUTCDate() + 1);
  if (text.includes('后天')) baseDate.setUTCDate(baseDate.getUTCDate() + 2);
  const date = session.date && !/今天|明天|后天/.test(text)
    ? session.date
    : dateString(baseDate);

  if (/见客户|客户|面试|正式一点/.test(text)) {
    constraints.formality = 'formal';
    constraints.occasion = /面试/.test(text) ? 'interview' : 'client';
  } else if (/休闲一点|随意|逛街/.test(text)) {
    constraints.formality = 'casual';
    constraints.occasion = 'casual';
  } else if (/上班|开会|会议/.test(text)) {
    constraints.formality = constraints.formality || 'business';
    constraints.occasion = 'work';
  }

  if (/户外|室外/.test(text)) constraints.environment = 'outdoor';
  if (/室内/.test(text)) constraints.environment = 'indoor';
  if (/走路|步行|逛/.test(text)) constraints.walking = true;
  if (/暖和一点|怕冷/.test(text)) constraints.warmthBias = 1;
  if (/凉快一点|怕热/.test(text)) constraints.warmthBias = -1;

  const selectedIds = session.selectedOutfit?.garmentIds || [];
  if (text.includes('保留')) {
    const lockedId = referencedId(text, '保留这件', garments, selectedIds);
    constraints.lockedIds = unique([...constraints.lockedIds, lockedId]);
  }
  if (/不要|换掉/.test(text)) {
    const forbiddenId = referencedId(text, '不要这条', garments, selectedIds) ||
      referencedId(text, '不要这件', garments, selectedIds);
    constraints.forbiddenIds = unique([...constraints.forbiddenIds, forbiddenId]);
  }

  for (const garment of garments) {
    if (text.includes(garment.id)) {
      if (text.includes('保留')) constraints.lockedIds = unique([...constraints.lockedIds, garment.id]);
      if (/不要|换掉/.test(text)) {
        constraints.forbiddenIds = unique([...constraints.forbiddenIds, garment.id]);
      }
    }
  }

  return { city, date, constraints };
}
