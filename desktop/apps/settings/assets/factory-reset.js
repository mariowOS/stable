// Shared by every "factory reset" button in Settings.

// The kernel re-checks the account password before wiping anything.
// Resolves to true / false, or null when the kernel is too old to say.
async function factoryResetNeedsPassword() {
  try {
    const res = await fetch('/get-settings', { cache: 'no-store' });
    const data = await res.json();
    return typeof data.hasPassword === 'boolean' ? data.hasPassword : null;
  } catch (e) {
    return null;
  }
}

// Asks for the account password in a dialog. Resolves to the password,
// '' when the account has none, or null when the user cancels.
async function askFactoryResetPassword() {
  const needs = await factoryResetNeedsPassword();
  if (needs === false) return '';
  const password = await mDialog.prompt(
    needs === null
      ? 'Enter your account password to confirm. Leave it empty if you never set one.'
      : 'Enter your account password to confirm the factory reset.',
    { type: 'password', title: 'Confirm with password', okText: 'Erase everything', danger: true, kind: 'warning' }
  );
  return password === null ? null : password;
}

async function runFactoryReset(password) {
  const res = await fetch('/api/system/factory-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password || '' })
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || !data || !data.success) {
    throw new Error(data ? (data.error || 'Server error') : 'The system kernel is outdated: restart mariowOS and try again.');
  }

  try { localStorage.clear(); } catch (e) {}
  try { sessionStorage.clear(); } catch (e) {}
  try {
    if (window.indexedDB && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      dbs.forEach(db => db.name && indexedDB.deleteDatabase(db.name));
    }
  } catch (e) {}
  document.cookie.split(';').forEach(c => {
    document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
  });

  // Inside the Electron shell also wipe cookies, cache and storage of the built-in browser.
  try {
    const bridge = window.top.mariowOSElectron;
    if (bridge && bridge.clearBrowserData) await bridge.clearBrowserData();
  } catch (e) { console.warn('Could not clear browser data:', e); }

  // Restart the whole shell (not just the Settings window) from the welcome screen.
  window.top.location.replace('/');
}
