const VARIANT_LABELS = {
  safe: '最稳妥',
  comfort: '更舒适',
  style: '更有风格'
};

export function buildAgentPayload({ message, profile, garments, history = [], session = null }) {
  return {
    message: String(message || '').trim(),
    profile,
    garments: (garments || [])
      .filter(garment => garment.status === 'available')
      .map(({ imgSrc, ...metadata }) => metadata),
    history: history.slice(0, 20),
    ...(session ? { session } : {})
  };
}

export function mapOutfitsToCards(outfits, garments) {
  const lookup = new Map((garments || []).map(item => [item.id, item]));
  return (outfits || []).flatMap(outfit => {
    const items = outfit.garmentIds.map(id => lookup.get(id));
    if (items.some(item => !item || item.status !== 'available')) return [];
    return [{ ...outfit, garments: items }];
  });
}

function messageElement(text, role) {
  const article = document.createElement('article');
  article.className = `message ${role}-message`;
  if (role === 'agent') {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'D';
    article.append(avatar);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  article.append(bubble);
  return article;
}

function garmentLabel(garment) {
  return garment.subtype || garment.primaryColor || garment.category || '单品';
}

export function createAgentController({ store, api, onNavigate }) {
  const form = document.querySelector('#agentForm');
  const input = document.querySelector('#agentInput');
  const conversation = document.querySelector('#conversation');
  const cardsRoot = document.querySelector('#outfitCards');
  const stateRoot = document.querySelector('#agentState');
  let session = null;
  let busy = false;

  function setState(text, kind = '') {
    stateRoot.textContent = text;
    stateRoot.className = text ? `agent-state ${kind}` : 'agent-state hidden';
  }

  function renderCards(outfits) {
    const cards = mapOutfitsToCards(outfits, store.getGarments());
    cardsRoot.replaceChildren();
    if (outfits?.length && !cards.length) {
      setState('返回的搭配包含未知或不可穿衣物，已为你拦截，请重试。');
      return;
    }
    for (const outfit of cards) {
      const card = document.createElement('article');
      card.className = 'outfit-card';
      card.innerHTML = `
        <div class="outfit-card-head">
          <span class="variant-label">${VARIANT_LABELS[outfit.variant] || '推荐搭配'}</span>
          <span class="outfit-score">${outfit.score ? `匹配 ${Math.round(outfit.score)}` : ''}</span>
        </div>
        <div class="outfit-garments"></div>
        <p class="outfit-reason">${(outfit.reasons || []).join(' · ')}</p>
        <div class="outfit-actions">
          <button class="wear-button" data-action="wear">穿这套</button>
          <button data-action="change">换一套</button>
          <button data-action="like">收藏</button>
          <button data-action="calendar">加入日历</button>
          <button data-action="tryon">AI 试穿</button>
          <button data-action="dislike">不喜欢</button>
        </div>`;
      const garmentRoot = card.querySelector('.outfit-garments');
      for (const garment of outfit.garments) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'outfit-garment';
        button.innerHTML = `<img src="${garment.imgSrc}" alt="${garmentLabel(garment)}"><span>${garmentLabel(garment)}</span>`;
        button.addEventListener('click', () => {
          const keep = window.confirm('保留这件？点“取消”可选择不要这件。');
          submit(`${keep ? '保留' : '不要'}这件 ${garment.id}`, true);
        });
        garmentRoot.append(button);
      }
      card.querySelector('[data-action="change"]').onclick = () => submit('换一套', true);
      card.querySelector('[data-action="like"]').onclick = () => {
        store.recordFeedback({ type: 'liked', outfitId: outfit.id, garmentIds: outfit.garmentIds, sessionId: session?.id });
        setState('已收藏这套搭配。');
      };
      card.querySelector('[data-action="dislike"]').onclick = () => {
        const reason = window.prompt('哪里不合适？可填：太冷 / 太热 / 太正式 / 太休闲 / 颜色 / 某件单品', '某件单品');
        store.recordFeedback({ type: 'disliked', reason: reason || 'unspecified', outfitId: outfit.id, garmentIds: outfit.garmentIds, sessionId: session?.id });
        submit('不要这套，换一套', true);
      };
      card.querySelector('[data-action="tryon"]').onclick = () => {
        store.saveTryOnSelection({ outfitId: outfit.id, garmentIds: outfit.garmentIds, createdAt: new Date().toISOString() });
        onNavigate('tryon');
      };
      card.querySelector('[data-action="wear"]').onclick = () => {
        const history = store.getHistory();
        store.saveHistory([{ ...outfit, wornAt: new Date().toISOString() }, ...history]);
        const event = store.recordFeedback({ type: 'worn', outfitId: outfit.id, garmentIds: outfit.garmentIds, sessionId: session?.id });
        setState('已记录今天穿这套。再次点击消息可在“我的”反馈记录中撤销。');
        stateRoot.onclick = () => {
          store.undoFeedback(event.id);
          setState('已撤销穿着记录。');
          stateRoot.onclick = null;
        };
      };
      card.querySelector('[data-action="calendar"]').onclick = () => {
        const calendar = store.getCalendar();
        const date = session?.date || new Date().toISOString().slice(0, 10);
        calendar[date] = { ...outfit, planned: true, weather: session?.weather };
        store.saveCalendar(calendar);
        setState(`已加入 ${date} 的穿搭日历。`);
      };
      cardsRoot.append(card);
    }
  }

  async function submit(text, refine = Boolean(session)) {
    const message = String(text || input.value).trim();
    if (!message || busy) return;
    const profile = store.getProfile();
    if (!profile.city) {
      setState('请先在“我的”里设置常住城市。');
      return;
    }
    busy = true;
    input.value = '';
    conversation.append(messageElement(message, 'user'));
    setState('正在查看天气和衣橱…', 'loading-dots');
    const payload = buildAgentPayload({
      message,
      profile,
      garments: store.getGarments(),
      history: store.getHistory(),
      session
    });
    try {
      const result = refine ? await api.refine(payload) : await api.recommend(payload);
      session = result.session;
      conversation.append(messageElement(result.reply, 'agent'));
      renderCards(result.outfits);
      setState(result.gaps?.length ? result.gaps.map(gap => gap.reason).join('；') : '');
    } catch (error) {
      setState(error.code === 'TIMEOUT' ? '请求超时了，文字已保留，请再试一次。' : '暂时无法完成推荐，请稍后重试。');
      input.value = message;
    } finally {
      busy = false;
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    submit();
  });
  document.querySelectorAll('[data-prompt]').forEach(button => {
    button.addEventListener('click', () => submit(button.dataset.prompt));
  });

  return { submit };
}
