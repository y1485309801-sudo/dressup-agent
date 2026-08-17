function splitValues(value) {
  return String(value || '').split(/[,，]/).map(item => item.trim()).filter(Boolean);
}

export function profileFromForm(form) {
  const data = new FormData(form);
  return {
    city: String(data.get('city') || '').trim(),
    temperatureSensitivity: String(data.get('temperatureSensitivity') || 'normal'),
    styles: splitValues(data.get('styles')),
    avoidedColors: splitValues(data.get('avoidedColors')),
    likedColors: [],
    forbidden: [],
    accessories: true
  };
}

export function fillProfileForm(form, profile = {}) {
  form.elements.city.value = profile.city || '';
  form.elements.styles.value = (profile.styles || []).join('、');
  form.elements.avoidedColors.value = (profile.avoidedColors || []).join('、');
  const sensitivity = form.querySelector(`[name="temperatureSensitivity"][value="${profile.temperatureSensitivity || 'normal'}"]`);
  if (sensitivity) sensitivity.checked = true;
}

export function bindProfile({ store, onSaved }) {
  const dialog = document.querySelector('#onboardingDialog');
  const onboarding = document.querySelector('#onboardingForm');
  const profileForm = document.querySelector('#profileForm');
  const notice = document.querySelector('#profileNotice');
  const existing = store.getProfile();

  fillProfileForm(profileForm, existing);
  if (!existing.city) dialog.showModal();

  onboarding.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(onboarding);
    const profile = store.saveProfile({
      city: data.get('city'),
      temperatureSensitivity: data.get('temperatureSensitivity'),
      styles: [],
      avoidedColors: [],
      likedColors: [],
      forbidden: [],
      accessories: true
    });
    fillProfileForm(profileForm, profile);
    dialog.close();
    onSaved(profile);
  });

  profileForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const profile = store.saveProfile(profileFromForm(profileForm));
      notice.textContent = '已保存';
      onSaved(profile);
    } catch (error) {
      notice.textContent = error.message;
    }
  });

  return existing;
}
