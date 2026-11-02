// mariowOS desktop extras, loaded at the end of com.mariowos.desktop.html (it uses the
// desktop's own functions: openPopup, minimizePopup, applySnap, showNotification...).
//
//   Windows    Win+←/→ snap, "genie" minimize, virtual desktops (Win+Ctrl+←/→/D/F4)
//   Dock       live icons (calendar date, music playing)
//   Island     a pill at the top that grows for music, timers, screenshots and desktops
//   Tools      screen capture (Win+Shift+S), clipboard history (Win+V), emoji (Win+.), timer
//   Extras     "what's new" cards after an update, the Konami code, system sounds
//
// Motion follows the system: Functions Lab › Performance and the OS "reduce motion"
// setting turn the decorative animations off.
(() => {
  const electron = window.mariowOSElectron || {};
  const reducedMotion = () => document.body.classList.contains('lab-performance') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
  const readStore = (key, fallback) => { try { const value = localStorage.getItem(key); return value == null ? fallback : JSON.parse(value); } catch (e) { return fallback; } };
  const writeStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };

  const css = el('style');
  css.id = 'mw-desktop-extras';
  css.textContent = `
    /* Genie minimize: the window narrows into a funnel towards its dock icon. */
    @keyframes popupMinimize {
      0%   { opacity: 1; transform: none; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
      45%  { opacity: 1; transform: scale(.78, .55); clip-path: polygon(0 0, 100% 0, 74% 100%, 26% 100%); }
      100% { opacity: 0; transform: scale(.05, .02); clip-path: polygon(34% 0, 66% 0, 52% 100%, 48% 100%); }
    }
    .popup.minimizing { animation-duration: .42s !important; animation-timing-function: cubic-bezier(.55, 0, .35, 1) !important; }
    body.mw-desk-switching .popup { animation: none !important; }

    /* Live dock icons */
    .dock-icon .mw-cal-date { position: absolute; right: 3px; bottom: 5px; min-width: 12px; padding: 0 3px; border-radius: 4px; background: #e5484d; color: #fff;
      font: 700 8.5px/12px 'Poppins', sans-serif; text-align: center; pointer-events: none; box-shadow: 0 1px 3px rgba(0,0,0,.35); }
    .dock-icon .mw-eq { position: absolute; right: 3px; top: 4px; display: flex; gap: 1.5px; align-items: flex-end; height: 10px; pointer-events: none; }
    .dock-icon .mw-eq i { width: 2.5px; border-radius: 2px; background: var(--m3-accent-text, #4da3ff); animation: mwEq .9s ease-in-out infinite; }
    .dock-icon .mw-eq i:nth-child(2) { animation-delay: -.3s; } .dock-icon .mw-eq i:nth-child(3) { animation-delay: -.6s; }
    @keyframes mwEq { 0%, 100% { height: 3px; } 50% { height: 10px; } }

    /* Dynamic island */
    #mwIsland { position: fixed; top: 10px; left: 50%; z-index: 99990; translate: -50% -140%; display: flex; align-items: center; gap: 10px;
      min-width: 120px; max-width: min(560px, 80vw); height: 40px; padding: 0 16px 0 8px; border-radius: 22px; box-sizing: border-box;
      background: rgba(8, 10, 14, .9); color: #fff; font: 500 13px 'Poppins', sans-serif; box-shadow: 0 10px 34px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.07);
      backdrop-filter: blur(24px) saturate(180%); transition: translate .55s cubic-bezier(.2, 1.3, .4, 1), height .45s cubic-bezier(.2, 1.2, .4, 1), width .45s, border-radius .45s, padding .45s; overflow: hidden; cursor: default; }
    #mwIsland.show { translate: -50% 0; }
    #mwIsland.big { height: 76px; border-radius: 28px; padding: 0 18px 0 10px; }
    #mwIsland .mi-icon .material-symbols-outlined { font-size: 16px !important; }
    #mwIsland.big .mi-icon .material-symbols-outlined { font-size: 28px !important; }
    #mwIsland .mi-icon { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 15px; background: rgba(255,255,255,.08); background-size: cover; background-position: center; }
    #mwIsland.big .mi-icon { width: 54px; height: 54px; border-radius: 14px; font-size: 26px; }
    #mwIsland .mi-text { min-width: 0; display: flex; flex-direction: column; }
    #mwIsland .mi-title, #mwIsland .mi-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #mwIsland .mi-sub { font-size: 11.5px; color: rgba(255,255,255,.6); }
    #mwIsland .mi-side { margin-left: auto; display: flex; align-items: center; gap: 4px; padding-left: 10px; }
    #mwIsland .mi-btn { border: 0; background: transparent; color: #fff; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; }
    #mwIsland .mi-btn:hover { background: rgba(255,255,255,.12); }
    #mwIsland:not(.big) .mi-btn { display: none; }
    #mwIsland .mi-ring { width: 26px; height: 26px; rotate: -90deg; }
    #mwIsland .mi-ring circle { fill: none; stroke-width: 3; }
    #mwIsland .mi-text, #mwIsland .mi-side { animation: miIn .4s ease both; }
    @keyframes miIn { from { opacity: 0; translate: 0 6px; } }

    /* Virtual desktop indicator */
    #mwDeskHud { position: fixed; left: 50%; bottom: 84px; translate: -50% 20px; z-index: 99980; opacity: 0; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 14px 22px; border-radius: 18px; background: rgba(12, 16, 24, .8); backdrop-filter: blur(24px); color: #fff; font: 600 15px 'Poppins', sans-serif;
      transition: opacity .25s ease, translate .45s cubic-bezier(.2, 1.3, .4, 1); box-shadow: 0 16px 40px rgba(0,0,0,.4); }
    #mwDeskHud.show { opacity: 1; translate: -50% 0; }
    #mwDeskHud .dots { display: flex; gap: 8px; }
    #mwDeskHud .dots i { width: 8px; height: 8px; border-radius: 4px; background: rgba(255,255,255,.3); transition: width .35s cubic-bezier(.2, 1.3, .4, 1), background .3s; }
    #mwDeskHud .dots i.on { width: 24px; background: var(--m3-accent-text, #4da3ff); }

    /* Screen capture */
    #mwCapture { position: fixed; inset: 0; z-index: 100000; cursor: crosshair; background: rgba(0,0,0,.45); animation: mwFade .2s ease; }
    #mwCapture.selecting { background: transparent; }
    #mwCapture .sel { position: absolute; border: 2px solid #fff; border-radius: 4px; box-shadow: 0 0 0 9999px rgba(0,0,0,.45); }
    #mwCapture .hint { position: absolute; top: 24px; left: 50%; translate: -50% 0; padding: 8px 16px; border-radius: 99px; background: rgba(0,0,0,.6); color: #fff; font: 500 13px 'Poppins', sans-serif; }
    #mwFlash { position: fixed; inset: 0; z-index: 100001; background: #fff; pointer-events: none; animation: mwFlash .45s ease forwards; }
    @keyframes mwFlash { from { opacity: .85; } to { opacity: 0; } }
    @keyframes mwFade { from { opacity: 0; } }
    .mw-shot-thumb { position: fixed; z-index: 100002; border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.8); cursor: pointer; object-fit: cover; background: #000;
      transition: left .7s cubic-bezier(.2, 1.1, .3, 1), top .7s cubic-bezier(.2, 1.1, .3, 1), width .7s cubic-bezier(.2, 1.1, .3, 1), height .7s cubic-bezier(.2, 1.1, .3, 1), opacity .4s, translate .4s; }

    /* Floating panels: clipboard, emoji, timer */
    .mw-panel { position: fixed; z-index: 99970; right: 16px; bottom: 60px; width: 360px; max-height: min(480px, 70vh); display: flex; flex-direction: column; border-radius: 18px; overflow: hidden;
      background: rgba(16, 20, 28, .88); backdrop-filter: blur(30px) saturate(180%); color: #fff; font: 13px 'Poppins', sans-serif; box-shadow: 0 24px 60px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.08);
      transform-origin: 100% 100%; animation: mwPanelIn .42s cubic-bezier(.2, 1.25, .4, 1); }
    .mw-panel.closing { animation: mwPanelOut .2s ease forwards; }
    @keyframes mwPanelIn { from { opacity: 0; transform: translateY(18px) scale(.92); } }
    @keyframes mwPanelOut { to { opacity: 0; transform: translateY(12px) scale(.95); } }
    .mw-panel header { display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; font-weight: 600; font-size: 14px; }
    .mw-panel header button { margin-left: auto; border: 0; background: rgba(255,255,255,.08); color: #fff; border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; }
    .mw-panel .list { overflow-y: auto; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px; }
    .mw-panel .clip { text-align: left; border: 0; border-radius: 12px; padding: 10px 12px; background: rgba(255,255,255,.06); color: #fff; font: inherit; cursor: pointer;
      white-space: pre-wrap; word-break: break-word; max-height: 74px; overflow: hidden; animation: mwItemIn .45s cubic-bezier(.2, 1.3, .4, 1) both; transition: background .15s, transform .15s; }
    .mw-panel .clip:hover { background: rgba(255,255,255,.12); transform: translateX(-3px); }
    .mw-panel .clip small { display: block; color: rgba(255,255,255,.45); font-size: 11px; margin-top: 4px; }
    @keyframes mwItemIn { from { opacity: 0; transform: translateY(14px) scale(.96); } }
    .mw-panel .empty { padding: 30px 16px 36px; text-align: center; color: rgba(255,255,255,.5); }
    .mw-panel input[type=search] { margin: 0 12px 8px; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.3); color: #fff; font: inherit; outline: none; }
    .mw-panel input[type=search]:focus { border-color: var(--m3-accent-text, #4da3ff); }
    .mw-emoji-tabs { display: flex; gap: 2px; padding: 0 10px 6px; }
    .mw-emoji-tabs button { flex: 1; border: 0; background: transparent; font-size: 17px; padding: 5px 0; border-radius: 8px; cursor: pointer; opacity: .55; transition: opacity .15s, background .15s; }
    .mw-emoji-tabs button.on { opacity: 1; background: rgba(255,255,255,.1); }
    .mw-emoji-tabs button.material-symbols-outlined { font-size: 20px !important; color: inherit; }
    .mw-panel header .material-symbols-outlined { font-size: 20px !important; }
    .mw-timer-presets .pomodoro b .material-symbols-outlined { font-size: 17px !important; vertical-align: -3px; }
    .mw-emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 0 10px 12px; overflow-y: auto; }
    .mw-emoji-grid button { border: 0; background: transparent; font-size: 24px; height: 40px; border-radius: 10px; cursor: pointer; transition: transform .2s cubic-bezier(.2, 1.6, .4, 1), background .15s; }
    .mw-emoji-grid button:hover { background: rgba(255,255,255,.1); transform: scale(1.25); }
    .mw-emoji-fly { position: fixed; z-index: 100003; font-size: 30px; pointer-events: none; transition: left .5s cubic-bezier(.3, -0.4, .6, 1), top .5s cubic-bezier(.5, -0.6, .7, 1), opacity .5s, scale .5s; }
    .mw-timer-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 14px 14px; }
    .mw-timer-presets button { border: 0; border-radius: 12px; padding: 12px 6px; background: rgba(255,255,255,.07); color: #fff; font: inherit; cursor: pointer; transition: transform .2s cubic-bezier(.2, 1.6, .4, 1), background .15s; }
    .mw-timer-presets button:hover { background: rgba(255,255,255,.13); transform: translateY(-2px); }
    .mw-timer-presets button b { display: block; font-size: 18px; }
    .mw-timer-presets button.pomodoro { grid-column: 1 / -1; background: color-mix(in srgb, #ff453a 22%, transparent); }
    .mw-timer-run { display: flex; align-items: center; gap: 14px; padding: 4px 16px 16px; }
    .mw-timer-run button { margin-left: auto; border: 0; border-radius: 10px; padding: 8px 14px; background: rgba(255,69,58,.25); color: #fff; font: inherit; cursor: pointer; }
    #mwTimerBtn.running .material-symbols-outlined { color: var(--m3-accent-text, #4da3ff); }

    /* Confetti and stars */
    .mw-particle { position: fixed; z-index: 100004; pointer-events: none; will-change: transform, opacity; }

    /* What's new */
    #mwWhatsNew { position: fixed; inset: 0; z-index: 99995; display: grid; place-items: center; background: rgba(4, 6, 10, .55); backdrop-filter: blur(16px); animation: mwFade .4s ease; perspective: 1400px; }
    #mwWhatsNew .wn-box { width: min(720px, 90vw); color: #fff; font-family: 'Poppins', sans-serif; text-align: center; }
    #mwWhatsNew h1 { font-size: 30px; margin: 0 0 4px; animation: mwItemIn .6s cubic-bezier(.2, 1.3, .4, 1) both; }
    #mwWhatsNew .wn-sub { color: rgba(255,255,255,.6); margin-bottom: 26px; animation: mwItemIn .6s .08s cubic-bezier(.2, 1.3, .4, 1) both; }
    #mwWhatsNew .wn-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; text-align: left; }
    #mwWhatsNew .wn-card { padding: 18px; border-radius: 18px; background: rgba(255,255,255,.07); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); font-size: 13.5px; line-height: 1.5;
      backface-visibility: hidden; animation: mwFlip .8s cubic-bezier(.2, 1.15, .35, 1) both; }
    #mwWhatsNew .wn-card .material-symbols-outlined { display: block; font-size: 26px; margin-bottom: 8px; color: var(--m3-accent-text, #4da3ff); }
    @keyframes mwFlip { from { opacity: 0; transform: rotateY(-95deg) translateZ(40px); } }
    #mwWhatsNew .wn-go { margin-top: 26px; border: 0; border-radius: 99px; padding: 12px 34px; background: var(--m3-accent-active, #0a84ff); color: var(--m3-accent-on-active, #fff);
      font: 600 14px 'Poppins', sans-serif; cursor: pointer; animation: mwItemIn .6s .9s cubic-bezier(.2, 1.3, .4, 1) both; transition: transform .2s; }
    #mwWhatsNew .wn-go:hover { transform: scale(1.05); }
    #mwWhatsNew.closing { animation: mwFadeOut .35s ease forwards; }
    @keyframes mwFadeOut { to { opacity: 0; } }
  `;
  document.head.appendChild(css);

  /* ───────────── System sounds (Settings › General › System sounds) ───────────── */
  let audio = null;
  const soundsOn = () => readStore('systemSounds', false) === true;
  function tone(notes, type = 'sine', volume = 0.07) {
    if (!soundsOn()) return;
    try {
      audio = audio || new AudioContext();
      const start = audio.currentTime + 0.01;
      notes.forEach(([freq, at, length]) => {
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = type; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start + at);
        gain.gain.linearRampToValueAtTime(volume, start + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
        osc.connect(gain).connect(audio.destination);
        osc.start(start + at); osc.stop(start + at + length + 0.05);
      });
    } catch (e) {}
  }
  const sounds = {
    notify: () => tone([[880, 0, 0.18], [1320, 0.09, 0.3]]),
    lock: () => tone([[392, 0, 0.12], [262, 0.07, 0.25]], 'triangle'),
    startup: () => tone([[523, 0, 0.5], [659, 0.12, 0.5], [784, 0.24, 0.5], [1047, 0.36, 0.8]], 'sine', 0.05),
    shutter: () => tone([[1800, 0, 0.05], [900, 0.04, 0.08]], 'square', 0.03),
    done: () => tone([[784, 0, 0.2], [988, 0.15, 0.2], [1175, 0.3, 0.2], [1568, 0.45, 0.6]], 'triangle'),
    pop: () => tone([[660, 0, 0.08]], 'sine', 0.04)
  };
  window.mwSounds = sounds;
  const baseNotification = showNotification;
  showNotification = function (...args) { const result = baseNotification.apply(this, args); if (!qsState.dnd) sounds.notify(); return result; };
  const baseLock = lockDesktop;
  lockDesktop = function (...args) { sounds.lock(); return baseLock.apply(this, args); };

  /* ───────────── Dynamic island ───────────── */
  const island = el('div'); island.id = 'mwIsland';
  island.setAttribute('role', 'status');
  document.body.appendChild(island);
  let islandFlash = null, islandFlashTimer = 0, islandMedia = null, islandTimer = null, islandKey = '';
  function renderIsland() {
    const state = islandFlash || islandTimer || islandMedia;
    island.classList.toggle('show', !!state);
    if (!state) { islandKey = ''; return; }
    island.classList.toggle('big', !!state.big);
    // A ticking timer only moves its ring and its time: the content stays, so it does not replay its entrance.
    const key = [state === islandFlash ? 'flash' : state === islandTimer ? 'timer' : 'media', state.title, state.sub, state.icon, state.cover, state.big].join('|');
    if (key === islandKey) {
      const ring = island.querySelector('.mi-ring circle:last-child');
      if (ring && state.ring != null) ring.setAttribute('stroke-dashoffset', 66 * (1 - state.ring));
      const side = island.querySelector('.mi-side > .mi-sub');
      if (side && state.side != null) side.textContent = state.side;
      return;
    }
    islandKey = key;
    const icon = el('div', 'mi-icon');
    if (state.cover) icon.style.backgroundImage = `url("${String(state.cover).replace(/["\\\n]/g, encodeURIComponent)}")`;
    else if (state.ring != null) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 26 26'); svg.classList.add('mi-ring');
      svg.innerHTML = `<circle cx="13" cy="13" r="10.5" stroke="rgba(255,255,255,.15)"/><circle cx="13" cy="13" r="10.5" stroke="${state.color || '#4da3ff'}" stroke-linecap="round" stroke-dasharray="66" stroke-dashoffset="${66 * (1 - state.ring)}"/>`;
      icon.style.background = 'none'; icon.append(svg);
    } else fillIcon(icon, state.icon);
    const text = el('div', 'mi-text');
    text.append(el('span', 'mi-title', state.title || ''));
    if (state.sub) text.append(el('span', 'mi-sub', state.sub));
    const side = el('div', 'mi-side');
    (state.buttons || []).forEach(([symbol, run]) => {
      const button = el('button', 'mi-btn'); button.type = 'button';
      button.append(el('span', 'material-symbols-outlined', symbol));
      button.onclick = event => { event.stopPropagation(); run(); };
      side.append(button);
    });
    if (state.side) side.append(el('span', 'mi-sub', state.side));
    island.replaceChildren(icon, text, side);
  }
  // A short message that wins over music and timers for a few seconds.
  function flashIsland(state, ms = 2600) {
    islandFlash = state; clearTimeout(islandFlashTimer);
    renderIsland();
    islandFlashTimer = setTimeout(() => { islandFlash = null; renderIsland(); }, ms);
  }
  island.addEventListener('mouseenter', () => { if (islandMedia && !islandFlash && !islandTimer) { islandMedia.big = true; renderIsland(); } });
  island.addEventListener('mouseleave', () => { if (islandMedia) { islandMedia.big = false; renderIsland(); } });
  window.mwIsland = { flash: flashIsland };
  // Music: the island follows the desktop's media state.
  let lastMediaKey = '';
  setInterval(() => {
    const media = typeof currentMediaState === 'object' ? currentMediaState : null;
    const playing = !!(media && media.isPlaying);
    const key = playing ? `${media.title}|${media.artist}|${media.cover}` : '';
    if (key === lastMediaKey) return;
    lastMediaKey = key;
    islandMedia = playing ? {
      cover: media.cover, icon: 'music_note', title: media.title, sub: media.artist, big: islandMedia?.big || false,
      buttons: [['skip_previous', () => sendMediaCommand('prev')], ['pause', () => sendMediaCommand('toggle')], ['skip_next', () => sendMediaCommand('next')]]
    } : null;
    renderIsland();
  }, 1000);

  // Parental controls: an account with allowed hours is warned 5 minutes before the end and
  // signed out when time is up (the login refuses it until the hours come back).
  const toMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  let hoursWarned = false;
  setInterval(() => {
    const limits = typeof currentUser === 'object' && currentUser.limits;
    if (!limits || !limits.from || !limits.to || currentUser.admin) return;
    const now = new Date(), minutes = now.getHours() * 60 + now.getMinutes();
    const from = toMinutes(limits.from), to = toMinutes(limits.to);
    const inside = from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
    const left = (to - minutes + 1440) % 1440;
    if (inside && left <= 5 && !hoursWarned) {
      hoursWarned = true;
      flashIsland({ icon: 'hourglass_top', big: true, title: mariowOSI18n.t('desktop.limits.soon', 'Time is almost up'), sub: mariowOSI18n.t('desktop.limits.soon-sub', 'This account signs out at {time}. Save your work.', { time: limits.to }) }, 15000);
      showNotification(mariowOSI18n.t('desktop.limits.soon', 'Time is almost up'), mariowOSI18n.t('desktop.limits.soon-sub', 'This account signs out at {time}. Save your work.', { time: limits.to }), 'hourglass_top');
    }
    if (!inside) signOut();
  }, 20000);

  // Apps the Store updated by itself in the background: shown once, in the island.
  const showAutoUpdates = () => fetch('/api/store/auto-update?take=1', { cache: 'no-store' }).then(response => response.json()).then(data => {
    if (!data.updated || !data.updated.length) return;
    const names = data.updated.map(item => item.title).join(', ');
    flashIsland({ icon: 'upgrade', title: mariowOSI18n.t('desktop.store.auto-updated', 'Apps updated'), sub: names }, 5000);
  }).catch(() => {});
  setTimeout(showAutoUpdates, 15000);
  setInterval(showAutoUpdates, 10 * 60 * 1000);

  // An update changed the shell itself (launcher.js / preload.js): offer the full restart.
  electron.onRestartNeeded?.(() => {
    flashIsland({
      icon: 'restart_alt', big: true,
      title: mariowOSI18n.t('desktop.restart.title', 'Restart to finish the update'),
      sub: mariowOSI18n.t('desktop.restart.sub', 'Part of mariowOS was updated'),
      buttons: [['restart_alt', () => electron.relaunch?.()], ['close', () => { islandFlash = null; renderIsland(); }]]
    }, 120000);
    showNotification(mariowOSI18n.t('desktop.restart.title', 'Restart to finish the update'),
      mariowOSI18n.t('desktop.restart.message', 'Restart mariowOS from the island at the top when you are ready.'), 'restart_alt');
  });

  /* ───────────── Windows: snap keys ───────────── */
  function snapTop(side) {
    const top = getTopmostPopup();
    if (!top || top.id.startsWith('dialog_')) return;
    const opposite = side === 'left' ? 'right' : 'left';
    if (top.dataset.snapped === opposite) {
      // Back to its free size, in the middle, as on Windows.
      delete top.dataset.snapped;
      const width = parseFloat(top.dataset.prevWidth) || 1048, height = parseFloat(top.dataset.prevHeight) || 600;
      animateRect(top, () => {
        top.style.width = width + 'px'; top.style.height = height + 'px';
        top.style.left = Math.max(8, (innerWidth - width) / 2) + 'px'; top.style.top = Math.max(RESERVED_TOP, (innerHeight - TASKBAR_H - height) / 2) + 'px';
      }, 260);
      return;
    }
    if (top.classList.contains('maximized')) toggleMaximize(top.id);
    applySnap(top, side);
  }

  /* ───────────── Virtual desktops ───────────── */
  let deskCount = 1, currentDesk = 0, deskHudTimer = 0;
  const hud = el('div'); hud.id = 'mwDeskHud'; document.body.appendChild(hud);
  const baseOpenPopup = openPopup;
  openPopup = function (popupId, ...rest) {
    const popup = document.getElementById(popupId);
    if (popup) popup.dataset.desk = currentDesk;
    return baseOpenPopup.call(this, popupId, ...rest);
  };
  function showDeskHud() {
    const dots = el('div', 'dots');
    for (let i = 0; i < deskCount; i++) dots.append(el('i', i === currentDesk ? 'on' : ''));
    hud.replaceChildren(el('span', '', mariowOSI18n.t('desktop.desks.name', 'Desktop {number}', { number: currentDesk + 1 })), dots);
    hud.classList.add('show');
    clearTimeout(deskHudTimer);
    deskHudTimer = setTimeout(() => hud.classList.remove('show'), 1200);
  }
  function switchDesk(target) {
    if (target < 0 || target >= deskCount || target === currentDesk) { showDeskHud(); return; }
    const direction = target > currentDesk ? 1 : -1;
    const leaving = visiblePopups();
    const duration = reducedMotion() ? 0 : 420;
    document.body.classList.add('mw-desk-switching');
    leaving.forEach(popup => {
      popup.dataset.desk = currentDesk;
      popup.dataset.deskShown = '1';
      const out = popup.animate([{ translate: '0 0', opacity: 1 }, { translate: `${-direction * 110}vw 0`, opacity: 0.6 }], { duration, easing: 'cubic-bezier(.5, 0, .2, 1)' });
      out.onfinish = () => { popup.classList.remove('active'); popup.style.display = 'none'; };
    });
    currentDesk = target;
    document.querySelectorAll('.popup[data-desk-shown]').forEach(popup => {
      if (Number(popup.dataset.desk) !== currentDesk || !runningApps.has(popup.id)) return;
      delete popup.dataset.deskShown;
      popup.style.display = 'block'; popup.classList.add('active');
      popup.animate([{ translate: `${direction * 110}vw 0`, opacity: 0.6 }, { translate: '0 0', opacity: 1 }], { duration, easing: 'cubic-bezier(.2, 1, .3, 1)', delay: duration * 0.15 });
    });
    setTimeout(() => { document.body.classList.remove('mw-desk-switching'); updateContextBar(); updateDock(); }, duration * 1.2 + 30);
    showDeskHud();
  }
  function addDesk() { deskCount++; switchDesk(deskCount - 1); }
  // Closing a desktop keeps its windows on screen: they join the desktop next to it, and
  // that desktop's own windows come back beside them.
  function closeDesk() {
    if (deskCount === 1) { showDeskHud(); return; }
    const closing = currentDesk, into = closing > 0 ? closing - 1 : 1;
    document.querySelectorAll('.popup[data-desk]').forEach(popup => {
      let desk = Number(popup.dataset.desk);
      if (desk === closing) desk = into;
      popup.dataset.desk = desk > closing ? desk - 1 : desk;
    });
    deskCount--;
    currentDesk = into > closing ? into - 1 : into;
    document.querySelectorAll('.popup[data-desk-shown]').forEach(popup => {
      if (Number(popup.dataset.desk) !== currentDesk || !runningApps.has(popup.id)) return;
      delete popup.dataset.deskShown;
      popup.style.display = 'block'; popup.classList.add('active');
    });
    updateContextBar();
    showDeskHud();
  }

  /* ───────────── Dock: live icons ───────────── */
  const dock = document.getElementById('dockContainer');
  function decorateDock() {
    if (!dock) return;
    const calendar = dock.querySelector('.dock-icon[data-popup="popup11"]');
    if (calendar) {
      let badge = calendar.querySelector('.mw-cal-date');
      if (!badge) { badge = el('span', 'mw-cal-date'); calendar.append(badge); }
      const day = String(new Date().getDate());
      if (badge.textContent !== day) badge.textContent = day;
    }
    const playingApp = activeMediaId && String(activeMediaId).startsWith('app:') && mediaSessions.get(activeMediaId)?.isPlaying ? String(activeMediaId).slice(4) : null;
    dock.querySelectorAll('.dock-icon').forEach(icon => {
      const playing = icon.dataset.popup === playingApp;
      const eq = icon.querySelector('.mw-eq');
      if (playing && !eq) { const bars = el('span', 'mw-eq'); bars.append(el('i'), el('i'), el('i')); icon.append(bars); }
      if (!playing && eq) eq.remove();
    });
  }
  setInterval(decorateDock, 1000);
  decorateDock();

  /* ───────────── Particles: confetti and stars ───────────── */
  function burst(x, y, { count = 70, symbols = null, colors = ['#ff453a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2', '#ff9f0a'], spread = 1, gravity = 1, rise = 1 } = {}) {
    if (reducedMotion()) return;
    for (let i = 0; i < count; i++) {
      const piece = el('div', 'mw-particle');
      if (symbols) { piece.textContent = symbols[i % symbols.length]; piece.style.fontSize = (12 + Math.random() * 16) + 'px'; }
      else Object.assign(piece.style, { width: '8px', height: (6 + Math.random() * 8) + 'px', background: colors[i % colors.length], borderRadius: '2px' });
      piece.style.left = x + 'px'; piece.style.top = y + 'px';
      document.body.appendChild(piece);
      const angle = (Math.random() * Math.PI) - Math.PI; // upwards half circle
      const speed = (260 + Math.random() * 420) * spread;
      const dx = Math.cos(angle) * speed, dy = Math.sin(angle) * speed * rise;
      const fall = (500 + Math.random() * 500) * gravity;
      const spin = (Math.random() - 0.5) * 900;
      piece.animate([
        { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy + fall}px) rotate(${spin}deg)`, opacity: 0 }
      ], { duration: 1500 + Math.random() * 900, easing: 'cubic-bezier(.2, .6, .4, 1)' }).onfinish = () => piece.remove();
    }
  }
  window.mwBurst = burst;

  /* ───────────── Floating panels ───────────── */
  let openPanel = null;
  function closePanel() {
    if (!openPanel) return;
    const panel = openPanel; openPanel = null;
    panel.classList.add('closing');
    setTimeout(() => panel.remove(), 200);
  }
  function showPanel(panel) {
    closePanel();
    openPanel = panel;
    document.body.appendChild(panel);
    // Clicking a panel must not take the focus away from the field the text goes into.
    panel.addEventListener('mousedown', event => { if (!event.target.closest('input')) event.preventDefault(); });
  }
  document.addEventListener('mousedown', event => { if (openPanel && !openPanel.contains(event.target) && !event.target.closest('#mwTimerBtn')) closePanel(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && openPanel) closePanel(); });

  /* ───────────── Clipboard history (Win+V) ───────────── */
  async function toggleClipboard() {
    if (openPanel?.id === 'mwClipboard') { closePanel(); return; }
    if (!electron.clipboardHistory) return;
    const panel = el('div', 'mw-panel'); panel.id = 'mwClipboard';
    const head = el('header'); head.append(el('span', 'material-symbols-outlined', 'content_paste'), el('span', '', mariowOSI18n.t('desktop.clipboard.title', 'Clipboard')));
    const clear = el('button', '', mariowOSI18n.t('desktop.clipboard.clear', 'Clear all')); clear.type = 'button';
    head.append(clear);
    const list = el('div', 'list');
    panel.append(head, list);
    const render = items => {
      if (!items.length) { list.replaceChildren(el('div', 'empty', mariowOSI18n.t('desktop.clipboard.empty', 'Copy something and it shows up here.'))); return; }
      list.replaceChildren(...items.map((item, index) => {
        const button = el('button', 'clip'); button.type = 'button';
        button.style.animationDelay = Math.min(index, 10) * 35 + 'ms';
        button.append(document.createTextNode(item.text.length > 300 ? item.text.slice(0, 300) + '…' : item.text));
        button.append(el('small', '', new Date(item.at).toLocaleTimeString(mariowOSI18n.locale, { hour: '2-digit', minute: '2-digit' })));
        button.onclick = () => { closePanel(); electron.clipboardHistory.paste(item.text); };
        return button;
      }));
    };
    clear.onclick = async () => { await electron.clipboardHistory.clear(); render([]); };
    showPanel(panel);
    render(await electron.clipboardHistory.list());
  }

  /* ───────────── Emoji (Win+.) ───────────── */
  const EMOJI = {
    '😀': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖 😺 😸 😹 😻',
    '👋': '👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🦾 👀 👁️ 🧠 🫶 💅 🤳 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙋 🙆 🙅 🤷 🤦 🧑‍💻 🧑‍🎓 🧑‍🍳 🧑‍🚀 🦸 🧙 🧚 🧛 🧜 🧞 💃 🕺 👯 🚶 🏃',
    '❤️': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 💫 🔥 💥 💯 ✅ ❌ ❓ ❗ ⚠️ 🎉 🎊 🎈 🎁 🏆 🥇 🎯 💡 🔔 🎵 🎶 💬 💭 🗯️ ♻️ ➕ ➖ ✖️ ➗ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪',
    '🐶': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🦈 🐊 🐘 🦒 🦓 🐪 🐕 🐈 🌵 🎄 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🍂 🌸 🌺 🌻 🌹 🌷 🌼 🌙 ☀️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🌈 🌊',
    '🍕': '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥕 🌽 🌶️ 🥦 🧄 🧅 🥔 🥐 🍞 🥖 🧀 🥚 🍳 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍣 🍱 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 ☕ 🍵 🥤 🧃 🍺 🍷 🥂 🍾',
    '⚽': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🎮 🕹️ 🎲 🧩 ♟️ 🎨 🎬 🎤 🎧 🎸 🎹 🥁 🎻 🚗 🚕 🚌 🏎️ 🚓 🚑 🚒 🚲 🛵 🏍️ ✈️ 🚀 🛸 🚁 ⛵ 🚢 🏠 🏡 🏢 🏰 🗼 🗽 ⛺ 🌋 🗻 🏖️ 💻 🖥️ ⌨️ 🖱️ 📱 📷 🎥 📺 📻 ⏰ 💾 📁 📌 📎 ✏️ 📝 📚 🔒 🔑 🔧 🔨 ⚙️ 🧲 💰 💳 📦 ✉️'
  };
  const EMOJI_TABS = { '😀': 'mood', '👋': 'waving_hand', '❤️': 'favorite', '🐶': 'pets', '🍕': 'restaurant', '⚽': 'sports_soccer' };
  const EMOJI_WORDS = { '😂': 'laugh ridere lol', '😍': 'love amore cuore', '👍': 'ok like pollice', '❤️': 'heart cuore love amore', '🔥': 'fire fuoco', '🎉': 'party festa', '😭': 'cry piangere', '🙏': 'please grazie pray', '😎': 'cool', '🤔': 'think pensare', '✅': 'done fatto check', '⚽': 'football calcio', '🍕': 'pizza', '☕': 'coffee caffè', '🐶': 'dog cane', '🐱': 'cat gatto', '💻': 'computer pc', '🚀': 'rocket razzo', '⭐': 'star stella', '🌈': 'rainbow arcobaleno', '😴': 'sleep dormire', '😡': 'angry arrabbiato', '👋': 'hello ciao wave', '🎂': 'cake torta birthday compleanno', '💯': 'hundred cento', '😀': 'smile sorriso happy felice' };
  function toggleEmoji() {
    if (openPanel?.id === 'mwEmoji') { closePanel(); return; }
    // The text goes back to the field that had the focus (an app frame or a desktop field).
    const previousFocus = document.activeElement;
    const panel = el('div', 'mw-panel'); panel.id = 'mwEmoji';
    const head = el('header'); head.append(el('span', 'material-symbols-outlined', 'mood'), el('span', '', mariowOSI18n.t('desktop.emoji.title', 'Emoji')));
    const search = el('input'); search.type = 'search'; search.placeholder = mariowOSI18n.t('desktop.emoji.search', 'Search emoji');
    const tabs = el('div', 'mw-emoji-tabs');
    const grid = el('div', 'mw-emoji-grid');
    const recentKey = 'mwRecentEmoji';
    let category = readStore(recentKey, []).length ? 'recent' : '😀';
    const fill = list => grid.replaceChildren(...list.map(symbol => {
      const button = el('button', '', symbol); button.type = 'button';
      button.onclick = () => pick(symbol, button);
      return button;
    }));
    const showCategory = () => {
      tabs.querySelectorAll('button').forEach(button => button.classList.toggle('on', button.dataset.cat === category));
      fill(category === 'recent' ? readStore(recentKey, []) : EMOJI[category].split(' '));
    };
    const recentTab = el('button', 'material-symbols-outlined', 'schedule'); recentTab.dataset.cat = 'recent'; recentTab.type = 'button';
    tabs.append(recentTab, ...Object.keys(EMOJI).map(symbol => { const button = el('button', 'material-symbols-outlined', EMOJI_TABS[symbol]); button.dataset.cat = symbol; button.type = 'button'; return button; }));
    tabs.onclick = event => { const button = event.target.closest('button'); if (button) { category = button.dataset.cat; showCategory(); } };
    search.oninput = () => {
      const query = search.value.trim().toLowerCase();
      if (!query) { showCategory(); return; }
      const all = Object.values(EMOJI).join(' ').split(' ');
      fill(all.filter(symbol => (EMOJI_WORDS[symbol] || '').includes(query)).concat(all.filter(symbol => symbol === query)));
    };
    function pick(symbol, button) {
      writeStore(recentKey, [symbol, ...readStore(recentKey, []).filter(item => item !== symbol)].slice(0, 32));
      const from = button.getBoundingClientRect();
      const fly = el('div', 'mw-emoji-fly', symbol);
      Object.assign(fly.style, { left: from.left + 'px', top: from.top + 'px' });
      document.body.appendChild(fly);
      const targetBox = previousFocus && previousFocus !== document.body ? previousFocus.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      requestAnimationFrame(() => Object.assign(fly.style, { left: (targetBox.left + Math.min(targetBox.width, 200) / 2) + 'px', top: (targetBox.top + Math.min(targetBox.height, 60) / 2) + 'px', opacity: '0', scale: '.4' }));
      setTimeout(() => fly.remove(), 550);
      closePanel();
      if (previousFocus && previousFocus !== document.body) previousFocus.focus();
      setTimeout(() => { if (electron.insertText) electron.insertText(symbol); }, 30);
    }
    panel.append(head, search, tabs, grid);
    showPanel(panel);
    showCategory();
    setTimeout(() => search.focus(), 50);
  }

  /* ───────────── Timer and Pomodoro ───────────── */
  let timer = null; // { end, total, label, pomodoro: { round, work } }
  const statusRight = document.querySelector('.status-right');
  const timerButton = el('button', 'system-tray-btn');
  timerButton.id = 'mwTimerBtn'; timerButton.type = 'button';
  timerButton.title = mariowOSI18n.t('desktop.timer.title', 'Timer');
  timerButton.append(el('span', 'material-symbols-outlined', 'timer'));
  timerButton.style.opacity = '1';
  if (statusRight) statusRight.prepend(timerButton);
  const format = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function startTimer(minutes, label, pomodoro = null) {
    timer = { end: Date.now() + minutes * 60000, total: minutes * 60000, label, pomodoro };
    timerButton.classList.add('running');
    closePanel();
    sounds.pop();
    tickTimer();
  }
  function stopTimer() { timer = null; islandTimer = null; timerButton.classList.remove('running'); renderIsland(); }
  function tickTimer() {
    if (!timer) return;
    const left = timer.end - Date.now();
    if (left <= 0) {
      const done = timer;
      stopTimer();
      sounds.done();
      const box = island.getBoundingClientRect();
      burst(box.left + box.width / 2, 40, { count: 110, spread: 1.2, rise: -0.4 });
      showNotification(mariowOSI18n.t('desktop.timer.title', 'Timer'), done.pomodoro
        ? (done.pomodoro.work ? mariowOSI18n.t('desktop.timer.pomodoro-break', 'Focus session done! Time for a break.') : mariowOSI18n.t('desktop.timer.pomodoro-work', 'Break over: back to focus.'))
        : mariowOSI18n.t('desktop.timer.done', '{label} is up!', { label: done.label }), 'alarm');
      if (done.pomodoro) {
        const { round, work } = done.pomodoro;
        if (work) startTimer(round % 4 === 0 ? 15 : 5, mariowOSI18n.t('desktop.timer.break', 'Break'), { round, work: false });
        else startTimer(25, mariowOSI18n.t('desktop.timer.focus', 'Focus'), { round: round + 1, work: true });
      }
      return;
    }
    islandTimer = { ring: 1 - left / timer.total, color: timer.pomodoro && timer.pomodoro.work ? '#ff453a' : timer.pomodoro ? '#30d158' : '#4da3ff',
      title: timer.label, side: format(left), big: false };
    renderIsland();
  }
  setInterval(tickTimer, 500);
  timerButton.onclick = event => {
    event.stopPropagation();
    if (openPanel?.id === 'mwTimer') { closePanel(); return; }
    const panel = el('div', 'mw-panel'); panel.id = 'mwTimer';
    panel.style.width = '300px';
    const head = el('header'); head.append(el('span', 'material-symbols-outlined', 'timer'), el('span', '', mariowOSI18n.t('desktop.timer.title', 'Timer')));
    panel.append(head);
    if (timer) {
      const run = el('div', 'mw-timer-run');
      const left = el('b', '', format(timer.end - Date.now())); left.style.fontSize = '26px';
      const stop = el('button', '', mariowOSI18n.t('desktop.timer.stop', 'Stop')); stop.type = 'button';
      stop.onclick = () => { stopTimer(); closePanel(); };
      run.append(left, el('span', '', timer.label), stop);
      panel.append(run);
    } else {
      const presets = el('div', 'mw-timer-presets');
      [1, 5, 10, 15, 30, 60].forEach(minutes => {
        const button = el('button'); button.type = 'button';
        button.append(el('b', '', String(minutes)), document.createTextNode(mariowOSI18n.t('desktop.timer.minutes', 'min')));
        button.onclick = () => startTimer(minutes, mariowOSI18n.t('desktop.timer.label', '{minutes} min timer', { minutes }));
        presets.append(button);
      });
      const pomodoro = el('button', 'pomodoro'); pomodoro.type = 'button';
      const pomodoroTitle = el('b'); pomodoroTitle.append(el('span', 'material-symbols-outlined', 'timer'), document.createTextNode(' Pomodoro'));
      pomodoro.append(pomodoroTitle, document.createTextNode(mariowOSI18n.t('desktop.timer.pomodoro-hint', '25 min focus · 5 min break')));
      pomodoro.onclick = () => startTimer(25, mariowOSI18n.t('desktop.timer.focus', 'Focus'), { round: 1, work: true });
      presets.append(pomodoro);
      panel.append(presets);
    }
    showPanel(panel);
    const box = timerButton.getBoundingClientRect();
    panel.style.right = Math.max(8, innerWidth - box.right) + 'px';
  };

  /* ───────────── Screen capture (Win+Shift+S) ───────────── */
  function startCapture() {
    if (!electron.capture || document.getElementById('mwCapture')) return;
    closePanel();
    const layer = el('div'); layer.id = 'mwCapture';
    const hint = el('div', 'hint', mariowOSI18n.t('desktop.capture.hint', 'Drag to capture an area · click for the whole screen · Esc to cancel'));
    layer.append(hint);
    document.body.appendChild(layer);
    let start = null, box = null;
    const cancel = () => { layer.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
    document.addEventListener('keydown', onKey, true);
    layer.addEventListener('pointerdown', event => {
      start = { x: event.clientX, y: event.clientY };
      layer.classList.add('selecting'); hint.remove();
      box = el('div', 'sel'); layer.append(box);
      layer.setPointerCapture(event.pointerId);
    });
    layer.addEventListener('pointermove', event => {
      if (!start) return;
      Object.assign(box.style, { left: Math.min(start.x, event.clientX) + 'px', top: Math.min(start.y, event.clientY) + 'px', width: Math.abs(event.clientX - start.x) + 'px', height: Math.abs(event.clientY - start.y) + 'px' });
    });
    layer.addEventListener('pointerup', async event => {
      if (!start) return;
      let rect = { x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY), width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) };
      if (rect.width < 6 || rect.height < 6) rect = { x: 0, y: 0, width: innerWidth, height: innerHeight };
      cancel();
      // Two frames so the dimmed layer is really gone from the picture.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      try {
        const dataUrl = await electron.capture(rect);
        sounds.shutter();
        const flash = el('div'); flash.id = 'mwFlash'; document.body.appendChild(flash); setTimeout(() => flash.remove(), 500);
        const name = await saveCapture(dataUrl);
        flyThumbnail(dataUrl, rect, name);
        flashIsland({ icon: 'screenshot_monitor', title: mariowOSI18n.t('desktop.capture.done', 'Screenshot saved'), sub: name ? mariowOSI18n.t('desktop.capture.where', 'Pictures › {name} · copied too', { name }) : mariowOSI18n.t('desktop.capture.copied', 'Copied to the clipboard') });
      } catch (error) {
        showNotification(mariowOSI18n.t('desktop.capture.title', 'Screenshot'), mariowOSI18n.t('desktop.capture.failed', 'Could not take the screenshot.'), 'warning');
      }
    });
  }
  async function saveCapture(dataUrl) {
    const stamp = new Date();
    const pad = n => String(n).padStart(2, '0');
    const name = `Screenshot ${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}.${pad(stamp.getMinutes())}.${pad(stamp.getSeconds())}.png`;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const response = await fetch(`/api/system/files/upload-raw?path=${encodeURIComponent('/home/Pictures')}&name=${encodeURIComponent(name)}&conflict=rename`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
      const data = await response.json();
      return data.success ? data.name : null;
    } catch (e) { return null; }
  }
  function flyThumbnail(dataUrl, rect, name) {
    const thumb = el('img', 'mw-shot-thumb'); thumb.src = dataUrl; thumb.alt = '';
    Object.assign(thumb.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    document.body.appendChild(thumb);
    const width = 220, height = Math.max(60, Math.min(160, width * rect.height / rect.width));
    requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(thumb.style, { left: (innerWidth - width - 20) + 'px', top: (innerHeight - TASKBAR_H - height - 20) + 'px', width: width + 'px', height: height + 'px' })));
    const leave = () => { thumb.style.opacity = '0'; thumb.style.translate = '40px 0'; setTimeout(() => thumb.remove(), 400); };
    const timerId = setTimeout(leave, 5000);
    thumb.onclick = () => { clearTimeout(timerId); leave(); if (name) openPopup('popup12'); };
  }

  /* ───────────── Wallpaper: "Daylight" gradient and parallax ───────────── */
  // Night, dawn, day, golden hour, sunset, dusk: the colors blend minute by minute.
  const DAYLIGHT = [[0, '#0b1026', '#1b2448'], [5, '#1b2448', '#4b3b6b'], [6.5, '#f7a072', '#6a4c93'], [9, '#56ccf2', '#2f80ed'],
    [13, '#4facfe', '#00c6fb'], [17, '#f6d365', '#fda085'], [19, '#ff7e5f', '#6a3093'], [21, '#141e30', '#243b55'], [24, '#0b1026', '#1b2448']];
  const mix = (a, b, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - f) + parseInt(b.substr(i, 2), 16) * f).toString(16).padStart(2, '0')).join('');
  function daylightGradient(date = new Date()) {
    const hour = date.getHours() + date.getMinutes() / 60;
    const next = DAYLIGHT.findIndex(stop => stop[0] > hour);
    const [h0, a0, b0] = DAYLIGHT[next - 1], [h1, a1, b1] = DAYLIGHT[next];
    const f = (hour - h0) / (h1 - h0);
    return `linear-gradient(160deg, ${mix(a0, a1, f)} 0%, ${mix(b0, b1, f)} 100%)`;
  }
  window.mwDaylightGradient = daylightGradient;
  Object.defineProperty(DESKTOP_GRADIENTS, 'daylight', { get: () => daylightGradient(), enumerable: true });
  setInterval(() => { const style = loadDesktopStyle(); if (style.wallpaperMode === 'gradient' && style.gradient === 'daylight') applyDesktopStyle(); }, 60000);

  // Parallax: the wallpaper drifts a few pixels against the pointer.
  const wallpaperLayer = document.getElementById('desktop-wallpaper');
  let parallaxFrame = 0, parallaxX = 0, parallaxY = 0;
  document.addEventListener('pointermove', event => {
    if (!loadDesktopStyle().parallax || reducedMotion()) { if (wallpaperLayer.style.translate) { wallpaperLayer.style.translate = ''; wallpaperLayer.style.scale = ''; } return; }
    parallaxX = event.clientX / innerWidth - 0.5; parallaxY = event.clientY / innerHeight - 0.5;
    if (parallaxFrame) return;
    parallaxFrame = requestAnimationFrame(() => {
      parallaxFrame = 0;
      wallpaperLayer.style.transition = 'translate .6s cubic-bezier(.2, .8, .2, 1)';
      wallpaperLayer.style.scale = '1.05';
      wallpaperLayer.style.translate = `${(-parallaxX * 22).toFixed(1)}px ${(-parallaxY * 16).toFixed(1)}px`;
    });
  }, { passive: true });

  /* ───────────── New system keys ───────────── */
  Object.assign(SYSTEM_KEY_ACTIONS, {
    'win+left': () => snapTop('left'),
    'win+right': () => snapTop('right'),
    'win+ctrl+left': () => switchDesk(currentDesk - 1),
    'win+ctrl+right': () => switchDesk(currentDesk + 1),
    'win+ctrl+d': addDesk,
    'win+ctrl+f4': closeDesk,
    'win+shift+s': startCapture,
    'win+v': toggleClipboard,
    'win+period': toggleEmoji
  });

  /* ───────────── What's new after an update ───────────── */
  const ICONS = ['auto_awesome', 'bolt', 'palette', 'security', 'language', 'rocket_launch', 'widgets', 'celebration'];
  fetch('/api/system/version', { cache: 'no-store' }).then(response => (response.ok ? response.json() : null)).then(info => {
    if (!info || !info.version) return;
    const seen = readStore('mwSeenVersion', null);
    writeStore('mwSeenVersion', info.version);
    if (!seen || seen === info.version || !info.changelog) return; // first start: nothing to compare with
    let sentences = String(info.changelog).split(/(?<=[.!?])\s+(?=[A-Z0-9À-Ý])/).map(text => text.trim()).filter(Boolean);
    // One long sentence that lists things ("…: a, b (x, y), and c."): one card per item.
    const list = sentences.length < 3 && sentences[0].match(/^[^:]{0,160}:\s+(.+)$/);
    if (list) {
      sentences = list[1].replace(/\.$/, '').split(/,\s+(?:and\s+|e\s+)?(?![^()]*\))/)
        .map(item => item.trim()).filter(Boolean).map(item => item.charAt(0).toLocaleUpperCase() + item.slice(1));
    }
    sentences = sentences.slice(0, 9);
    const layer = el('div'); layer.id = 'mwWhatsNew';
    const box = el('div', 'wn-box');
    const cards = el('div', 'wn-cards');
    sentences.forEach((sentence, index) => {
      const card = el('div', 'wn-card');
      card.style.animationDelay = (0.2 + index * 0.12) + 's';
      card.append(el('span', 'material-symbols-outlined', ICONS[index % ICONS.length]), document.createTextNode(sentence));
      cards.append(card);
    });
    const go = el('button', 'wn-go', mariowOSI18n.t('desktop.whatsnew.go', 'Let’s go')); go.type = 'button';
    go.onclick = () => { layer.classList.add('closing'); setTimeout(() => layer.remove(), 350); };
    box.append(el('h1', '', mariowOSI18n.t('desktop.whatsnew.title', 'mariowOS {version} is here', { version: info.version })), el('div', 'wn-sub', mariowOSI18n.t('desktop.whatsnew.subtitle', 'Here’s what’s new')), cards, go);
    layer.append(box);
    setTimeout(() => { document.body.appendChild(layer); burst(innerWidth / 2, innerHeight * 0.3, { count: 90 }); }, 1600);
  }).catch(() => {});

  /* ───────────── Konami code: stars from the Start button ───────────── */
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiAt = 0;
  document.addEventListener('keydown', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    konamiAt = key === KONAMI[konamiAt] ? konamiAt + 1 : (key === KONAMI[0] ? 1 : 0);
    if (konamiAt < KONAMI.length) return;
    konamiAt = 0;
    const start = document.getElementById('actionsBtn').getBoundingClientRect();
    for (let wave = 0; wave < 4; wave++) setTimeout(() => burst(start.left + start.width / 2, start.top, { count: 40, colors: ['#ffd60a', '#ffe680', '#ffb800', '#fff'], spread: 1.4, gravity: 1.6 }), wave * 260);
    sounds.done();
    flashIsland({ icon: 'sports_esports', title: mariowOSI18n.t('desktop.konami', 'It’s-a me, mariowOS!') }, 3200);
  });

  sounds.startup();
})();
