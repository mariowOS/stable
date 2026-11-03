// mariowOS builder note: global search (Win+S, Win+Space, the search button). The desktop's
// spotlight finds apps and offers a web search; this adds, in the same list:
//   - a calculator ("12*3+4", "15% of 80" is written 80*15%),
//   - Settings pages (by name and by what they contain, in English and Italian),
//   - files and folders in the user's home (the Files app's own search route),
// and arrow-key navigation over all rows. Loaded after the desktop's scripts: it wraps
// handleSpotlightInput / handleSpotlightKeydown, which the page calls by name.
(() => {
  if (typeof handleSpotlightInput !== 'function') return;
  const originalInput = handleSpotlightInput;
  const originalKeydown = handleSpotlightKeydown;
  const results = () => document.getElementById('spotlightResults');

  /* ───────────── Calculator: + - * / % ^ and brackets, no eval ───────────── */
  function calculate(text) {
    const source = text.replace(/\s+/g, '').replace(/,/g, '.').replace(/[x×]/gi, '*').replace(/÷/g, '/');
    if (!/^[\d.+\-*/%^()]+$/.test(source) || !/[+\-*/%^]/.test(source.replace(/^-/, ''))) return null;
    let at = 0;
    const peek = () => source[at];
    const number = () => {
      const match = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(source.slice(at));
      if (!match) throw new Error('number');
      at += match[0].length;
      let value = Number(match[0]);
      while (peek() === '%') { at++; value /= 100; }
      return value;
    };
    const unary = () => {
      if (peek() === '-') { at++; return -unary(); }
      if (peek() === '+') { at++; return unary(); }
      if (peek() === '(') {
        at++; const value = sum();
        if (peek() !== ')') throw new Error('bracket');
        at++;
        let result = value;
        while (peek() === '%') { at++; result /= 100; }
        return result;
      }
      return number();
    };
    const power = () => { const base = unary(); if (peek() === '^') { at++; return Math.pow(base, power()); } return base; };
    const product = () => {
      let value = power();
      while (peek() === '*' || peek() === '/') { const op = source[at++]; const right = power(); value = op === '*' ? value * right : value / right; }
      return value;
    };
    const sum = () => {
      let value = product();
      while (peek() === '+' || peek() === '-') { const op = source[at++]; const right = product(); value = op === '+' ? value + right : value - right; }
      return value;
    };
    try {
      const value = sum();
      if (at !== source.length || !Number.isFinite(value)) return null;
      return Math.round(value * 1e10) / 1e10;
    } catch (e) { return null; }
  }

  /* ───────────── Settings pages ───────────── */
  const SETTINGS = [
    ['you', 'account profile name photo email profilo nome foto account'],
    ['wifi', 'wifi wi-fi wireless network rete internet'],
    ['bluetooth', 'bluetooth devices headphones dispositivi cuffie'],
    ['ethernet', 'ethernet cable lan cavo rete'],
    ['apps', 'apps applications default uninstall app applicazioni predefinite disinstalla'],
    ['security', 'security password lock pin sicurezza blocco'],
    ['users', 'users accounts guest parental limits backup utenti ospite genitori limiti'],
    ['wallpaper', 'wallpaper background live gif video theme accent colors sfondo tema colori accento'],
    ['lockscreen', 'lock screen clock schermata di blocco orologio'],
    ['functions', 'lab experimental boot animation laboratorio sperimentali avvio animazione'],
    ['system', 'general system language keys sounds time date generale sistema lingua tasti suoni ora data statistiche anonime'],
    ['updater', 'updates update channel insiders aggiornamenti aggiorna canale'],
    ['backup', 'backup restore reset factory ripristino ripristina fabbrica'],
    ['about', 'about version info mariowos informazioni versione']
  ];
  const SETTINGS_TITLES = {
    you: 'You', wifi: 'Wi-Fi', bluetooth: 'Bluetooth', ethernet: 'Ethernet', apps: 'Apps', security: 'Security',
    users: 'Users', wallpaper: 'Wallpaper', lockscreen: 'Lock screen', functions: 'Lab', system: 'General',
    updater: 'Updates', backup: 'Backup and reset', about: 'About'
  };

  /* ───────────── Rows ───────────── */
  function row({ icon, title, sub, tag, run }) {
    const item = document.createElement('div');
    item.className = 'spotlight-result-item mw-search-row';
    item.onclick = () => { run(); closeSpotlight(); };
    const iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined spotlight-item-icon';
    iconEl.style.cssText = 'font-size:22px; color:var(--m3-accent-text);';
    iconEl.textContent = icon;
    const text = document.createElement('span');
    text.style.cssText = 'display:flex; flex-direction:column; min-width:0;';
    const name = document.createElement('span'); name.style.fontWeight = '500'; name.textContent = title;
    text.append(name);
    if (sub) { const small = document.createElement('span'); small.style.cssText = 'font-size:11.5px; opacity:.6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'; small.textContent = sub; text.append(small); }
    const label = document.createElement('span'); label.style.cssText = 'margin-left:auto; font-size:11px; opacity:.5; padding-left:10px;'; label.textContent = tag;
    item.append(iconEl, document.createTextNode(' '), text, label);
    return item;
  }
  // Our rows go before the web search row, which stays last.
  function insertRows(rows) {
    const list = results();
    if (!list || !rows.length) return;
    const web = list.lastElementChild;
    rows.forEach(item => list.insertBefore(item, web));
    // A real result beats "Search the web": move the highlight off the web row.
    const selected = list.querySelector('.spotlight-result-item.selected');
    if (!selected || selected === web) { web.classList.remove('selected'); rows[0].classList.add('selected'); }
  }

  const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
  const VIDEO = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v']);
  const TEXT = new Set(['', '.txt', '.md', '.json', '.js', '.css', '.html', '.csv', '.log', '.xml', '.yml', '.yaml', '.ini']);
  function openInFiles(dir) {
    openPopup('popup10');
    const frame = document.querySelector('#popup10 iframe');
    if (!frame) return;
    const go = () => frame.contentWindow?.postMessage({ type: 'navigate', path: dir }, location.origin);
    // A Files window opened just now is still loading: navigate once it is ready.
    if (!frame.src || frame.src.includes('about:blank') || frame.contentDocument?.readyState !== 'complete') frame.addEventListener('load', () => setTimeout(go, 150), { once: true });
    else go();
  }
  function openFound(item) {
    const full = `${item.dir}/${item.name}`;
    if (item.type === 'folder') { openInFiles(full); return; }
    if (IMAGE.has(item.ext) && typeof openFileInPicture === 'function') { openFileInPicture(item.dir, item.name); return; }
    if (VIDEO.has(item.ext) && typeof openFileInVideo === 'function') { openFileInVideo(item.dir, item.name); return; }
    if (TEXT.has(item.ext) && typeof openFileInNotes === 'function') { openFileInNotes(item.dir, item.name); return; }
    openInFiles(item.dir);
  }
  const fileIcon = item => item.type === 'folder' ? 'folder' : IMAGE.has(item.ext) ? 'image' : VIDEO.has(item.ext) ? 'movie'
    : ['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(item.ext) ? 'music_note' : item.ext === '.pdf' ? 'picture_as_pdf' : 'description';

  let fileTimer = 0, fileToken = 0;
  function searchFiles(query) {
    clearTimeout(fileTimer);
    const token = ++fileToken;
    if (query.length < 2) return;
    fileTimer = setTimeout(async () => {
      try {
        const data = await fetch(`/api/system/files/search?path=${encodeURIComponent('/home')}&q=${encodeURIComponent(query)}`, { cache: 'no-store' }).then(r => r.json());
        if (token !== fileToken || !data.success) return;
        insertRows((data.results || []).slice(0, 6).map(item => row({
          icon: fileIcon(item), title: item.name, sub: item.dir.replace(/^\/home/, mariowOSI18n.t('desktop.search.home', 'Home')),
          tag: item.type === 'folder' ? mariowOSI18n.t('desktop.search.folder', 'Folder') : mariowOSI18n.t('desktop.search.file', 'File'),
          run: () => openFound(item)
        })));
      } catch (e) { /* offline or signed out: apps and settings still work */ }
    }, 180);
  }

  window.handleSpotlightInput = handleSpotlightInput = function (query) {
    originalInput(query);
    const text = String(query || '').trim();
    if (!text) { fileToken++; return; }
    const list = results();
    const rows = [];
    const value = calculate(text);
    if (value !== null) {
      const shown = value.toLocaleString(mariowOSI18n.locale || undefined, { maximumFractionDigits: 10 });
      const calc = row({ icon: 'calculate', title: `= ${shown}`, sub: mariowOSI18n.t('desktop.search.copy-result', 'Press Enter to copy the result'),
        tag: mariowOSI18n.t('desktop.search.calculation', 'Calculation'), run: () => navigator.clipboard?.writeText(String(value)).catch(() => {}) });
      list.querySelector('.selected')?.classList.remove('selected');
      calc.classList.add('selected');
      list.prepend(calc);
    }
    const q = text.toLowerCase();
    SETTINGS.forEach(([key, words]) => {
      const title = mariowOSI18n.t(`settings.nav.${key}`, SETTINGS_TITLES[key]);
      if (q.length < 2 || !(title.toLowerCase().includes(q) || words.includes(q))) return;
      rows.push(row({ icon: 'settings', title, sub: mariowOSI18n.t('desktop.search.settings-sub', 'Settings'),
        tag: mariowOSI18n.t('desktop.search.setting', 'Setting'), run: () => openSettingsPage(key) }));
    });
    insertRows(rows.slice(0, 4));
    searchFiles(text);
  };

  // Arrows move over every row; Enter opens the highlighted one.
  window.handleSpotlightKeydown = handleSpotlightKeydown = function (event) {
    const list = results();
    const items = list ? [...list.querySelectorAll('.spotlight-result-item')] : [];
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) {
      event.preventDefault();
      const index = items.findIndex(item => item.classList.contains('selected'));
      const next = items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      items.forEach(item => item.classList.toggle('selected', item === next));
      next.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter') {
      const selected = list?.querySelector('.spotlight-result-item.selected');
      if (selected && event.target.value.trim()) { event.preventDefault(); selected.click(); return; }
    }
    originalKeydown(event);
  };
})();
