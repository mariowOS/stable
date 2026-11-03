// mariowOS app SDK, desktop side. Load it in the desktop page after its own scripts.
//
// Store apps (above all third-party ones, which run on their own origin in a sandboxed frame)
// never call system APIs themselves. They post { type: 'mw-sdk', id, method, params } to the
// desktop (see /desktop/assets/sdk/mariowos-app.js); this file finds which app window sent it,
// checks the permissions the user granted to that app (config.installedApps[i].grantedPermissions,
// managed in Store > My apps), does the work with the system's own routes and answers that
// window only: { type: 'mw-sdk-reply', id, ok, result | error: { code, message } }.
// Nothing is ever done for an app without its permission. See docs/app-sdk.md.
(function () {
  'use strict';
  if (window.mariowOSSdkHost) return;

  const HOST_VERSION = '2.0.0';
  const SETTINGS_TTL_MS = 10000;
  const FETCH_TIMEOUT_MS = 10000;
  const RATE_WINDOW_MS = 10000;
  const RATE_MAX_CALLS = 120;
  const MAX_IN_FLIGHT = 8;
  const MAX_TEXT_CHARS = 2 * 1024 * 1024;
  const MAX_BLOB_BYTES = 10 * 1024 * 1024;
  const MAX_CLIPBOARD_CHARS = 100000;
  const MAX_PATH_DEPTH = 8;

  // Permissions an app may be granted. 'notifications' and window control are implicit.
  const GRANTABLE = new Set(['files.documents', 'files.pictures', 'theme', 'storage', 'clipboard.write', 'open-url']);
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif']);
  // Files an app may never write: anything the user could run or that opens as a web page.
  const BLOCKED_WRITE_EXTS = new Set(['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.ps1', '.psm1', '.vbs', '.vbe',
    '.js', '.jse', '.wsf', '.wsh', '.hta', '.lnk', '.url', '.reg', '.dll', '.sys', '.jar', '.sh', '.command', '.app',
    '.html', '.htm', '.xhtml', '.svg', '.desktop', '.appimage', '.deb', '.rpm', '.apk']);
  const FOLDERS = {
    documents: { permission: 'files.documents', dir: '/home/Documents' },
    pictures: { permission: 'files.pictures', dir: '/home/Pictures', imagesOnly: true }
  };

  const permissionLabel = id => ({
    'files.documents': mariowOSI18n.t("sdk.perm.files-documents", "use your Documents folder"),
    'files.pictures': mariowOSI18n.t("sdk.perm.files-pictures", "use your Pictures folder"),
    'theme': mariowOSI18n.t("sdk.perm.theme", "follow your theme"),
    'storage': mariowOSI18n.t("sdk.perm.storage", "keep its own data"),
    'clipboard.write': mariowOSI18n.t("sdk.perm.clipboard-write", "copy to your clipboard"),
    'open-url': mariowOSI18n.t("sdk.perm.open-url", "open web pages")
  }[id] || id);

  class SdkError extends Error {
    constructor(code, message) { super(message || code); this.code = code; }
  }
  const fail = (code, message) => { throw new SdkError(code, message); };

  // ---------- Who is calling ----------
  let settingsCache = null;
  let settingsAt = 0;
  async function loadSettings(force) {
    if (!force && settingsCache && Date.now() - settingsAt < SETTINGS_TTL_MS) return settingsCache;
    const response = await fetch('/get-settings', { cache: 'no-store' });
    if (!response.ok) fail('unavailable', 'Settings are not available.');
    const cfg = await response.json();
    settingsCache = {
      apps: Array.isArray(cfg.installedApps) ? cfg.installedApps : [],
      appsOrigin: typeof cfg.appsOrigin === 'string' ? cfg.appsOrigin : null,
      theme: cfg.theme
    };
    settingsAt = Date.now();
    return settingsCache;
  }

  // The same rule as the desktop's own message handler: the popup whose iframe is the sender.
  function popupIdOf(source) {
    if (typeof appIdOfMessageSource === 'function') return appIdOfMessageSource(source);
    const popup = [...document.querySelectorAll('.popup')]
      .find(p => { const f = p.querySelector('iframe'); return f && f.contentWindow === source; });
    return popup ? popup.id : null;
  }

  // { app, granted:Set } for an installed app's window, or null for anything else.
  async function callerOf(event) {
    const appId = popupIdOf(event.source);
    if (!appId) return null;
    const settings = await loadSettings(false);
    const app = settings.apps.find(item => item && item.appId === appId);
    if (!app) return null;
    if (app.isolated) {
      if (!settings.appsOrigin || event.origin !== settings.appsOrigin) return null;
      const granted = new Set((Array.isArray(app.grantedPermissions) ? app.grantedPermissions : []).filter(id => GRANTABLE.has(id)));
      return { app, appId, granted };
    }
    // Apps of the mariowOS team run with the system on its own origin: they hold everything.
    if (event.origin !== window.location.origin) return null;
    return { app, appId, granted: new Set(GRANTABLE) };
  }

  // ---------- Limits ----------
  const callLog = new Map();   // appId -> timestamps
  const inFlight = new Map();  // appId -> count
  function admit(appId) {
    const now = Date.now();
    const recent = (callLog.get(appId) || []).filter(at => now - at < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX_CALLS) { callLog.set(appId, recent); fail('rate-limited', 'Too many requests, slow down.'); }
    if ((inFlight.get(appId) || 0) >= MAX_IN_FLIGHT) fail('rate-limited', 'Too many requests at the same time.');
    recent.push(now);
    callLog.set(appId, recent);
  }

  const notifiedDenials = new Set();
  function requirePermission(ctx, permission) {
    if (ctx.granted.has(permission)) return;
    const key = ctx.appId + '|' + permission;
    if (!notifiedDenials.has(key) && typeof showNotification === 'function') {
      notifiedDenials.add(key);
      const appName = String(ctx.app.title || ctx.appId).slice(0, 60);
      showNotification(
        mariowOSI18n.t("sdk.denied.title", "{app} was blocked", { app: appName }),
        mariowOSI18n.t("sdk.denied.text", "It tried to {action} without your permission. You can allow it in Store > My apps.", { action: permissionLabel(permission) }),
        'block'
      );
    }
    fail('permission-denied', 'This app does not have the "' + permission + '" permission.');
  }

  // ---------- System calls ----------
  async function api(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
      return response;
    } catch (e) {
      fail(e && e.name === 'AbortError' ? 'timeout' : 'failed', e && e.name === 'AbortError' ? 'The system did not answer in time.' : 'The system could not be reached.');
    } finally { clearTimeout(timer); }
  }
  async function apiError(response) {
    let message = '';
    try { const data = await response.json(); message = data && data.error ? String(data.error).slice(0, 200) : ''; } catch (e) {}
    const code = response.status === 404 ? 'not-found' : response.status === 409 ? 'exists' : response.status === 413 ? 'too-large' : 'failed';
    return new SdkError(code, message || 'The system refused the request (' + response.status + ').');
  }
  const postJson = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // "My App/notes/list.txt" -> ['My App', 'notes', 'list.txt'], refusing anything that could
  // leave the folder or that Windows cannot store.
  function parsePath(value, allowEmpty) {
    if (typeof value !== 'string' || value.length > 1024) fail('bad-request', 'The path must be text.');
    const clean = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!clean) { if (allowEmpty) return []; fail('bad-request', 'The path is empty.'); }
    const parts = clean.split('/');
    if (parts.length > MAX_PATH_DEPTH) fail('bad-request', 'The path is too deep.');
    for (const part of parts) {
      if (!part || part === '.' || part === '..' || part.length > 255 || /[\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part)) {
        fail('bad-request', 'Invalid name in the path: "' + part.slice(0, 40) + '".');
      }
    }
    return parts;
  }
  const extOf = name => { const dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(dot).toLowerCase() : ''; };

  function folderOf(ctx, params) {
    const folder = FOLDERS[params && params.folder];
    if (!folder || !Object.prototype.hasOwnProperty.call(FOLDERS, params.folder)) fail('bad-request', 'Unknown folder. Use "documents" or "pictures".');
    requirePermission(ctx, folder.permission);
    return folder;
  }
  function target(folder, path) {
    const parts = parsePath(path, false);
    const name = parts[parts.length - 1];
    if (folder.imagesOnly && !IMAGE_EXTS.has(extOf(name))) fail('bad-request', 'Only pictures can be used in the Pictures folder.');
    return { dir: [folder.dir, ...parts.slice(0, -1)].join('/'), name };
  }

  async function listDir(dir) {
    const response = await api('/api/system/files?path=' + encodeURIComponent(dir));
    if (!response.ok) throw await apiError(response);
    const data = await response.json();
    return Array.isArray(data.contents) ? data.contents : [];
  }
  async function ensureDir(dir) {
    try { await listDir(dir); return; } catch (e) { if (e.code !== 'not-found') throw e; }
    const segments = dir.replace(/^\/home\/?/, '').split('/').filter(Boolean);
    let parent = '/home';
    for (const segment of segments) {
      await postJson('/api/system/files/create-folder', { path: parent, name: segment }); // "already there" is fine
      parent += '/' + segment;
    }
  }

  const METHODS = {
    async 'sdk.info'(ctx) {
      return { appId: ctx.appId, sdkVersion: HOST_VERSION, permissions: [...ctx.granted].sort() };
    },

    async 'window.setTitle'(ctx, params) {
      const popup = document.getElementById(ctx.appId);
      const label = popup && popup.querySelector('.popup-header > span');
      if (!label) fail('unavailable', 'The window is not open.');
      const appName = String(ctx.app.title || ctx.appId);
      const title = String(params.title == null ? '' : params.title).replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 60);
      // The app's own name always stays in front, so no app can pass itself off as another.
      label.textContent = title ? appName + ' — ' + title : appName;
      return null;
    },

    async 'files.list'(ctx, params) {
      const folder = folderOf(ctx, params);
      const parts = parsePath(params.path == null ? '' : params.path, true);
      let contents;
      try { contents = await listDir([folder.dir, ...parts].join('/')); }
      catch (e) { if (e.code === 'not-found' && !parts.length) return []; throw e; }
      return contents
        .filter(item => item && typeof item.name === 'string')
        .filter(item => item.type === 'folder' || !folder.imagesOnly || IMAGE_EXTS.has(extOf(item.name)))
        .slice(0, 2000)
        .map(item => ({ name: item.name, type: item.type === 'folder' ? 'folder' : 'file', size: item.bytes >= 0 ? item.bytes : null, modified: item.mtime || null }));
    },

    async 'files.read'(ctx, params) {
      const folder = folderOf(ctx, params);
      const { dir, name } = target(folder, params.path);
      const as = params.as === 'blob' ? 'blob' : 'text';
      const entry = (await listDir(dir)).find(item => item.name === name);
      if (!entry) fail('not-found', 'File not found.');
      if (entry.type === 'folder') fail('bad-request', 'That is a folder.');
      if (entry.bytes > (as === 'text' ? MAX_TEXT_CHARS : MAX_BLOB_BYTES)) fail('too-large', 'The file is too large.');
      const query = '?path=' + encodeURIComponent(dir) + '&name=' + encodeURIComponent(name);
      if (as === 'text') {
        const response = await api('/api/system/files/content' + query);
        if (!response.ok) throw await apiError(response);
        const data = await response.json();
        return typeof data.content === 'string' ? data.content : '';
      }
      const response = await api('/api/system/files/raw' + query);
      if (!response.ok) throw await apiError(response);
      const blob = await response.blob();
      if (blob.size > MAX_BLOB_BYTES) fail('too-large', 'The file is too large.');
      return blob;
    },

    async 'files.write'(ctx, params) {
      const folder = folderOf(ctx, params);
      const { dir, name } = target(folder, params.path);
      if (BLOCKED_WRITE_EXTS.has(extOf(name))) fail('bad-request', 'Apps cannot save this kind of file.');
      const data = params.data;
      const overwrite = params.overwrite !== false;
      let body = null;
      if (typeof data === 'string') {
        if (data.length > MAX_TEXT_CHARS) fail('too-large', 'The text is too large.');
      } else if (data instanceof Blob) {
        if (data.size > MAX_BLOB_BYTES) fail('too-large', 'The file is too large.');
        body = data;
      } else if (data instanceof ArrayBuffer) {
        if (data.byteLength > MAX_BLOB_BYTES) fail('too-large', 'The file is too large.');
        body = new Blob([data]);
      } else fail('bad-request', 'Save a string, a Blob or an ArrayBuffer.');

      await ensureDir(dir);
      const response = body
        ? await api('/api/system/files/upload-raw?path=' + encodeURIComponent(dir) + '&name=' + encodeURIComponent(name) + '&conflict=' + (overwrite ? 'replace' : 'fail'),
          { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body })
        : await postJson('/api/system/files/content', { path: dir, name, content: data, createOnly: !overwrite });
      if (!response.ok) throw await apiError(response);
      return { name, size: body ? body.size : new Blob([data]).size };
    },

    async 'theme.get'(ctx) {
      requirePermission(ctx, 'theme');
      return currentTheme();
    },

    async 'theme.subscribe'(ctx, params, event) {
      requirePermission(ctx, 'theme');
      themeSubscribers.set(event.source, { appId: ctx.appId, origin: event.origin });
      return currentTheme();
    },

    async 'clipboard.write'(ctx, params) {
      requirePermission(ctx, 'clipboard.write');
      const text = params.text;
      if (typeof text !== 'string') fail('bad-request', 'Only text can be copied.');
      if (text.length > MAX_CLIPBOARD_CHARS) fail('too-large', 'The text is too long to copy.');
      try { await navigator.clipboard.writeText(text); return null; } catch (e) {}
      // The desktop may not hold the focus (the app's frame does): copy through a hidden field.
      const previous = document.activeElement;
      const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
      field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (e) {}
      field.remove();
      if (previous && typeof previous.focus === 'function') previous.focus();
      if (!copied) fail('failed', 'The clipboard is not available.');
      return null;
    },

    async 'openUrl'(ctx, params) {
      requirePermission(ctx, 'open-url');
      let url;
      try { url = new URL(String(params.url || '')); } catch (e) { fail('bad-request', 'Not a valid address.'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) fail('bad-request', 'Only https:// addresses can be opened.');
      if (typeof openUrlInBrowserTab === 'function') openUrlInBrowserTab(url.href);
      else window.open(url.href, '_blank', 'noopener');
      return null;
    }
  };

  // ---------- Theme ----------
  const themeSubscribers = new Map(); // window -> { appId, origin }
  function currentTheme() {
    let accent = null;
    try { accent = JSON.parse(localStorage.getItem('desktopStyle') || '{}').accent; } catch (e) {}
    const derived = window.mariowOSAccent && typeof window.mariowOSAccent.derive === 'function'
      ? window.mariowOSAccent.derive(accent) : { accent: '#0a84ff', on: '#ffffff', text: '#4da3ff' };
    return {
      accent: derived.accent,
      accentOn: derived.on,
      accentText: derived.text,
      dark: !(settingsCache && settingsCache.theme === 'light'),
      language: (window.mariowOSI18n && mariowOSI18n.locale) || 'en'
    };
  }
  let lastThemeSent = '';
  let themeTimer = null;
  function broadcastTheme() {
    clearTimeout(themeTimer);
    themeTimer = setTimeout(async () => {
      const theme = currentTheme();
      const serialized = JSON.stringify(theme);
      if (serialized === lastThemeSent) return;
      lastThemeSent = serialized;
      let settings = null;
      try { settings = await loadSettings(true); } catch (e) { return; }
      for (const [source, sub] of themeSubscribers) {
        const app = popupIdOf(source) === sub.appId && settings.apps.find(item => item && item.appId === sub.appId);
        const allowed = app && (!app.isolated || (Array.isArray(app.grantedPermissions) && app.grantedPermissions.includes('theme')));
        if (!allowed) { themeSubscribers.delete(source); continue; }
        try { source.postMessage({ type: 'mw-sdk-event', event: 'theme', data: theme }, sub.origin); } catch (e) { themeSubscribers.delete(source); }
      }
    }, 150);
  }
  window.addEventListener('storage', e => { if (e.key === 'desktopStyle' || e.key === null) broadcastTheme(); });

  // ---------- Messages ----------
  function reply(event, id, ok, payload) {
    const message = ok ? { type: 'mw-sdk-reply', id, ok: true, result: payload === undefined ? null : payload }
      : { type: 'mw-sdk-reply', id, ok: false, error: payload };
    try { event.source.postMessage(message, event.origin); } catch (e) {}
  }

  window.addEventListener('message', async event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // The system's own pages tell us when what we cached may have changed.
    if (event.origin === window.location.origin && typeof data.type === 'string') {
      if (data.type === 'app-permissions-changed' || data.type === 'app-installed-live' || data.type === 'app-uninstalled-live') {
        settingsAt = 0;
        notifiedDenials.clear();
      }
      if (data.type === 'apply-style') broadcastTheme();
    }

    if (data.type !== 'mw-sdk' || !event.source) return;
    const id = typeof data.id === 'string' ? data.id.slice(0, 64) : null;
    if (!id) return;

    let ctx;
    try { ctx = await callerOf(event); } catch (e) { return; }
    if (!ctx) return; // not an installed app's window: no answer at all

    const method = typeof data.method === 'string' && Object.prototype.hasOwnProperty.call(METHODS, data.method) ? METHODS[data.method] : null;
    if (!method) { reply(event, id, false, { code: 'unknown-method', message: 'Unknown method.' }); return; }
    const params = data.params && typeof data.params === 'object' ? data.params : {};

    try { admit(ctx.appId); } catch (e) { reply(event, id, false, { code: e.code, message: e.message }); return; }
    inFlight.set(ctx.appId, (inFlight.get(ctx.appId) || 0) + 1);
    try {
      reply(event, id, true, await method(ctx, params, event));
    } catch (e) {
      const known = e instanceof SdkError;
      if (!known) console.error('[sdk-host]', data.method, e);
      reply(event, id, false, { code: known ? e.code : 'failed', message: known ? e.message : 'Something went wrong.' });
    } finally {
      inFlight.set(ctx.appId, Math.max(0, (inFlight.get(ctx.appId) || 1) - 1));
    }
  });

  window.mariowOSSdkHost = Object.freeze({ version: HOST_VERSION });
})();
