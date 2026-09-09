import { faviconMark } from '@/lib/favicon';

function statusPageHtml(title: string, copy: string, extra = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: #2c2e33;
      color: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 32px;
    }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
    p { margin: 0; color: #a7abb3; font-size: 15px; line-height: 1.5; }
    .card { max-width: 460px; }
    .logo { margin: 0 auto 18px; width: 56px; height: 56px; }
    form { margin-top: 22px; display: flex; gap: 8px; justify-content: center; }
    input {
      width: 140px;
      border: 0;
      border-radius: 10px;
      background: #3c3e45;
      color: #f3f4f6;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.28em;
      text-align: center;
      padding: 12px 10px;
      outline: none;
    }
    button {
      border: 0;
      border-radius: 10px;
      background: #f08a24;
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      padding: 12px 16px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">${faviconMark(56)}</div>
    <h1 id="title">${title}</h1>
    <p id="copy">${copy}</p>
    ${extra}
  </div>
</body>
</html>`;
}

export function pinErrorPageHtml(providedPin = ''): string {
  const safePin = providedPin.replace(/\D/g, '').slice(0, 8);
  const missing = !safePin;
  const extra = `<form id="pin-form">
      <input id="pin-input" name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" value="${safePin}" />
      <button type="submit">Connect</button>
    </form>
    <script>
      var form = document.getElementById('pin-form');
      var input = document.getElementById('pin-input');
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = (input.value || '').replace(/\\s+/g, '');
        if (!value) {
          input.focus();
          return;
        }
        location.assign('/?pin=' + encodeURIComponent(value));
      });
      input.focus();
      input.select();
    </script>`;
  return statusPageHtml(
    missing ? 'PIN required' : 'Invalid PIN',
    missing
      ? 'Enter the PIN shown on the phone, or open the full link from Music Player.'
      : 'That PIN is wrong or has expired. Check the PIN on the phone and try again.',
    extra,
  );
}

export function waitingPageHtml(pin: string, requestId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Waiting for permission</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: #2c2e33;
      color: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 32px;
    }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
    p { margin: 0; color: #a7abb3; font-size: 15px; line-height: 1.5; }
    .card { max-width: 460px; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title">Please tap Accept on your phone</h1>
    <p id="copy">If the permission window doesn't appear immediately, keep the Music Player app open and wait a moment.</p>
  </div>
  <script>
    const pin = ${JSON.stringify(pin)};
    const requestId = ${JSON.stringify(requestId)};
    var stopped = false;
    var misses = 0;

    function setMessage(title, copy) {
      document.getElementById('title').textContent = title;
      document.getElementById('copy').textContent = copy;
    }

    async function poll() {
      if (stopped) return;
      try {
        var res = await fetch('/api/access?pin=' + encodeURIComponent(pin) + '&id=' + encodeURIComponent(requestId), { cache: 'no-store' });
        if (!res.ok) throw new Error('offline');
        var data = await res.json();
        misses = 0;
        if (data.status === 'accepted' && data.token) {
          var next = new URL(location.href);
          next.searchParams.set('pin', pin);
          next.searchParams.set('access', data.token);
          location.replace(next.toString());
          return;
        }
        if (data.status === 'declined') {
          stopped = true;
          setMessage('Connection declined', 'The phone declined this computer. You can close this page.');
          return;
        }
        if (data.status === 'disconnected') {
          location.replace('/?pin=' + encodeURIComponent(pin));
          return;
        }
      } catch (e) {
        misses += 1;
        if (misses >= 3) {
          stopped = true;
          setMessage('Sharing stopped', 'The phone stopped sharing. This page is no longer connected.');
          return;
        }
      }
      setTimeout(poll, 800);
    }
    poll();
  </script>
</body>
</html>`;
}

export function hostPageHtml(pin: string, access = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Music Player</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
  <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png?v=2" />
  <link rel="apple-touch-icon" href="/favicon.png?v=2" />
  <style>
    :root {
      --bg: #2c2e33;
      --bg-2: #24262b;
      --sidebar: #1d1f23;
      --bar: #32343a;
      --row: #35373d;
      --row-alt: #3c3e45;
      --line: #4a4d55;
      --text: #f3f4f6;
      --muted: #a7abb3;
      --orange: #f08a24;
      --green: #86c445;
      --btn: #ececec;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      overflow: hidden;
    }
    .app { display: flex; height: 100%; }
    .sidebar {
      width: 58px;
      background: var(--sidebar);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 0;
      gap: 8px;
      flex-shrink: 0;
      position: relative;
      z-index: 50;
      overflow: visible;
    }
    .nav {
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: #8d9198;
      display: grid;
      place-items: center;
      cursor: pointer;
      position: relative;
    }
    .nav.active { background: var(--green); color: #143206; }
    .nav-label {
      position: absolute;
      left: calc(100% + 9px);
      top: 0;
      height: 40px;
      padding: 0 16px;
      background: var(--sidebar);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
      white-space: nowrap;
      display: flex;
      align-items: center;
      pointer-events: none;
      opacity: 0;
      transform: translateX(-12px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .nav:hover .nav-label,
    .nav:focus-visible .nav-label,
    .app-logo:hover .nav-label,
    .app-logo:focus-visible .nav-label {
      opacity: 1;
      transform: translateX(0);
    }
    .app-logo {
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      display: grid;
      place-items: center;
      cursor: pointer;
      position: relative;
      margin-bottom: 8px;
      padding: 0;
      overflow: visible;
    }
    .app-logo svg {
      width: 40px;
      height: 40px;
      display: block;
      border-radius: 10px;
    }
    .modal-logo {
      width: 96px;
      height: 96px;
      margin: 8px auto 18px;
    }
    .modal-logo svg { width: 96px; height: 96px; display: block; }
    .gone {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 200;
      background: var(--bg);
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .gone.open { display: flex; }
    .gone-card { max-width: 420px; }
    .gone h2 { margin: 0 0 10px; font-size: 26px; }
    .gone p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.5; }
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 200;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-backdrop.open { display: flex; }
    .quit-box {
      background: #fff;
      color: #222;
      width: min(420px, 100%);
      border-radius: 6px;
      padding: 18px 20px 16px;
      position: relative;
      text-align: left;
      box-shadow: 0 24px 60px rgba(0,0,0,0.28);
    }
    .quit-box h2 { margin: 0 0 14px; font-size: 20px; font-weight: 700; }
    .quit-box p { margin: 0 0 28px; color: #555; font-size: 14px; }
    .quit-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .quit-cancel, .quit-confirm {
      border: 0;
      border-radius: 4px;
      padding: 8px 16px;
      font-size: 14px;
      cursor: pointer;
    }
    .quit-cancel { background: #e6e6e6; color: #333; }
    .quit-confirm { background: #e85d4c; color: #fff; font-weight: 600; }
    .modal {
      background: #fff;
      color: #222;
      width: min(420px, 100%);
      border-radius: 8px;
      padding: 36px 28px 32px;
      position: relative;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0,0,0,0.28);
    }
    .modal-close {
      position: absolute;
      top: 8px;
      right: 12px;
      border: 0;
      background: none;
      font-size: 26px;
      line-height: 1;
      cursor: pointer;
      color: #999;
    }
    .modal h2 { margin: 0 0 10px; font-size: 22px; font-weight: 700; }
    .modal p { margin: 0; color: #8a8a8a; font-size: 13px; line-height: 1.5; }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--bg); }
    body[data-view="home"] .music-bar,
    body[data-view="home"] .music-content,
    body[data-view="home"] .player { display: none; }
    body[data-view="music"] .home-bar,
    body[data-view="music"] .home-content,
    body[data-view="photos"] .home-bar,
    body[data-view="photos"] .home-content,
    body[data-view="videos"] .home-bar,
    body[data-view="videos"] .home-content,
    body[data-view="documents"] .home-bar,
    body[data-view="documents"] .home-content { display: none; }
    body[data-view="photos"] .music-bar,
    body[data-view="photos"] .music-content,
    body[data-view="photos"] .player,
    body[data-view="videos"] .music-bar,
    body[data-view="videos"] .music-content,
    body[data-view="videos"] .player,
    body[data-view="documents"] .music-bar,
    body[data-view="documents"] .music-content,
    body[data-view="documents"] .player { display: none; }
    body:not([data-view="home"]) .home-content { display: none; }
    .home-content {
      flex: 1;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 72px;
      padding: 32px 48px 64px;
      overflow: auto;
    }
    .phone {
      width: 230px;
      height: 460px;
      background: #111;
      border-radius: 38px;
      padding: 14px;
      box-shadow: 0 24px 50px rgba(0,0,0,0.18);
      flex-shrink: 0;
    }
    .phone-screen {
      height: 100%;
      border-radius: 28px;
      background: #3b82f6;
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      text-align: center;
      cursor: pointer;
      border: 2px dashed transparent;
    }
    .phone-screen.drag {
      background: #2563eb;
      border-color: #fff;
    }
    .phone-file {
      width: 54px;
      height: 66px;
      background: #fff;
      border-radius: 6px;
      position: relative;
      box-shadow: 4px 6px 0 rgba(0,0,0,0.12);
    }
    .phone-file:after {
      content: '';
      position: absolute;
      right: -2px;
      top: -2px;
      border: 10px solid transparent;
      border-top-color: #93c5fd;
      border-right-color: #93c5fd;
    }
    .phone-cursor {
      width: 18px;
      height: 18px;
      border-left: 10px solid #fff;
      border-top: 6px solid transparent;
      border-bottom: 12px solid transparent;
      transform: rotate(-20deg);
      margin-top: -8px;
      margin-left: 28px;
    }
    .phone-copy { font-size: 14px; font-weight: 600; max-width: 140px; line-height: 1.35; }
    .home-info { min-width: 340px; }
    .home-info h1 { margin: 0; font-size: 34px; font-weight: 700; }
    .home-os { margin: 6px 0 28px; color: var(--muted); font-size: 16px; }
    .cats {
      display: grid;
      grid-template-columns: 88px 88px;
      gap: 22px 36px;
    }
    .cat {
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
      text-align: center;
      color: inherit;
    }
    .cat-icon {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      margin: 0 auto 8px;
      display: grid;
      place-items: center;
      color: #fff;
    }
    .cat-photos { background: #e74c4c; }
    .cat-videos { background: #3498db; }
    .cat-music { background: #f1c40f; color: #333; }
    .cat-documents { background: #27ae60; }
    .cat-count { font-size: 20px; font-weight: 600; }
    .storage {
      margin-top: 36px;
      height: 38px;
      width: 420px;
      max-width: 100%;
      background: #4a4038;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
    }
    .storage-fill {
      height: 100%;
      width: 0;
      background: var(--orange);
      transition: width 0.4s ease;
    }
    .storage-label {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.25);
    }
    .placeholder {
      flex: 1;
      display: none;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      background: var(--bg);
      font-size: 16px;
    }
    body[data-view="documents"] #view-documents { display: flex; }
    .photos-bar { display: none !important; }
    .photos-content { display: none; flex: 1; min-height: 0; background: var(--bg-2); color: var(--text); }
    body[data-view="photos"] .photos-bar,
    body[data-view="videos"] .photos-bar { display: flex !important; }
    body[data-view="photos"] .photos-content,
    body[data-view="videos"] .photos-content { display: flex; }
    .photos-content.camera-mode .album-list { display: none; }
    .seg {
      display: flex;
      background: #3d4048;
      border-radius: 8px;
      overflow: hidden;
    }
    .seg button {
      border: 0;
      background: transparent;
      color: #b0b4ba;
      padding: 7px 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .seg button.on { background: #25272c; color: #fff; }
    .album-list {
      width: 230px;
      border-right: 1px solid var(--line);
      overflow: auto;
      flex-shrink: 0;
      background: var(--bg);
    }
    .album-item {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      cursor: pointer;
      border: 0;
      width: 100%;
      background: transparent;
      text-align: left;
      color: inherit;
    }
    .album-item:hover { background: var(--row); }
    .album-item.on { background: var(--row-alt); }
    .album-cover {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: 4px;
      background: var(--row);
      flex-shrink: 0;
    }
    .album-meta { min-width: 0; }
    .album-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .album-count { font-size: 12px; color: var(--muted); }
    .photo-grid-wrap { flex: 1; min-width: 0; overflow: auto; }
    .date-row {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bar);
      padding: 8px 14px;
      font-size: 13px;
      color: var(--muted);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .thumbs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
      gap: 8px;
      padding: 10px 14px;
    }
    .thumb {
      position: relative;
      aspect-ratio: 1;
      background: var(--row);
      cursor: pointer;
      overflow: hidden;
    }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb input { position: absolute; top: 6px; left: 6px; z-index: 1; }
    .thumb-play {
      position: absolute;
      right: 6px;
      bottom: 6px;
      background: rgba(0,0,0,0.55);
      color: #fff;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .photos-empty { padding: 48px 20px; color: var(--muted); text-align: center; }
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.82);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .lightbox.open { display: flex; }
    .lightbox img, .lightbox video { max-width: 92vw; max-height: 88vh; }
    .lightbox video { display: none; background: #000; }
    .lightbox.video-mode img { display: none; }
    .lightbox.video-mode video { display: block; }
    .lightbox-close {
      position: absolute;
      top: 12px;
      right: 16px;
      border: 0;
      background: none;
      color: #fff;
      font-size: 32px;
      cursor: pointer;
    }
    .toolbar {
      height: 58px;
      background: var(--bar);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      border-bottom: 1px solid #1b1d21;
      flex-shrink: 0;
    }
    .upload {
      background: var(--orange);
      color: #fff;
      border: 0;
      border-radius: 8px;
      padding: 9px 16px;
      font-size: 14px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .upload:disabled { opacity: 0.55; cursor: not-allowed; }
    .icon-btn {
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #c5c8ce;
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .icon-btn:not(:disabled):hover { background: #3d4048; }
    .spacer { flex: 1; }
    .pill {
      background: #3d4048;
      color: var(--muted);
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 12px;
    }
    .content { flex: 1; overflow: auto; background: var(--bg-2); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 11px 12px; text-align: left; white-space: nowrap; }
    th {
      position: sticky;
      top: 0;
      background: #2f3238;
      color: var(--muted);
      font-weight: 600;
      border-bottom: 1px solid var(--line);
      z-index: 1;
    }
    td { border-bottom: 1px solid #2a2c31; }
    tbody tr { background: var(--row); cursor: pointer; }
    tbody tr:nth-child(even) { background: var(--row-alt); }
    tbody tr:hover { background: #454851; }
    tbody tr.playing td.name { color: var(--green); font-weight: 700; }
    .check { width: 42px; }
    .name { max-width: 42vw; overflow: hidden; text-overflow: ellipsis; }
    .empty { padding: 48px 20px; color: var(--muted); text-align: center; }
    .player {
      height: 76px;
      background: var(--bar);
      border-top: 1px solid #1b1d21;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px;
      flex-shrink: 0;
    }
    .now {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 220px;
      max-width: 34%;
    }
    .now-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--green);
      color: #143206;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .now-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .now-artist { font-size: 12px; color: var(--muted); }
    .controls { display: flex; align-items: center; gap: 10px; }
    .round {
      width: 38px;
      height: 38px;
      border: 0;
      border-radius: 999px;
      background: var(--btn);
      color: #222;
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .round.play { width: 46px; height: 46px; }
    .tools { margin-left: auto; display: flex; align-items: center; gap: 12px; color: var(--muted); }
    .vol { width: 90px; accent-color: var(--green); }
    .time { font-variant-numeric: tabular-nums; font-size: 13px; min-width: 92px; text-align: right; }
    .toast {
      display: none;
      position: fixed;
      top: 68px;
      left: 74px;
      right: 16px;
      z-index: 30;
      background: #3d4048;
      border-radius: 10px;
      padding: 10px 12px;
      color: #fff;
    }
    .toast.visible { display: block; }
    .bar { height: 8px; background: #23252a; border-radius: 999px; overflow: hidden; margin-top: 8px; }
    .bar-fill { height: 100%; width: 0; background: var(--orange); }
    .toast-label { font-size: 13px; color: #ddd; }
    input[type=file] { display: none; }
    svg { display: block; }
  </style>
</head>
<body data-view="home">
  <div class="app">
    <aside class="sidebar">
      <button class="app-logo" id="about-btn" type="button">${faviconMark(40)}<span class="nav-label">About</span></button>
      <button class="nav active" data-view="home">${iconHome()}<span class="nav-label">Home</span></button>
      <button class="nav" data-view="photos">${iconImage()}<span class="nav-label">Photos</span></button>
      <button class="nav" data-view="videos">${iconVideo()}<span class="nav-label">Videos</span></button>
      <button class="nav" data-view="music">${iconMusic()}<span class="nav-label">Music</span></button>
      <button class="nav" data-view="documents">${iconDoc()}<span class="nav-label">Documents</span></button>
    </aside>
    <section class="main">
      <header class="toolbar home-bar">
        <span class="spacer"></span>
        <button class="icon-btn" id="copy-link" title="Copy link">${iconLink()}</button>
        <button class="icon-btn power-btn" title="Quit">${iconPower()}</button>
      </header>
      <header class="toolbar music-bar">
        <button class="upload" id="upload">${iconUpload()} Upload Music</button>
        <button class="icon-btn" id="download" title="Download selected" disabled>${iconDownload()}</button>
        <button class="icon-btn" id="refresh" title="Refresh">${iconRefresh()}</button>
        <button class="icon-btn" id="remove" title="Delete selected" disabled>${iconTrash()}</button>
        <span class="spacer"></span>
        <span class="pill">Music</span>
        <span class="spacer"></span>
        <button class="icon-btn" title="Files">${iconGrid()}</button>
        <button class="icon-btn power-btn" title="Quit">${iconPower()}</button>
        <input id="file" type="file" accept="audio/mpeg,.mp3" multiple />
      </header>
      <header class="toolbar photos-bar">
        <button class="icon-btn" id="photo-download" title="Download selected" disabled>${iconDownload()}</button>
        <button class="icon-btn" id="photo-refresh" title="Refresh">${iconRefresh()}</button>
        <button class="icon-btn" id="photo-remove" title="Delete selected" disabled>${iconTrash()}</button>
        <span class="spacer"></span>
        <div class="seg">
          <button type="button" id="photos-tab-camera">Camera</button>
          <button type="button" id="photos-tab-gallery" class="on">Gallery</button>
        </div>
        <span class="spacer"></span>
        <button class="icon-btn power-btn" title="Quit">${iconPower()}</button>
      </header>
      <div class="toast" id="progress-wrap">
        <div class="toast-label" id="progress-label">Uploading…</div>
        <div class="bar"><div class="bar-fill" id="progress-fill"></div></div>
      </div>
      <div class="home-content">
        <div class="phone" id="dropzone">
          <div class="phone-screen" id="phone-screen">
            <div class="phone-file"></div>
            <div class="phone-cursor"></div>
            <div class="phone-copy">Drag &amp; drop to transfer</div>
          </div>
        </div>
        <div class="home-info">
          <h1 id="device-name">iPhone</h1>
          <div class="home-os" id="device-os">iOS</div>
          <div class="cats">
            <button class="cat" data-view="photos"><div class="cat-icon cat-photos">${iconImage()}</div><div class="cat-count" id="count-photos">0</div></button>
            <button class="cat" data-view="videos"><div class="cat-icon cat-videos">${iconVideo()}</div><div class="cat-count" id="count-videos">0</div></button>
            <button class="cat" data-view="music"><div class="cat-icon cat-music">${iconMusic()}</div><div class="cat-count" id="count-music">0</div></button>
            <button class="cat" data-view="documents"><div class="cat-icon cat-documents">${iconDoc()}</div><div class="cat-count" id="count-documents">0</div></button>
          </div>
          <div class="storage">
            <div class="storage-fill" id="storage-fill"></div>
            <div class="storage-label" id="storage-label">Internal Storage: —</div>
          </div>
        </div>
      </div>
      <div class="photos-content" id="photos-content">
        <div class="album-list" id="album-list"></div>
        <div class="photo-grid-wrap" id="photo-grid">
          <div class="photos-empty">Loading photos…</div>
        </div>
      </div>
      <div class="placeholder" id="view-documents">No documents on this phone yet.</div>
      <div class="content music-content">
        <table>
          <thead>
            <tr>
              <th class="check"><input id="select-all" type="checkbox" /></th>
              <th>Music Name</th>
              <th>Artist</th>
              <th>Duration</th>
              <th>Format</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody id="tracks"></tbody>
        </table>
        <div class="empty" id="empty" hidden>No MP3s in the library yet.</div>
      </div>
      <footer class="player">
        <div class="now">
          <div class="now-icon">${iconMusic()}</div>
          <div>
            <div class="now-title" id="now-title">Nothing playing</div>
            <div class="now-artist" id="now-artist">Unknown</div>
          </div>
        </div>
        <div class="controls">
          <button class="round" id="prev" title="Previous">${iconPrev()}</button>
          <button class="round play" id="play" title="Play">${iconPlay()}</button>
          <button class="round" id="next" title="Next">${iconNext()}</button>
        </div>
        <div class="tools">
          <span>${iconVolume()}</span>
          <input class="vol" id="volume" type="range" min="0" max="1" step="0.01" value="1" />
          <button class="icon-btn" id="loop" title="Repeat">${iconRepeat()}</button>
          <div class="time" id="time">00:00 / 00:00</div>
        </div>
      </footer>
    </section>
  </div>
  <div class="gone" id="gone">
    <div class="gone-card">
      <h2>Sharing stopped</h2>
      <p>The phone stopped sharing. This page is no longer connected.</p>
    </div>
  </div>
  <div class="lightbox" id="lightbox">
    <button class="lightbox-close" id="lightbox-close" type="button" aria-label="Close">&times;</button>
    <img id="lightbox-img" alt="" />
    <video id="lightbox-video" controls playsinline preload="metadata"></video>
  </div>
  <div class="modal-backdrop" id="quit-modal">
    <div class="quit-box" role="dialog" aria-labelledby="quit-title">
      <button class="modal-close" id="quit-close" type="button" aria-label="Close">&times;</button>
      <h2 id="quit-title">Quit</h2>
      <p>Do you really want to quit and close this page?</p>
      <div class="quit-actions">
        <button type="button" class="quit-cancel" id="quit-cancel">Cancel</button>
        <button type="button" class="quit-confirm" id="quit-confirm">Confirm</button>
      </div>
    </div>
  </div>
  <div class="modal-backdrop" id="about-modal">
    <div class="modal" role="dialog" aria-labelledby="about-title">
      <button class="modal-close" id="about-close" type="button" aria-label="Close">&times;</button>
      <div class="modal-logo">${faviconMark(96)}</div>
      <h2 id="about-title">Music Player</h2>
      <p>Version 1.0.0<br/>LAN transfer for this phone<br/>Copyright &copy; 2026</p>
    </div>
  </div>
  <script>
    const pin = ${JSON.stringify(pin)};
    const access = ${JSON.stringify(access)};
    const headers = { 'X-Pin': pin, 'X-Access': access };
    function authQ() {
      return 'pin=' + encodeURIComponent(pin) + '&access=' + encodeURIComponent(access);
    }
    const uploadButton = document.getElementById('upload');
    const fileInput = document.getElementById('file');
    const progressWrap = document.getElementById('progress-wrap');
    const progressLabel = document.getElementById('progress-label');
    const progressFill = document.getElementById('progress-fill');
    const downloadBtn = document.getElementById('download');
    const removeBtn = document.getElementById('remove');
    const playBtn = document.getElementById('play');
    const loopBtn = document.getElementById('loop');
    const audio = new Audio();
    audio.preload = 'metadata';
    let tracks = [];
    let currentIndex = -1;
    let looping = false;
    var galleryKind = 'photos';
    var galleries = {
      photos: { albums: [], assets: [], albumId: 'recents', lastAlbumId: 'recents', mode: 'gallery', loaded: false },
      videos: { albums: [], assets: [], albumId: 'recents', lastAlbumId: 'recents', mode: 'gallery', loaded: false }
    };
    var photosContent = document.getElementById('photos-content');
    var albumListEl = document.getElementById('album-list');
    var photoGridEl = document.getElementById('photo-grid');
    var photoDownloadBtn = document.getElementById('photo-download');
    var photoRemoveBtn = document.getElementById('photo-remove');
    var lightbox = document.getElementById('lightbox');
    var lightboxImg = document.getElementById('lightbox-img');
    var lightboxVideo = document.getElementById('lightbox-video');
    var kicked = false;
    var heartbeatMisses = 0;
    var heartbeatTimer = null;

    function kickOut(title, copy) {
      if (kicked) return;
      kicked = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      closeLightbox();
      try {
        audio.pause();
        audio.removeAttribute('src');
      } catch (e) {}
      if (title) document.querySelector('#gone h2').textContent = title;
      if (copy) document.querySelector('#gone p').textContent = copy;
      document.getElementById('gone').classList.add('open');
    }

    async function heartbeat() {
      if (kicked) return;
      try {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 2500);
        var res = await fetch('/api/ping?' + authQ(), {
          headers: headers,
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.status === 401) {
          kickOut();
          return;
        }
        heartbeatMisses = res.ok ? 0 : heartbeatMisses + 1;
      } catch (e) {
        heartbeatMisses += 1;
      }
      if (heartbeatMisses >= 2) kickOut();
    }

    function gallery() {
      return galleries[galleryKind];
    }

    function mediaNoun(plural) {
      if (galleryKind === 'videos') return plural ? 'videos' : 'video';
      return plural ? 'photos' : 'photo';
    }

    function mediaThumbUrl(id) {
      return '/' + galleryKind + '/thumb?' + authQ() + '&id=' + encodeURIComponent(id);
    }

    function mediaFileUrl(id, download) {
      return '/' + galleryKind + '/file?' + authQ() + '&id=' + encodeURIComponent(id) + (download ? '&download=1' : '');
    }

    function showView(view) {
      document.body.setAttribute('data-view', view);
      document.querySelectorAll('.nav').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-view') === view);
      });
      if (view === 'photos' || view === 'videos') {
        if (galleryKind !== view) closeLightbox();
        galleryKind = view;
        applyGalleryModeUi();
        loadGallery(false);
        return;
      }
      closeLightbox();
    }

    function photoDateKey(ms) {
      var d = new Date(ms);
      if (!isFinite(d.getTime()) || d.getTime() <= 0) return 'Unknown';
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function selectedPhotoIds() {
      return Array.from(document.querySelectorAll('.thumb-check:checked')).map(function (el) {
        return el.value;
      });
    }

    function updatePhotoActions() {
      var n = selectedPhotoIds().length;
      photoDownloadBtn.disabled = n === 0;
      photoRemoveBtn.disabled = n === 0;
    }

    function closeLightbox() {
      lightbox.classList.remove('open', 'video-mode');
      lightboxImg.removeAttribute('src');
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxVideo.load();
    }

    function openLightbox(id) {
      if (galleryKind === 'videos') {
        lightbox.classList.add('video-mode');
        lightboxImg.removeAttribute('src');
        lightboxVideo.preload = 'metadata';
        lightboxVideo.src = mediaFileUrl(id, false);
        lightbox.classList.add('open');
        var playResult = lightboxVideo.play();
        if (playResult && playResult.catch) playResult.catch(function () {});
        return;
      }
      lightbox.classList.remove('video-mode');
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxImg.src = mediaFileUrl(id, false);
      lightbox.classList.add('open');
    }

    function applyGalleryModeUi() {
      var mode = gallery().mode;
      photosContent.classList.toggle('camera-mode', mode === 'camera');
      document.getElementById('photos-tab-camera').classList.toggle('on', mode === 'camera');
      document.getElementById('photos-tab-gallery').classList.toggle('on', mode === 'gallery');
    }

    function setPhotosMode(mode) {
      var state = gallery();
      if (state.mode === 'gallery') state.lastAlbumId = state.albumId;
      state.mode = mode;
      state.albumId = mode === 'camera' ? 'recents' : state.lastAlbumId;
      applyGalleryModeUi();
      renderAlbums();
      loadPhotoAssets();
    }

    function renderAlbums() {
      var state = gallery();
      if (!state.albums.length) {
        albumListEl.innerHTML = '<div class="photos-empty">No albums</div>';
        return;
      }
      albumListEl.innerHTML = state.albums.map(function (album) {
        var cover = album.coverId
          ? '<img class="album-cover" src="' + mediaThumbUrl(album.coverId) + '" alt="" />'
          : '<div class="album-cover"></div>';
        return '<button type="button" class="album-item' + (album.id === state.albumId ? ' on' : '') + '" data-id="' + escapeHtml(album.id) + '">' +
          cover +
          '<div class="album-meta"><div class="album-title">' + escapeHtml(album.title) + '</div>' +
          '<div class="album-count">' + escapeHtml(String(album.count)) + '</div></div></button>';
      }).join('');
    }

    function groupPhotosByDate(assets) {
      var groups = [];
      var map = {};
      assets.forEach(function (asset) {
        var key = photoDateKey(asset.createdAt);
        if (!map[key]) {
          map[key] = { key: key, assets: [] };
          groups.push(map[key]);
        }
        map[key].assets.push(asset);
      });
      return groups;
    }

    function renderPhotoGrid() {
      var state = gallery();
      if (!state.assets.length) {
        photoGridEl.innerHTML = '<div class="photos-empty">No ' + mediaNoun(true) + ' on this phone yet.</div>';
        updatePhotoActions();
        return;
      }
      var html = '';
      groupPhotosByDate(state.assets).forEach(function (group) {
        html += '<div class="date-row"><input type="checkbox" class="date-check" data-date="' + escapeHtml(group.key) + '" /><span>' + escapeHtml(group.key) + '</span></div>';
        html += '<div class="thumbs" data-date="' + escapeHtml(group.key) + '">';
        group.assets.forEach(function (asset) {
          html += '<div class="thumb" data-id="' + escapeHtml(asset.id) + '">';
          html += '<input type="checkbox" class="thumb-check" value="' + escapeHtml(asset.id) + '" />';
          html += '<img src="' + mediaThumbUrl(asset.id) + '" alt="" />';
          if (galleryKind === 'videos') {
            html += '<span class="thumb-play">' + formatTime(asset.duration) + '</span>';
          }
          html += '</div>';
        });
        html += '</div>';
      });
      photoGridEl.innerHTML = html;
      updatePhotoActions();
    }

    async function fetchAllPhotos(albumId) {
      var assets = [];
      var after = '';
      while (true) {
        var url = '/api/' + galleryKind + '?' + authQ() + '&albumId=' + encodeURIComponent(albumId);
        if (after) url += '&after=' + encodeURIComponent(after);
        var res = await fetch(url, { headers: headers });
        if (res.status === 403) {
          throw new Error('Allow Photos access on the phone, then refresh.');
        }
        if (!res.ok) throw new Error('Could not load ' + mediaNoun(true) + '.');
        var data = await res.json();
        assets = assets.concat(data.assets || []);
        if (!data.hasNextPage || !data.endCursor) break;
        after = data.endCursor;
        if (assets.length >= 2000) break;
      }
      return assets;
    }

    async function loadPhotoAssets() {
      photoGridEl.innerHTML = '<div class="photos-empty">Loading ' + mediaNoun(true) + '…</div>';
      updatePhotoActions();
      var state = gallery();
      try {
        state.assets = await fetchAllPhotos(state.albumId);
        renderPhotoGrid();
      } catch (error) {
        state.assets = [];
        photoGridEl.innerHTML = '<div class="photos-empty">' + escapeHtml(error.message || 'Could not load ' + mediaNoun(true) + '.') + '</div>';
        updatePhotoActions();
      }
    }

    async function loadGallery(force) {
      var state = gallery();
      if (state.loaded && !force) {
        applyGalleryModeUi();
        renderAlbums();
        renderPhotoGrid();
        return;
      }
      photoGridEl.innerHTML = '<div class="photos-empty">Loading ' + mediaNoun(true) + '…</div>';
      try {
        var res = await fetch('/api/' + galleryKind + '/albums?' + authQ(), { headers: headers });
        if (res.status === 403) {
          state.loaded = false;
          albumListEl.innerHTML = '';
          photoGridEl.innerHTML = '<div class="photos-empty">Allow Photos access on the phone, then refresh.</div>';
          updatePhotoActions();
          return;
        }
        if (!res.ok) throw new Error('Could not load albums.');
        var data = await res.json();
        state.albums = data.albums || [];
        state.loaded = true;
        if (state.mode === 'camera') {
          state.albumId = 'recents';
        } else if (!state.albums.some(function (album) { return album.id === state.albumId; })) {
          state.albumId = state.albums[0] ? state.albums[0].id : 'recents';
        }
        if (state.mode === 'gallery') state.lastAlbumId = state.albumId;
        applyGalleryModeUi();
        renderAlbums();
        await loadPhotoAssets();
        await loadDevice();
      } catch (error) {
        state.loaded = false;
        photoGridEl.innerHTML = '<div class="photos-empty">' + escapeHtml(error.message || 'Could not load ' + mediaNoun(true) + '.') + '</div>';
      }
    }

    function formatGb(bytes) {
      var gb = bytes / (1024 * 1024 * 1024);
      if (!isFinite(gb) || gb < 0) return '0.00GB';
      return (gb >= 100 ? gb.toFixed(1) : gb.toFixed(2)) + 'GB';
    }

    async function loadDevice() {
      var res = await fetch('/api/device?' + authQ(), { headers: headers });
      if (res.status === 401) { kickOut(); return; }
      var info = await res.json();
      document.getElementById('device-name').textContent = info.name || 'iPhone';
      document.getElementById('device-os').textContent = info.os || '';
      document.getElementById('count-photos').textContent = String(info.counts && info.counts.photos || 0);
      document.getElementById('count-videos').textContent = String(info.counts && info.counts.videos || 0);
      document.getElementById('count-music').textContent = String(info.counts && info.counts.music || 0);
      document.getElementById('count-documents').textContent = String(info.counts && info.counts.documents || 0);
      var used = Number(info.usedBytes) || 0;
      var total = Number(info.totalBytes) || 0;
      var pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
      document.getElementById('storage-fill').style.width = pct + '%';
      document.getElementById('storage-label').textContent =
        'Internal Storage: ' + formatGb(used) + ' / ' + formatGb(total);
    }

    function mp3FilesFromList(list) {
      return Array.from(list || []).filter(function (file) {
        return /audio\\/(mpeg|mp3)/.test(file.type) || /\\.mp3$/i.test(file.name);
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatSize(bytes) {
      if (!bytes) return '0.00MB';
      return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
    }

    function formatTime(seconds) {
      if (!seconds || !isFinite(seconds) || seconds < 0) return '00:00';
      var total = Math.floor(seconds);
      var m = Math.floor(total / 60);
      var s = total % 60;
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function fileUrl(filename, download) {
      var url = '/files/' + encodeURIComponent(filename) + '?' + authQ();
      return download ? url + '&download=1' : url;
    }

    function selectedNames() {
      return Array.from(document.querySelectorAll('.row-check:checked')).map(function (el) { return el.value; });
    }

    function updateSelection() {
      var names = selectedNames();
      downloadBtn.disabled = names.length === 0;
      removeBtn.disabled = names.length === 0;
      var all = document.querySelectorAll('.row-check');
      document.getElementById('select-all').checked = all.length > 0 && names.length === all.length;
    }

    function setProgress(visible, label, ratio) {
      progressWrap.classList.toggle('visible', visible);
      if (!visible) return;
      var pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
      progressLabel.textContent = label;
      progressFill.style.width = pct + '%';
    }

    function renderTracks() {
      var body = document.getElementById('tracks');
      var empty = document.getElementById('empty');
      if (!tracks.length) {
        body.innerHTML = '';
        empty.hidden = false;
        updateSelection();
        return;
      }
      empty.hidden = true;
      body.innerHTML = tracks.map(function (track, index) {
        var playing = index === currentIndex ? ' playing' : '';
        return '<tr class="track-row' + playing + '" data-index="' + index + '">' +
          '<td class="check"><input class="row-check" type="checkbox" value="' + escapeHtml(track.filename) + '" /></td>' +
          '<td class="name">' + escapeHtml(track.title || track.filename) + '</td>' +
          '<td>' + escapeHtml(track.artist || 'Unknown') + '</td>' +
          '<td>' + (track.duration ? formatTime(track.duration) : '') + '</td>' +
          '<td>' + escapeHtml(track.format || 'mp3') + '</td>' +
          '<td>' + formatSize(track.size) + '</td>' +
          '</tr>';
      }).join('');
      updateSelection();
    }

    function setNowPlaying() {
      var track = tracks[currentIndex];
      document.getElementById('now-title').textContent = track ? (track.title || track.filename) : 'Nothing playing';
      document.getElementById('now-artist').textContent = track ? (track.artist || 'Unknown') : 'Unknown';
      Array.from(document.querySelectorAll('.track-row')).forEach(function (row) {
        row.classList.toggle('playing', Number(row.getAttribute('data-index')) === currentIndex);
      });
    }

    function playIndex(index) {
      if (index < 0 || index >= tracks.length) return;
      currentIndex = index;
      audio.src = fileUrl(tracks[index].filename, false);
      audio.play();
      playBtn.innerHTML = ${JSON.stringify(iconPause())};
      setNowPlaying();
    }

    async function loadTracks() {
      var res = await fetch('/api/tracks?' + authQ(), { headers: headers });
      if (res.status === 401) { kickOut(); return; }
      var data = await res.json();
      tracks = data.tracks || [];
      if (currentIndex >= tracks.length) currentIndex = tracks.length ? 0 : -1;
      renderTracks();
      setNowPlaying();
      await loadDevice();
    }

    function uploadFile(file, onProgress) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        var url = '/upload?' + authQ() + '&filename=' + encodeURIComponent(file.name);
        xhr.open('POST', url);
        xhr.setRequestHeader('X-Pin', pin);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = function (event) {
          if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Upload failed (' + xhr.status + ')'));
        };
        xhr.onerror = function () { reject(new Error('Upload failed')); };
        xhr.send(file);
      });
    }

    async function startUpload(files) {
      if (!files.length) return;
      uploadButton.disabled = true;
      setProgress(true, 'Starting upload…', 0);
      var uploaded = 0;
      try {
        for (var i = 0; i < files.length; i++) {
          await uploadFile(files[i], function (fileRatio) {
            setProgress(true, 'Uploading ' + (i + 1) + ' of ' + files.length + ': ' + files[i].name, (i + fileRatio) / files.length);
          });
          uploaded += 1;
          setProgress(true, 'Uploaded ' + (i + 1) + ' of ' + files.length, (i + 1) / files.length);
        }
        setProgress(true, 'Upload complete', 1);
        var doneMessage = files.length === 1
          ? files[0].name + ' was uploaded to the phone.'
          : files.length + ' MP3s were uploaded to the phone.';
        alert('Upload complete. ' + doneMessage);
        fileInput.value = '';
        await loadTracks();
        await loadDevice();
      } catch (error) {
        alert(error.message || 'Upload failed');
      } finally {
        try {
          await fetch('/api/upload-batch-complete?' + authQ() + '&fail=' + (files.length - uploaded), {
            method: 'POST',
            headers: headers
          });
        } catch (e) {}
        uploadButton.disabled = false;
        setTimeout(function () { setProgress(false, '', 0); }, 1200);
      }
    }

    uploadButton.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      startUpload(Array.from(fileInput.files || []));
    });
    document.getElementById('refresh').addEventListener('click', function () { loadTracks(); });
    document.getElementById('photo-refresh').addEventListener('click', function () { loadGallery(true); });
    document.getElementById('photos-tab-camera').addEventListener('click', function () { setPhotosMode('camera'); });
    document.getElementById('photos-tab-gallery').addEventListener('click', function () { setPhotosMode('gallery'); });
    albumListEl.addEventListener('click', function (event) {
      var item = event.target.closest('.album-item');
      if (!item) return;
      var state = gallery();
      state.albumId = item.getAttribute('data-id');
      state.lastAlbumId = state.albumId;
      renderAlbums();
      loadPhotoAssets();
    });
    photoGridEl.addEventListener('change', function (event) {
      var target = event.target;
      if (target.classList.contains('date-check')) {
        var date = target.getAttribute('data-date');
        photoGridEl.querySelectorAll('.thumbs[data-date="' + date + '"] .thumb-check').forEach(function (el) {
          el.checked = target.checked;
        });
      }
      if (target.classList.contains('thumb-check')) {
        var thumbs = target.closest('.thumbs');
        var dateCheck = photoGridEl.querySelector('.date-check[data-date="' + thumbs.getAttribute('data-date') + '"]');
        var boxes = thumbs.querySelectorAll('.thumb-check');
        dateCheck.checked = boxes.length > 0 && Array.from(boxes).every(function (el) { return el.checked; });
      }
      updatePhotoActions();
    });
    photoGridEl.addEventListener('click', function (event) {
      if (event.target.closest('input')) return;
      var thumb = event.target.closest('.thumb');
      if (!thumb) return;
      openLightbox(thumb.getAttribute('data-id'));
    });
    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) closeLightbox();
    });
    photoDownloadBtn.addEventListener('click', function () {
      selectedPhotoIds().forEach(function (id, i) {
        setTimeout(function () {
          var link = document.createElement('a');
          link.href = mediaFileUrl(id, true);
          link.download = galleryKind === 'videos' ? 'video.mp4' : 'photo.jpg';
          document.body.appendChild(link);
          link.click();
          link.remove();
        }, i * 350);
      });
    });
    photoRemoveBtn.addEventListener('click', async function () {
      var ids = selectedPhotoIds();
      if (!ids.length) return;
      var noun = mediaNoun(ids.length !== 1);
      if (!confirm('Delete ' + ids.length + ' selected ' + noun + ' from the phone gallery? Confirm the deletion on the phone if iOS asks.')) return;
      var res = await fetch('/api/' + galleryKind + '/delete?' + authQ(), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({ ids: ids })
      });
      if (!res.ok) {
        alert(res.status === 403
          ? 'Allow Photos access on the phone, then try again.'
          : 'Could not delete ' + noun + '. Keep the app open and confirm on the phone.');
        return;
      }
      var data = {};
      try { data = await res.json(); } catch (e) {}
      if (!data.ok) {
        alert('Deletion was cancelled on the phone.');
      }
      closeLightbox();
      await loadGallery(true);
    });
    var quitModal = document.getElementById('quit-modal');
    function closeQuit() { quitModal.classList.remove('open'); }
    document.querySelectorAll('.power-btn').forEach(function (el) {
      el.addEventListener('click', function () {
        quitModal.classList.add('open');
      });
    });
    document.getElementById('quit-close').addEventListener('click', closeQuit);
    document.getElementById('quit-cancel').addEventListener('click', closeQuit);
    quitModal.addEventListener('click', function (event) {
      if (event.target === quitModal) closeQuit();
    });
    document.getElementById('quit-confirm').addEventListener('click', async function () {
      try {
        await fetch('/api/disconnect?' + authQ(), { method: 'POST', headers: headers });
      } catch (e) {}
      closeQuit();
      kickOut('Disconnected', 'Reload this page to connect again.');
      try { window.close(); } catch (e) {}
    });
    document.getElementById('copy-link').addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(location.href);
        alert('Link copied');
      } catch (e) {
        alert(location.href);
      }
    });
    document.querySelectorAll('.nav, .cat').forEach(function (el) {
      el.addEventListener('click', function () {
        showView(el.getAttribute('data-view'));
      });
    });
    var aboutModal = document.getElementById('about-modal');
    function closeAbout() { aboutModal.classList.remove('open'); }
    document.getElementById('about-btn').addEventListener('click', function () {
      aboutModal.classList.add('open');
    });
    document.getElementById('about-close').addEventListener('click', closeAbout);
    aboutModal.addEventListener('click', function (event) {
      if (event.target === aboutModal) closeAbout();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeLightbox();
        closeQuit();
        closeAbout();
      }
    });
    var phoneScreen = document.getElementById('phone-screen');
    phoneScreen.addEventListener('click', function () { fileInput.click(); });
    ['dragenter', 'dragover'].forEach(function (name) {
      phoneScreen.addEventListener(name, function (event) {
        event.preventDefault();
        phoneScreen.classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      phoneScreen.addEventListener(name, function (event) {
        event.preventDefault();
        phoneScreen.classList.remove('drag');
      });
    });
    phoneScreen.addEventListener('drop', function (event) {
      var files = mp3FilesFromList(event.dataTransfer && event.dataTransfer.files);
      if (!files.length) {
        alert('Drop MP3 files to upload them to the phone.');
        return;
      }
      startUpload(files);
    });
    document.getElementById('select-all').addEventListener('change', function (event) {
      var checked = event.target.checked;
      document.querySelectorAll('.row-check').forEach(function (el) { el.checked = checked; });
      updateSelection();
    });
    document.getElementById('tracks').addEventListener('change', function (event) {
      if (event.target.classList.contains('row-check')) updateSelection();
    });
    document.getElementById('tracks').addEventListener('click', function (event) {
      if (event.target.classList.contains('row-check')) return;
      var row = event.target.closest('.track-row');
      if (!row) return;
      playIndex(Number(row.getAttribute('data-index')));
    });
    downloadBtn.addEventListener('click', function () {
      selectedNames().forEach(function (name) {
        var link = document.createElement('a');
        link.href = fileUrl(name, true);
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    });
    removeBtn.addEventListener('click', async function () {
      var names = selectedNames();
      if (!names.length) return;
      if (!confirm('Delete ' + names.length + ' selected ' + (names.length === 1 ? 'track' : 'tracks') + ' from the phone?')) return;
      await fetch('/api/delete?' + authQ(), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({ filenames: names })
      });
      if (currentIndex >= 0 && names.indexOf(tracks[currentIndex].filename) !== -1) {
        audio.pause();
        audio.removeAttribute('src');
        currentIndex = -1;
        playBtn.innerHTML = ${JSON.stringify(iconPlay())};
      }
      await loadTracks();
    });
    playBtn.addEventListener('click', function () {
      if (currentIndex < 0 && tracks.length) {
        playIndex(0);
        return;
      }
      if (audio.paused) {
        audio.play();
        playBtn.innerHTML = ${JSON.stringify(iconPause())};
      } else {
        audio.pause();
        playBtn.innerHTML = ${JSON.stringify(iconPlay())};
      }
    });
    document.getElementById('prev').addEventListener('click', function () {
      if (!tracks.length) return;
      playIndex((currentIndex - 1 + tracks.length) % tracks.length);
    });
    document.getElementById('next').addEventListener('click', function () {
      if (!tracks.length) return;
      playIndex((currentIndex + 1) % tracks.length);
    });
    loopBtn.addEventListener('click', function () {
      looping = !looping;
      audio.loop = looping;
      loopBtn.style.color = looping ? '#86c445' : '';
    });
    document.getElementById('volume').addEventListener('input', function (event) {
      audio.volume = Number(event.target.value);
    });
    audio.addEventListener('timeupdate', function () {
      document.getElementById('time').textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
    });
    audio.addEventListener('ended', function () {
      if (looping || !tracks.length) return;
      playIndex((currentIndex + 1) % tracks.length);
    });
    loadTracks();
    loadDevice();
    heartbeatTimer = setInterval(heartbeat, 1000);
    heartbeat();
  </script>
</body>
</html>`;
}

function iconHome(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>`;
}
function iconLink(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93"/><path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.41a5 5 0 0 0 7.07 7.07L14 18.07"/></svg>`;
}
function iconImage(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-9 9"/></svg>`;
}
function iconVideo(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>`;
}
function iconMusic(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V6l12-2v12"/><circle cx="7" cy="18" r="3"/><circle cx="19" cy="16" r="3"/></svg>`;
}
function iconDoc(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6"/></svg>`;
}
function iconUpload(): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 19V6"/><path d="m7 10 5-5 5 5"/></svg>`;
}
function iconDownload(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v8"/><path d="m8.5 12.5 3.5 3.5 3.5-3.5"/></svg>`;
}
function iconRefresh(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 5v5h-5"/></svg>`;
}
function iconTrash(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/></svg>`;
}
function iconGrid(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;
}
function iconPower(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v8"/><path d="M7 6.5a7 7 0 1 0 10 0"/></svg>`;
}
function iconPrev(): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM18 5v14L9 12z"/></svg>`;
}
function iconNext(): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM6 5v14l9-7z"/></svg>`;
}
function iconPlay(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l12-7z"/></svg>`;
}
function iconPause(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
}
function iconVolume(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9.5a4 4 0 0 1 0 5"/></svg>`;
}
function iconRepeat(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3h4v4"/><path d="M21 7 8 20"/><path d="M7 21H3v-4"/><path d="M3 17 16 4"/></svg>`;
}
