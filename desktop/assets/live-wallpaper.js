// mariowOS live wallpapers: an MP4/WebM video or an animated GIF as the background of the
// desktop, the lock screen and the login (Settings › Wallpaper & Style › Live).
//
//   const live = mariowOSLiveWallpaper.mount(element);  // element: the wallpaper layer
//   mount(element, { paused: () => bool })               // also still while paused() is true
//   live.play();       // after paused() may have changed
//   live.update();     // after the style changed (mode, fit)
//   live.reload();     // after a new file was uploaded
//
// The "Live wallpaper" switch (Settings › Lock screen, localStorage "liveWallpaper") decides
// whether it moves; when off, the first frame stays still. It also stops while the page is
// hidden, so a wallpaper never plays for nobody.
(() => {
  const FITS = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none', tile: 'cover' };
  const read = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  const isAnimated = () => read('liveWallpaper') === 'true';
  const style = () => { try { return JSON.parse(read('desktopStyle') || '{}'); } catch (e) { return {}; } };

  let info;  // { url, type: "video" | "gif" } or null, shared by every mount on the page
  let infoRequest = null;
  function fetchInfo(force) {
    if (!force && infoRequest) return infoRequest;
    infoRequest = fetch('/api/wallpaper/live', { cache: 'no-store' })
      .then(response => (response.ok ? response.json() : null))
      .then(data => (info = data && data.url ? data : null))
      .catch(() => (info = null));
    return infoRequest;
  }

  if (!document.getElementById('mw-live-wallpaper-style')) {
    const css = document.createElement('style');
    css.id = 'mw-live-wallpaper-style';
    css.textContent = `
      .mw-live-wallpaper { position: absolute; inset: 0; overflow: hidden; pointer-events: none; opacity: 0; transition: opacity .8s ease; }
      .mw-live-wallpaper.shown { opacity: 1; }
      .mw-live-wallpaper > video, .mw-live-wallpaper > img, .mw-live-wallpaper > canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
      .mw-live-wallpaper > [hidden] { display: none; }`;
    document.head.appendChild(css);
  }

  function mount(host, options = {}) {
    const paused = options.paused || (() => false);
    const layer = document.createElement('div');
    layer.className = 'mw-live-wallpaper';
    host.appendChild(layer);
    let media = null, still = null, mediaUrl = null;

    function clear() {
      layer.classList.remove('shown');
      layer.replaceChildren();
      media = still = mediaUrl = null;
    }

    function build() {
      const url = `${info.url}?v=${encodeURIComponent(info.version || '')}`;
      if (url === mediaUrl) return;
      layer.replaceChildren();
      mediaUrl = url;
      if (info.type === 'video') {
        media = document.createElement('video');
        Object.assign(media, { muted: true, loop: true, playsInline: true, preload: 'auto', src: url });
        media.setAttribute('aria-hidden', 'true');
        media.addEventListener('loadeddata', () => { layer.classList.add('shown'); play(); }, { once: true });
        layer.appendChild(media);
        still = null;
      } else {
        // A GIF cannot be paused: its first frame is copied onto a canvas for the still state.
        media = new Image();
        media.alt = '';
        still = document.createElement('canvas');
        media.addEventListener('load', () => {
          still.width = media.naturalWidth; still.height = media.naturalHeight;
          try { still.getContext('2d').drawImage(media, 0, 0); } catch (e) {}
          layer.classList.add('shown');
          play();
        }, { once: true });
        media.src = url;
        layer.append(media, still);
      }
    }

    function play() {
      if (!media) return;
      const fit = FITS[style().fit] || 'cover';
      layer.querySelectorAll('video, img, canvas').forEach(el => { el.style.objectFit = fit; });
      const moving = isAnimated() && !document.hidden && !paused();
      if (media.tagName === 'VIDEO') {
        if (moving) media.play().catch(() => {});
        else { media.pause(); if (!isAnimated()) media.currentTime = 0; }
      } else {
        media.hidden = !moving;
        still.hidden = moving;
      }
    }

    async function update() {
      if (style().wallpaperMode !== 'live') { clear(); return false; }
      await fetchInfo(false);
      if (!info) { clear(); return false; }
      build();
      play();
      return true;
    }

    window.addEventListener('storage', event => {
      if (event.key === 'liveWallpaper') play();
      if (event.key === 'desktopStyle') update();
    });
    document.addEventListener('visibilitychange', play);

    return {
      update,
      reload: () => fetchInfo(true).then(() => { mediaUrl = null; return update(); }),
      play,
      active: () => !!media
    };
  }

  window.mariowOSLiveWallpaper = Object.freeze({ mount, isAnimated });
})();
