const STATUS_LABELS = {
  available: '可穿',
  laundry: '清洗中',
  stored: '已收纳',
  disabled: '停用'
};

function values(value) {
  return String(value || '').split(/[,，、]/).map(item => item.trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function tagSourceForState(state) {
  return state === 'manual' ? 'manual' : 'ai';
}

async function fileToCompressedDataUrl(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error('图片不能超过 15 MB');
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const item = new Image();
    item.onload = () => resolve(item);
    item.onerror = reject;
    item.src = source;
  });
  const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .84);
}

export function createWardrobeController({ store, api }) {
  const input = document.querySelector('#garmentFile');
  const grid = document.querySelector('#wardrobeGrid');
  const empty = document.querySelector('#emptyWardrobe');
  const count = document.querySelector('#availableCount');
  const dialog = document.querySelector('#garmentDialog');
  const form = document.querySelector('#garmentForm');
  const preview = document.querySelector('#garmentPreview');
  const badge = document.querySelector('#analysisBadge');
  const notice = document.querySelector('#analysisNotice');
  let imageDataUrl = '';
  let state = 'idle';

  function render() {
    const garments = store.getGarments();
    const available = garments.filter(item => item.status === 'available');
    count.textContent = String(available.length);
    empty.classList.toggle('hidden', garments.length > 0);
    grid.replaceChildren();
    for (const garment of garments) {
      const card = document.createElement('article');
      card.className = `garment-card ${garment.status === 'available' ? '' : 'unavailable'}`;
      card.innerHTML = `<img src="${escapeHtml(garment.imgSrc)}" alt="${escapeHtml(garment.subtype || garment.category)}">
        <span class="status-dot">${escapeHtml(STATUS_LABELS[garment.status] || garment.status)}</span>
        <div class="garment-meta"><strong>${escapeHtml(garment.subtype || garment.category)}</strong><span>${escapeHtml(garment.primaryColor || '未标颜色')} · ${escapeHtml(garment.thickness)}</span></div>`;
      card.onclick = () => {
        const next = window.prompt('状态：available / laundry / stored / disabled', garment.status);
        if (!STATUS_LABELS[next]) return;
        store.saveGarments(garments.map(item => item.id === garment.id ? { ...item, status: next } : item));
        render();
      };
      grid.append(card);
    }
  }

  function fill(tags = {}) {
    for (const name of ['category', 'subtype', 'primaryColor', 'thickness']) {
      if (tags[name] != null) form.elements[name].value = tags[name];
    }
    form.elements.seasons.value = (tags.seasons || []).join(',');
    form.elements.styles.value = (tags.styles || []).join(',');
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || ['compressing', 'analyzing', 'saving'].includes(state)) return;
    dialog.showModal();
    state = 'compressing';
    badge.textContent = '正在压缩';
    notice.textContent = '';
    try {
      imageDataUrl = await fileToCompressedDataUrl(file);
      preview.src = imageDataUrl;
      state = 'analyzing';
      badge.textContent = 'AI 识别中';
      const result = await api.analyzeGarment(imageDataUrl);
      fill(result.tags);
      state = 'review';
      badge.textContent = result.needsReview ? '请重点确认' : 'AI 已识别';
      notice.textContent = result.needsReview ? `识别置信度 ${Math.round(result.confidence * 100)}%，请确认后保存。` : '标签可修改，确认无误后保存。';
    } catch (error) {
      state = 'manual';
      badge.textContent = '手动填写';
      notice.textContent = error.message || 'AI 暂时不可用，请手动填写标签。';
    }
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!imageDataUrl || state === 'saving') return;
    const tagSource = tagSourceForState(state);
    state = 'saving';
    const garments = store.getGarments();
    const garment = {
      id: `garment-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      imgSrc: imageDataUrl,
      category: form.elements.category.value,
      subtype: form.elements.subtype.value.trim(),
      primaryColor: form.elements.primaryColor.value.trim(),
      secondaryColors: [],
      pattern: 'other',
      material: '',
      thickness: form.elements.thickness.value,
      seasons: values(form.elements.seasons.value),
      warmth: null,
      formality: 'casual',
      styles: values(form.elements.styles.value),
      functional: [],
      tagConfidence: null,
      tagSource,
      status: form.elements.status.value,
      fav: false,
      worn: 0,
      lastWornAt: null,
      addedAt: new Date().toISOString(),
      schemaVersion: 2
    };
    store.saveGarments([garment, ...garments]);
    dialog.close();
    form.reset();
    imageDataUrl = '';
    state = 'idle';
    render();
  });

  document.querySelector('#cancelGarment').onclick = () => {
    dialog.close();
    imageDataUrl = '';
    state = 'idle';
  };

  render();
  return { render };
}
