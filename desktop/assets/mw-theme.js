// mariowOS light/dark theme, shared by the desktop and every system page. See docs/design.md.
//
// Load it in <head>, right after accent.js and before any stylesheet, so the first paint is
// already in the right theme:
//   <script src="/desktop/assets/mw-theme.js"></script>
//
// It sets <html data-theme="dark|light"> (what mw-design.css keys on) and keeps it in sync:
//  - the choice is "dark", "light" or "auto" (follows the OS), saved as `theme` in config.json
//    through /save-settings and cached in localStorage "mwTheme" for an instant first paint;
//  - every same-origin page and frame hears a change through the storage event;
//  - a window can also be told directly: postMessage({ type: 'mw-theme', theme }) — a page
//    passes it on to its own frames, so nested Settings pages follow too.
// API: mariowOSTheme.get() → the saved choice, .resolved() → "dark"|"light",
//      .set(choice) saves and applies everywhere, .apply(choice) applies here only.
(function () {
  const KEY = 'mwTheme';
  const CHOICES = ['dark', 'light', 'auto'];
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  const clean = value => (CHOICES.includes(value) ? value : 'dark');
  const read = () => { try { return clean(localStorage.getItem(KEY)); } catch (e) { return 'dark'; } };
  const write = value => { try { localStorage.setItem(KEY, value); } catch (e) {} };
  const resolve = choice => (choice === 'auto' ? (media && media.matches ? 'light' : 'dark') : choice);

  let current = read();

  function apply(choice) {
    current = clean(choice);
    const theme = resolve(current);
    if (root.dataset.theme !== theme) root.dataset.theme = theme;
    root.dataset.themeChoice = current;
    return theme;
  }

  // Pass a change on to this page's own frames (same-origin ones also get the storage event,
  // this covers frames that were created before localStorage was readable).
  function relay(choice) {
    const frames = document.querySelectorAll('iframe');
    frames.forEach(frame => {
      try { frame.contentWindow && frame.contentWindow.postMessage({ type: 'mw-theme', theme: choice }, location.origin); } catch (e) {}
    });
  }

  function set(choice, { persist = true } = {}) {
    choice = clean(choice);
    write(choice);
    apply(choice);
    relay(choice);
    if (window.top !== window) {
      try { window.top.postMessage({ type: 'mw-theme', theme: choice }, location.origin); } catch (e) {}
    }
    if (persist) {
      fetch('/save-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: choice }) }).catch(() => {});
    }
    return choice;
  }

  apply(current);

  window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) { apply(read()); } });
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'mw-theme') return;
    const choice = clean(e.data.theme);
    if (choice !== current) { write(choice); apply(choice); }
    relay(choice);
  });
  if (media) {
    const follow = () => { if (current === 'auto') apply('auto'); };
    if (media.addEventListener) media.addEventListener('change', follow); else if (media.addListener) media.addListener(follow);
  }

  // The top-level page (desktop, lock screen, sign-in) picks up the saved choice from the
  // server once, in case localStorage was cleared or another account changed it.
  if (window.top === window && /^https?:$/.test(location.protocol)) {
    fetch('/get-settings', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        if (!cfg || !CHOICES.includes(cfg.theme) || cfg.theme === current) return;
        write(cfg.theme); apply(cfg.theme); relay(cfg.theme);
      })
      .catch(() => {});
  }

  window.mariowOSTheme = { get: () => current, resolved: () => resolve(current), set, apply };
})();
