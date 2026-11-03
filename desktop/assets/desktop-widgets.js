// mariowOS builder note: the widgets panel (Win+W or the widgets button on the bar). It
// slides in from the left over the desktop and shows, live while it is open:
//   clock and date · weather (Open-Meteo through the kernel, after the user agrees and picks
//   a city) · today's calendar events · the latest notes · what is playing, with controls.
// Everything it reads already exists in the desktop (calendarEvents, currentMediaState,
// sendMediaCommand, openCalendarApp, openPopup) or in the kernel (/api/system/notes,
// /api/widgets/weather). Which cards are shown is kept per user in localStorage.
(() => {
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
  const icon = name => el('span', 'material-symbols-outlined', name);
  const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };

  const css = document.createElement('style');
  css.textContent = `
    #mwWidgets { position: fixed; top: 12px; bottom: 76px; left: 12px; z-index: 99980; width: min(360px, calc(100vw - 24px));
      display: flex; flex-direction: column; gap: 10px; padding: 14px; box-sizing: border-box; overflow-y: auto; border-radius: 22px;
      background: rgba(14, 16, 22, .72); backdrop-filter: blur(30px) saturate(170%); color: #fff; font-family: 'Poppins', sans-serif;
      box-shadow: 0 20px 60px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.08);
      translate: calc(-100% - 24px) 0; opacity: 0; transition: translate .38s cubic-bezier(.2, .9, .3, 1), opacity .25s ease; pointer-events: none; }
    #mwWidgets.open { translate: 0 0; opacity: 1; pointer-events: auto; }
    #mwWidgets header { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 4px; }
    #mwWidgets header b { font-size: 15px; font-weight: 600; }
    #mwWidgets .mw-w-btn { border: 0; background: transparent; color: inherit; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; }
    #mwWidgets .mw-w-btn:hover { background: rgba(255,255,255,.1); }
    #mwWidgets .mw-card { border-radius: 16px; padding: 14px; background: rgba(255,255,255,.07); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
    #mwWidgets .mw-card h4 { margin: 0 0 8px; font-size: 12px; font-weight: 500; letter-spacing: .02em; color: rgba(255,255,255,.6); display: flex; align-items: center; gap: 6px; }
    #mwWidgets .mw-card h4 .material-symbols-outlined { font-size: 16px; }
    #mwWidgets .mw-clock { font-size: 44px; font-weight: 300; line-height: 1; }
    #mwWidgets .mw-date { margin-top: 6px; font-size: 13px; color: rgba(255,255,255,.7); text-transform: capitalize; }
    #mwWidgets .mw-weather { display: flex; align-items: center; gap: 14px; }
    #mwWidgets .mw-weather .material-symbols-outlined { font-size: 42px; color: #ffd36b; }
    #mwWidgets .mw-temp { font-size: 30px; font-weight: 500; }
    #mwWidgets .mw-muted { font-size: 12px; color: rgba(255,255,255,.6); }
    #mwWidgets .mw-row { display: flex; align-items: center; gap: 10px; padding: 7px 8px; margin: 0 -8px; border-radius: 10px; cursor: pointer; font-size: 13px; min-width: 0; }
    #mwWidgets .mw-row:hover { background: rgba(255,255,255,.08); }
    #mwWidgets .mw-row span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #mwWidgets .mw-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--m3-accent-text, #4da3ff); }
    #mwWidgets .mw-link { border: 0; background: rgba(255,255,255,.1); color: #fff; border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
    #mwWidgets .mw-link:hover { background: rgba(255,255,255,.16); }
    #mwWidgets .mw-media { display: flex; align-items: center; gap: 12px; }
    #mwWidgets .mw-cover { width: 52px; height: 52px; border-radius: 12px; flex-shrink: 0; background: rgba(255,255,255,.1) center / cover; display: grid; place-items: center; }
    #mwWidgets .mw-controls { display: flex; gap: 2px; margin-left: auto; }
    #mwWidgets .mw-edit { display: flex; flex-wrap: wrap; gap: 6px; }
    #mwWidgets .mw-edit label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 6px 10px; border-radius: 10px; background: rgba(255,255,255,.07); cursor: pointer; }
    :root[data-theme="light"] #mwWidgets { background: rgba(248, 249, 252, .82); color: #14171f; box-shadow: 0 20px 60px rgba(20,30,60,.18), inset 0 0 0 1px rgba(20,30,60,.08); }
    :root[data-theme="light"] #mwWidgets .mw-card { background: rgba(255,255,255,.75); box-shadow: inset 0 0 0 1px rgba(20,30,60,.06); }
    :root[data-theme="light"] #mwWidgets .mw-card h4, :root[data-theme="light"] #mwWidgets .mw-muted, :root[data-theme="light"] #mwWidgets .mw-date { color: rgba(20,23,31,.6); }
    :root[data-theme="light"] #mwWidgets :is(.mw-w-btn:hover, .mw-row:hover) { background: rgba(20,30,60,.07); }
    :root[data-theme="light"] #mwWidgets :is(.mw-link, .mw-edit label, .mw-cover) { background: rgba(20,30,60,.07); color: #14171f; }
    @media (prefers-reduced-motion: reduce) { #mwWidgets { transition: none; } }
  `;
  document.head.appendChild(css);

  const CARDS = ['clock', 'weather', 'calendar', 'notes', 'media'];
  const CARD_NAMES = {
    clock: () => mariowOSI18n.t('desktop.widgets.clock', 'Clock'), weather: () => mariowOSI18n.t('desktop.widgets.weather', 'Weather'),
    calendar: () => mariowOSI18n.t('desktop.widgets.calendar', 'Today'), notes: () => mariowOSI18n.t('desktop.widgets.notes', 'Notes'),
    media: () => mariowOSI18n.t('desktop.widgets.media', 'Now playing')
  };
  let shown = read('mwWidgetCards', CARDS);
  let editing = false, timer = 0, weatherData = null, weatherAt = 0, notesData = null, notesAt = 0;

  const panel = el('aside'); panel.id = 'mwWidgets';
  panel.setAttribute('aria-label', mariowOSI18n.t('desktop.widgets.title', 'Widgets'));
  document.body.appendChild(panel);

  function card(name, symbol, title) {
    const box = el('section', 'mw-card'); box.dataset.card = name;
    if (title) { const head = el('h4'); head.append(icon(symbol), document.createTextNode(title)); box.append(head); }
    return box;
  }

  function clockCard() {
    const box = card('clock');
    const now = new Date();
    box.append(el('div', 'mw-clock', now.toLocaleTimeString(mariowOSI18n.locale, { hour: '2-digit', minute: '2-digit' })),
      el('div', 'mw-date', now.toLocaleDateString(mariowOSI18n.locale, { weekday: 'long', day: 'numeric', month: 'long' })));
    return box;
  }

  const WEATHER_ICONS = [[0, 'sunny', 'clear_night'], [3, 'partly_cloudy_day', 'partly_cloudy_night'], [48, 'foggy'], [67, 'rainy'], [77, 'weather_snowy'], [82, 'rainy'], [86, 'weather_snowy'], [99, 'thunderstorm']];
  const weatherIcon = (code, day) => { const hit = WEATHER_ICONS.find(([max]) => code <= max) || WEATHER_ICONS[1]; return !day && hit[2] ? hit[2] : hit[1]; };
  async function loadWeather(force) {
    const city = read('mwWidgetCity', '');
    if (!city || (!force && weatherData && Date.now() - weatherAt < 10 * 60 * 1000)) return;
    try {
      const lang = String(mariowOSI18n.locale || 'en').slice(0, 2);
      const data = await fetch(`/api/widgets/weather?city=${encodeURIComponent(city)}&lang=${lang}`, { cache: 'no-store' }).then(r => r.json());
      weatherData = data; weatherAt = Date.now();
    } catch (e) { weatherData = { success: false, error: mariowOSI18n.t('desktop.widgets.weather-offline', 'Weather is not reachable right now') }; }
    render();
  }
  async function chooseCity() {
    if (!(await mwExternalConsent('open-meteo', 'Open-Meteo (open-meteo.com)'))) return;
    const city = await mDialog.prompt(mariowOSI18n.t('desktop.widgets.city-prompt', 'Which city should the weather show?'),
      { title: mariowOSI18n.t('desktop.widgets.weather', 'Weather'), defaultValue: read('mwWidgetCity', ''), okText: mariowOSI18n.t('common.save', 'Save') });
    if (!city || !city.trim()) return;
    write('mwWidgetCity', city.trim());
    weatherData = null;
    loadWeather(true);
  }
  function weatherCard() {
    const box = card('weather', 'partly_cloudy_day', CARD_NAMES.weather());
    const city = read('mwWidgetCity', '');
    if (!city) {
      const button = el('button', 'mw-link', mariowOSI18n.t('desktop.widgets.weather-setup', 'Show the weather'));
      button.onclick = chooseCity;
      box.append(button);
      return box;
    }
    if (!weatherData) { box.append(el('div', 'mw-muted', mariowOSI18n.t('desktop.widgets.loading', 'Loading…'))); loadWeather(); return box; }
    if (!weatherData.success) {
      box.append(el('div', 'mw-muted', weatherData.error === 'City not found' ? mariowOSI18n.t('desktop.widgets.city-missing', 'City not found: pick another one') : (weatherData.error || '')));
    } else {
      const row = el('div', 'mw-weather');
      const text = el('div');
      text.append(el('div', 'mw-temp', `${Math.round(weatherData.temperature)}°`),
        el('div', 'mw-muted', `${weatherData.place} · ${Math.round(weatherData.min)}° / ${Math.round(weatherData.max)}°`));
      row.append(icon(weatherIcon(weatherData.code, weatherData.isDay)), text);
      box.append(row);
    }
    const change = el('button', 'mw-link', mariowOSI18n.t('desktop.widgets.city-change', 'Change city'));
    change.style.marginTop = '10px';
    change.onclick = chooseCity;
    box.append(change);
    return box;
  }

  function calendarCard() {
    const box = card('calendar', 'event', CARD_NAMES.calendar());
    const today = (window.CalendarCore && CalendarCore.ymd) ? CalendarCore.ymd(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) : new Date().toISOString().slice(0, 10);
    const events = typeof calEventsOn === 'function' ? calEventsOn(today) : [];
    if (!events.length) box.append(el('div', 'mw-muted', mariowOSI18n.t('desktop.widgets.no-events', 'Nothing planned today')));
    events.slice(0, 5).forEach(ev => {
      const row = el('div', 'mw-row');
      row.append(el('span', 'mw-dot'), el('span', 'mw-muted', ev.allDay ? mariowOSI18n.t('desktop.widgets.all-day', 'All day') : (ev.start || '')), el('span', '', ev.title || ''));
      row.onclick = () => { close(); openCalendarApp(today); };
      box.append(row);
    });
    return box;
  }

  const noteText = note => String(note.title || note.name || note.content || note.text || note.body || '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  async function loadNotes() {
    if (notesData && Date.now() - notesAt < 60 * 1000) return;
    try { const data = await fetch('/api/system/notes', { cache: 'no-store' }).then(r => r.json()); notesData = Array.isArray(data) ? data : (data.notes || []); }
    catch (e) { notesData = []; }
    notesAt = Date.now();
    render();
  }
  function notesCard() {
    const box = card('notes', 'sticky_note_2', CARD_NAMES.notes());
    if (!notesData) { loadNotes(); box.append(el('div', 'mw-muted', mariowOSI18n.t('desktop.widgets.loading', 'Loading…'))); return box; }
    const notes = notesData.filter(note => noteText(note))
      .sort((a, b) => (Number(b.updatedAt || b.modified || b.date || 0) - Number(a.updatedAt || a.modified || a.date || 0))).slice(0, 3);
    if (!notes.length) box.append(el('div', 'mw-muted', mariowOSI18n.t('desktop.widgets.no-notes', 'No notes yet')));
    notes.forEach(note => {
      const row = el('div', 'mw-row');
      row.append(icon('description'), el('span', '', noteText(note).slice(0, 80)));
      row.onclick = () => { close(); openPopup('popup5'); };
      box.append(row);
    });
    return box;
  }

  function mediaCard() {
    const box = card('media', 'music_note', CARD_NAMES.media());
    const media = typeof currentMediaState === 'object' ? currentMediaState : null;
    // With no media session the desktop keeps a placeholder ("No media"): treat it as silence.
    const idle = !media || !media.title || (typeof activeMediaId !== 'undefined' && !activeMediaId);
    if (idle) { box.append(el('div', 'mw-muted', mariowOSI18n.t('desktop.widgets.no-media', 'Nothing is playing'))); return box; }
    const row = el('div', 'mw-media');
    const cover = el('div', 'mw-cover');
    if (media.cover) cover.style.backgroundImage = `url("${String(media.cover).replace(/["\\\n]/g, encodeURIComponent)}")`; else cover.append(icon('music_note'));
    const text = el('div'); text.style.minWidth = '0';
    const title = el('div', '', media.title); title.style.cssText = 'font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    text.append(title, el('div', 'mw-muted', media.artist || ''));
    const controls = el('div', 'mw-controls');
    [['skip_previous', 'prev'], [media.isPlaying ? 'pause' : 'play_arrow', 'toggle'], ['skip_next', 'next']].forEach(([symbol, command]) => {
      const button = el('button', 'mw-w-btn'); button.type = 'button'; button.append(icon(symbol));
      button.onclick = () => { sendMediaCommand(command); setTimeout(render, 400); };
      controls.append(button);
    });
    row.append(cover, text, controls);
    box.append(row);
    return box;
  }

  function editCard() {
    const box = card('edit', 'tune', mariowOSI18n.t('desktop.widgets.choose', 'Choose widgets'));
    const list = el('div', 'mw-edit');
    CARDS.forEach(name => {
      const label = el('label'); const check = el('input'); check.type = 'checkbox'; check.checked = shown.includes(name);
      check.onchange = () => { shown = CARDS.filter(n => n === name ? check.checked : shown.includes(n)); write('mwWidgetCards', shown); render(); };
      label.append(check, document.createTextNode(CARD_NAMES[name]()));
      list.append(label);
    });
    box.append(list);
    return box;
  }

  const BUILDERS = { clock: clockCard, weather: weatherCard, calendar: calendarCard, notes: notesCard, media: mediaCard };
  function render() {
    if (!panel.classList.contains('open')) return;
    const head = el('header');
    const edit = el('button', 'mw-w-btn'); edit.type = 'button'; edit.title = mariowOSI18n.t('desktop.widgets.choose', 'Choose widgets'); edit.append(icon(editing ? 'check' : 'tune'));
    edit.onclick = () => { editing = !editing; render(); };
    const shut = el('button', 'mw-w-btn'); shut.type = 'button'; shut.title = mariowOSI18n.t('common.close', 'Close'); shut.append(icon('close'));
    shut.onclick = close;
    const actions = el('div'); actions.style.display = 'flex'; actions.append(edit, shut);
    head.append(el('b', '', mariowOSI18n.t('desktop.widgets.title', 'Widgets')), actions);
    const cards = shown.filter(name => BUILDERS[name]).map(name => BUILDERS[name]());
    panel.replaceChildren(head, ...(editing ? [editCard()] : []), ...cards);
  }

  function open() {
    if (typeof closeAllPanels === 'function') closeAllPanels();
    panel.classList.add('open');
    notesData = null;
    render();
    clearInterval(timer);
    timer = setInterval(render, 15000);
  }
  function close() { panel.classList.remove('open'); editing = false; clearInterval(timer); }
  function toggle() { panel.classList.contains('open') ? close() : open(); }

  document.addEventListener('mousedown', event => {
    if (panel.classList.contains('open') && !panel.contains(event.target) && !event.target.closest('#mwWidgetsBtn, .m-dialog, .mdialog, [role="dialog"]')) close();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && panel.classList.contains('open')) close(); });
  if (typeof SYSTEM_KEY_ACTIONS === 'object') SYSTEM_KEY_ACTIONS['win+w'] = toggle;
  window.mwWidgets = { open, close, toggle };
})();
