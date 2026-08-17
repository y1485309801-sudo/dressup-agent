import { api } from './api.js';
import { createAgentController } from './agent.js';
import { bindProfile } from './profile.js';
import { createStore } from './store.js';
import { createWardrobeController } from './wardrobe.js';

const store = createStore(localStorage);
const weatherChip = document.querySelector('#weatherChip');

function navigate(page) {
  document.querySelectorAll('.page').forEach(item => item.classList.toggle('active', item.dataset.page === page));
  document.querySelectorAll('.bottom-nav [data-nav]').forEach(item => item.classList.toggle('active', item.dataset.nav === page));
  if (page === 'calendar') renderCalendar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function weatherIcon(condition) {
  return { clear: '☀', cloudy: '☁', rain: '☂', snow: '❄', storm: 'ϟ', fog: '≋' }[condition] || '◌';
}

async function refreshWeather(profile) {
  if (!profile?.city) return;
  const date = new Date().toISOString().slice(0, 10);
  weatherChip.innerHTML = '<span class="weather-icon">◌</span><span class="weather-copy"><strong>查询中</strong><small>正在获取天气</small></span>';
  try {
    const result = await api.weather({ city: profile.city, date });
    const temperature = result.current?.apparentTemperature ?? result.current?.temperature;
    weatherChip.innerHTML = `<span class="weather-icon">${weatherIcon(result.current?.condition)}</span>
      <span class="weather-copy"><strong>${result.city} · ${temperature ?? '--'}°</strong><small>${result.source === 'cache' ? '缓存天气' : '刚刚更新'}</small></span>`;
  } catch (error) {
    weatherChip.innerHTML = `<span class="weather-icon">!</span><span class="weather-copy"><strong>${profile.city}</strong><small>天气不可用，可在对话中手动说明</small></span>`;
  }
}

function renderCalendar() {
  const root = document.querySelector('#calendarList');
  const empty = document.querySelector('#emptyCalendar');
  const entries = Object.entries(store.getCalendar()).sort(([a], [b]) => a.localeCompare(b));
  root.replaceChildren();
  empty.classList.toggle('hidden', entries.length > 0);
  for (const [date, outfit] of entries) {
    const item = document.createElement('article');
    item.className = 'calendar-item';
    item.innerHTML = `<strong>${date}</strong><p>${outfit.garmentIds?.length || 0} 件单品 · ${outfit.variant || '计划搭配'}</p>`;
    root.append(item);
  }
}

document.querySelectorAll('[data-nav]').forEach(button => {
  button.addEventListener('click', () => navigate(button.dataset.nav));
});
weatherChip.addEventListener('click', () => navigate('profile'));

const wardrobe = createWardrobeController({ store, api });
createAgentController({ store, api, onNavigate: navigate });
const profile = bindProfile({
  store,
  onSaved(saved) {
    refreshWeather(saved);
    wardrobe.render();
  }
});
if (profile.city) refreshWeather(profile);
renderCalendar();
