// mariowOS app SDK (v2). Load it from your app (./mariowos-app.js) or from the system
// (/desktop/assets/sdk/mariowos-app.js). Full guide: docs/app-sdk.md.
//
// Your app never calls system APIs itself: every call is a message to the desktop, which
// checks the permissions the user granted to your app (mariowos.json → Store → install),
// does the work and answers. Every call returns a Promise; failures reject with an Error
// whose `code` is one of: permission-denied, bad-request, too-large, not-found, exists,
// rate-limited, timeout, unavailable, unknown-method, failed.
//
//   await mariowOS.notify("Saved", "Your list is up to date.");
//   const text = await mariowOS.files.read("documents", "My App/list.txt");
//   mariowOS.theme.apply();   // use the user's accent color in your CSS: var(--mw-accent)
(function () {
  "use strict";
  if (window.mariowOS && window.mariowOS.sdkVersion) return;

  const SDK_VERSION = "2.0.0";
  const DEFAULT_TIMEOUT_MS = 15000;
  const hosted = window.parent !== window;
  const pending = new Map();
  const themeListeners = new Set();
  let nextId = 1;
  let themeSubscribed = false;

  class MariowOSError extends Error {
    constructor(code, message) { super(message || code); this.name = "MariowOSError"; this.code = code; }
  }

  const post = message => { if (hosted) window.parent.postMessage(message, "*"); };

  window.addEventListener("message", event => {
    if (!hosted || event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "mw-sdk-reply" && pending.has(data.id)) {
      const { resolve, reject, timer } = pending.get(data.id);
      pending.delete(data.id);
      clearTimeout(timer);
      if (data.ok) resolve(data.result);
      else reject(new MariowOSError(data.error && data.error.code || "failed", data.error && data.error.message));
    } else if (data.type === "mw-sdk-event" && data.event === "theme") {
      themeListeners.forEach(listener => { try { listener(data.data); } catch (e) { console.error(e); } });
    }
  });

  // One request to the desktop. Rejects after `timeoutMs` if nobody answers (for example
  // when the app is opened directly in a browser, or on a mariowOS without the SDK host).
  function call(method, params, timeoutMs) {
    if (!hosted) return Promise.reject(new MariowOSError("unavailable", "Not running inside mariowOS."));
    return new Promise((resolve, reject) => {
      const id = "r" + (nextId++) + "-" + Date.now().toString(36);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new MariowOSError("timeout", "The desktop did not answer " + method + "."));
      }, timeoutMs || DEFAULT_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      post({ type: "mw-sdk", v: 1, id, method, params: params || {} });
    });
  }

  const blobToDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new MariowOSError("failed", "Could not read the file."));
    reader.readAsDataURL(blob);
  });

  // Same-origin JSON storage: the app's origin is private to it, so localStorage is enough.
  const PREFIX = "mwapp:";
  const storage = Object.freeze({
    async get(key, fallback) {
      try { const raw = localStorage.getItem(PREFIX + key); return raw == null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
    },
    async set(key, value) { localStorage.setItem(PREFIX + key, JSON.stringify(value)); },
    async remove(key) { localStorage.removeItem(PREFIX + key); },
    async keys() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length)); }
      return keys;
    },
    async clear() { (await storage.keys()).forEach(k => localStorage.removeItem(PREFIX + k)); }
  });

  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement;
    root.style.setProperty("--mw-accent", theme.accent);
    root.style.setProperty("--mw-accent-on", theme.accentOn);
    root.style.setProperty("--mw-accent-text", theme.accentText);
    root.style.colorScheme = theme.dark ? "dark" : "light";
    root.dataset.mwTheme = theme.dark ? "dark" : "light";
  }

  window.mariowOS = Object.freeze({
    sdkVersion: SDK_VERSION,
    Error: MariowOSError,
    // True when the app is opened inside mariowOS (not directly in a browser).
    get isHosted() { return hosted; },

    // Implicit: every app may do these, always on its own window.
    notify(title, message) {
      post({ type: "show-notification", title: String(title == null ? "" : title), msg: String(message == null ? "" : message) });
      return Promise.resolve();
    },
    close() { post({ type: "close-app" }); return Promise.resolve(); },
    toggleMaximize() { post({ type: "maximize-app" }); return Promise.resolve(); },
    window: Object.freeze({
      close() { return window.mariowOS.close(); },
      toggleMaximize() { return window.mariowOS.toggleMaximize(); },
      setTitle(title) { return call("window.setTitle", { title: String(title == null ? "" : title) }); }
    }),

    // { appId, sdkVersion, permissions: [granted ids] }
    info() { return call("sdk.info"); },
    async hasPermission(id) { return ((await call("sdk.info")).permissions || []).includes(id); },

    // folder: "documents" (permission files.documents) or "pictures" (files.pictures).
    // path: relative to that folder, "/" between folders, e.g. "My App/data.json".
    files: Object.freeze({
      list(folder, path) { return call("files.list", { folder, path: path || "" }); },
      // options.as: "text" (default), "blob" or "dataUrl"
      async read(folder, path, options) {
        const as = options && options.as || "text";
        const result = await call("files.read", { folder, path, as: as === "dataUrl" ? "blob" : as }, 30000);
        return as === "dataUrl" ? blobToDataUrl(result) : result;
      },
      // data: a string (saved as UTF-8 text), a Blob or an ArrayBuffer.
      // options.overwrite: false refuses to replace an existing file (error code "exists").
      write(folder, path, data, options) {
        const overwrite = !(options && options.overwrite === false);
        return call("files.write", { folder, path, data, overwrite }, 30000);
      }
    }),

    theme: Object.freeze({
      // { accent, accentOn, accentText, dark, language }
      get() { return call("theme.get"); },
      onChange(listener) {
        if (typeof listener !== "function") throw new TypeError("onChange needs a function");
        themeListeners.add(listener);
        if (!themeSubscribed) { themeSubscribed = true; call("theme.subscribe").catch(() => { themeSubscribed = false; }); }
        return () => themeListeners.delete(listener);
      },
      // Sets --mw-accent, --mw-accent-on, --mw-accent-text and color-scheme on <html>, now
      // and whenever the user changes them.
      async apply() {
        const theme = await window.mariowOS.theme.get();
        applyTheme(theme);
        window.mariowOS.theme.onChange(applyTheme);
        return theme;
      }
    }),

    storage,

    clipboard: Object.freeze({
      write(text) { return call("clipboard.write", { text: String(text == null ? "" : text) }); }
    }),

    // https:// pages only; they open in the mariowOS Browser.
    openUrl(url) { return call("openUrl", { url: String(url) }); }
  });
})();
