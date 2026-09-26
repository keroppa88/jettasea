// Sound: B toggles the wave ambience (無音 / 波サウンド).
// M opens the music Control Panel, ported from car2026 (js/main.js, "music" section):
// musiclist.txt entries, ↑↓ select, Enter / double-click play, M / Esc / × close,
// J/K/L seek -10s / play-pause / +10s, I/O previous / next track.
// YouTube plays through the IFrame API, net radio through HTMLAudio (HLS via hls.js).
// Per-track sky colours in musiclist.txt are ignored for now; only 音量±N% and 開始N秒 apply.

const WAVE_VIDEO_ID = 'gWIgKRqzk3E';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createAudio() {
  let ambientVolume = 0.8;
  let musicVolume = 0.8;
  let musicTrackVolumeScale = 1;

  let musicMode = false;
  let musicItems = [];
  let musicSel = 0;
  let musicMenuEl = null;
  let musicListEl = null;
  let musicAudio = null;
  let musicHls = null;

  // ------------------------------------------------------------ YouTube ---
  let ytApiRequested = false;
  const ytReadyCallbacks = [];
  function whenYouTubeApi(callback) {
    if (window.YT && window.YT.Player) { callback(); return; }
    ytReadyCallbacks.push(callback);
    if (ytApiRequested) return;
    ytApiRequested = true;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      ytApiRequested = false;
      musicToast('⚠ YouTubeプレイヤーを読み込めません');
    };
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => ytReadyCallbacks.splice(0).forEach(fn => fn());
  }
  // Audio only: keep the player full size but off screen. A 1px or transparent
  // embed is treated as hidden and music videos tend to refuse playback (error 150).
  function offscreenHolder(id, offset) {
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;top:-400px;left:${-400 - offset}px;`
      + 'width:400px;height:300px;pointer-events:none;';
    const inner = document.createElement('div');
    inner.id = id;
    holder.appendChild(inner);
    document.body.appendChild(holder);
    return id;
  }
  function makePlayer(id, offset, events) {
    return new window.YT.Player(offscreenHolder(id, offset), {
      width: 400, height: 300,
      playerVars: { autoplay: 0, controls: 0, fs: 0, playsinline: 1, origin: location.origin },
      events,
    });
  }

  // ---------------------------------------------------------- wave sound ---
  let waveOn = false;
  let wavePlayer = null;
  let wavePlayerReady = false;
  whenYouTubeApi(() => {
    wavePlayer = makePlayer('wave-player', 0, {
      onReady: (ev) => {
        wavePlayerReady = true;
        ev.target.cueVideoById(WAVE_VIDEO_ID);
        ev.target.setVolume(Math.round(ambientVolume * 100));
        if (waveOn) ev.target.playVideo();
      },
      // Loop the recording.
      onStateChange: (ev) => {
        if (ev.data === 0 && waveOn) { ev.target.seekTo(0, true); ev.target.playVideo(); }
      },
    });
  });
  function toggleWave() {
    waveOn = !waveOn;
    if (wavePlayerReady) {
      if (waveOn) { wavePlayer.setVolume(Math.round(ambientVolume * 100)); wavePlayer.playVideo(); }
      else wavePlayer.pauseVideo();
    }
    musicToast(waveOn ? '♪ 波サウンド' : '無音');
  }

  // ------------------------------------------------------------- music ----
  function parseMusicEffects(tail) {
    const effects = {};
    for (const token of String(tail).trim().split(/[\s　]+/)) {
      let matched;
      if ((matched = token.match(/^音量([+\-]?\d+)[%％]$/))) effects.volumePercent = Number(matched[1]);
      else if ((matched = token.match(/^開始(\d+)秒$/))) effects.startSeconds = Number(matched[1]);
    }
    return Object.keys(effects).length ? effects : null;
  }

  async function loadMusicList() {
    try {
      const res = await fetch('musiclist.txt', { cache: 'no-store' });
      if (!res.ok) return;
      for (const raw of (await res.text()).split(/\r?\n/)) {
        const label = raw.match(/「(.+?)」/);
        if (!label) {
          // Lines without a URL or 「」 (------ラジオ------ etc.) are shown as headers.
          const trimmed = raw.trim();
          if (trimmed && !/https?:\/\//.test(trimmed)) {
            musicItems.push({ label: trimmed, url: null, type: 'header' });
          }
          continue;
        }
        const url = (raw.match(/https?:\/\/[^\s「」]+/) || [null])[0];
        const type = url ? (/youtube\.com|youtu\.be/.test(url) ? 'yt' : 'radio') : 'playlist';
        const effects = parseMusicEffects(raw.slice(label.index + label[0].length));
        musicItems.push({ label: label[1], url, type, effects });
      }
    } catch (_) { /* Sailing works without the music list. */ }
  }

  function musicOutputVolume() {
    return clamp(musicVolume * musicTrackVolumeScale, 0, 1);
  }
  function applyMusicVolume() {
    const volume = musicOutputVolume();
    if (musicAudio) musicAudio.volume = volume;
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(Math.round(volume * 100));
  }

  // The playing track's 「」 text, bottom centre.
  let nowPlayingEl = null;
  function setNowPlaying(text) {
    if (!nowPlayingEl) {
      nowPlayingEl = document.createElement('div');
      nowPlayingEl.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);'
        + 'z-index:5;color:#00ffd5;font-weight:400;font-size:21px;letter-spacing:1.5px;'
        + 'text-shadow:0 1px 2px rgba(0,0,0,0.95),0 0 1px rgba(0,0,0,0.9);'
        + 'pointer-events:none;white-space:nowrap;'
        + 'font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif;';
      document.body.appendChild(nowPlayingEl);
    }
    nowPlayingEl.textContent = text ? '♪ ' + text : '';
    nowPlayingEl.style.display = text ? 'block' : 'none';
  }

  let musicToastEl = null;
  let musicToastTimer = 0;
  function musicToast(text) {
    if (!musicToastEl) {
      musicToastEl = document.createElement('div');
      musicToastEl.style.cssText = 'position:fixed;left:50%;bottom:56px;transform:translateX(-50%);'
        + 'z-index:5;color:#ffb14a;font-size:14px;letter-spacing:1px;'
        + 'text-shadow:0 1px 2px rgba(0,0,0,0.9);pointer-events:none;white-space:nowrap;'
        + 'font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif;';
      document.body.appendChild(musicToastEl);
    }
    musicToastEl.textContent = text;
    musicToastEl.style.display = 'block';
    clearTimeout(musicToastTimer);
    musicToastTimer = setTimeout(() => { musicToastEl.style.display = 'none'; }, 4000);
  }

  function stopMusic() {
    musicTrackVolumeScale = 1;
    if (musicHls) { musicHls.destroy(); musicHls = null; }
    if (musicAudio) { musicAudio.pause(); musicAudio = null; }
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
  }

  let musicSkipAttempts = 0;
  function playCurrent(isAuto) {
    const it = musicItems[musicSel];
    if (!it || !it.url) return false;
    if (!isAuto) musicSkipAttempts = 0;
    stopMusic();
    musicTrackVolumeScale = it.effects?.volumePercent ? clamp(1 + it.effects.volumePercent / 100, 0, 2) : 1;
    if (it.type === 'yt') {
      // Until the player is ready, keep the menu open: the next Enter is the user
      // gesture that lets the track start with sound.
      if (!playYouTube(it.url, it.effects?.startSeconds)) {
        setNowPlaying(it.label + '（準備中）');
        musicMenuRefresh();
        return false;
      }
    } else {
      playRadio(it.url, it.effects?.startSeconds);
    }
    applyMusicVolume();
    setNowPlaying(it.label);
    musicMenuRefresh();
    return true;
  }
  function playNext(isAuto = true) {
    for (let step = 1; step <= musicItems.length; step++) {
      const idx = (musicSel + step) % musicItems.length;
      if (musicItems[idx].url) { musicSel = idx; playCurrent(isAuto); return; }
    }
  }
  function playPrev() {
    for (let step = 1; step <= musicItems.length; step++) {
      const idx = (musicSel - step + musicItems.length * 2) % musicItems.length;
      if (musicItems[idx].url) { musicSel = idx; playCurrent(); return; }
    }
  }
  function handlePlaybackError() {
    const it = musicItems[musicSel];
    const label = it ? it.label : '';
    musicSkipAttempts++;
    if (musicSkipAttempts >= Math.min(20, musicItems.length)) {
      musicToast('⚠ 再生可能な曲が見つかりません');
      setNowPlaying(label + '（エラー）');
      musicSkipAttempts = 0;
      return;
    }
    musicToast('⚠ 「' + label + '」は再生禁止のため次の曲へ');
    playNext(true);
  }

  function musicSeek(sec) {
    if (musicAudio) {
      try { musicAudio.currentTime = Math.max(0, musicAudio.currentTime + sec); } catch (_) {}
    } else if (ytPlayer && ytPlayer.getCurrentTime) {
      ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() + sec), true);
    }
  }
  function musicTogglePlay() {
    if (musicAudio) {
      if (musicAudio.paused) musicAudio.play().catch(() => {});
      else musicAudio.pause();
    } else if (ytPlayer && ytPlayer.getPlayerState) {
      const state = ytPlayer.getPlayerState();
      if (state === 1 || state === 3) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
    }
  }

  function playRadio(url, startSeconds) {
    musicAudio = new Audio();
    musicAudio.volume = musicOutputVolume();
    musicAudio.addEventListener('ended', () => playNext());
    musicAudio.addEventListener('error', handlePlaybackError);
    const seekable = startSeconds > 0 && !/#/.test(url);
    const srcUrl = seekable ? `${url}#t=${startSeconds}` : url;
    const start = () => musicAudio && musicAudio.play().catch((e) => console.warn('ラジオを再生できませんでした:', url, e));
    if (/\.m3u8/.test(url)) {
      // HLS streams need hls.js outside Safari.
      const ready = () => {
        if (window.Hls && window.Hls.isSupported()) {
          musicHls = new window.Hls();
          musicHls.loadSource(url);
          musicHls.attachMedia(musicAudio);
          start();
        } else { musicAudio.src = srcUrl; start(); }
      };
      if (window.Hls) ready();
      else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1';
        script.onload = ready;
        script.onerror = () => { musicAudio.src = srcUrl; start(); };
        document.head.appendChild(script);
      }
    } else {
      musicAudio.src = srcUrl;
      start();
    }
  }

  function youtubeId(url) {
    const m = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/);
    return m ? m[1] : null;
  }
  let ytPlayer = null;
  let ytPlayerReady = false;
  let ytPendingId = null;
  let ytCurrentId = null;
  function prepareYouTubePlayer() {
    whenYouTubeApi(() => {
      if (ytPlayer) return;
      ytPlayer = makePlayer('yt-player', 420, {
        onReady: (ev) => {
          ytPlayerReady = true;
          ev.target.setVolume(Math.round(musicOutputVolume() * 100));
          if (ytPendingId) {
            ev.target.cueVideoById(ytPendingId);
            musicToast('♪ プレイヤー準備完了：もう一度決定すると再生');
          }
        },
        onStateChange: (ev) => {
          if (ev.data === 1) musicSkipAttempts = 0;
          if (ev.data === 0) playNext();
        },
        onAutoplayBlocked: () => {
          musicToast('♪ 再生が制限されました：選択曲をもう一度決定');
          openMusicMenu();
        },
        onError: (ev) => {
          let errorVideoId = null;
          try { errorVideoId = ytPlayer.getVideoData().video_id; } catch (_) {}
          if (errorVideoId && ytCurrentId && errorVideoId !== ytCurrentId) return;
          console.warn('YouTube再生エラー:', ev.data);
          handlePlaybackError();
        },
      });
    });
  }
  function playYouTube(url, startSeconds) {
    const id = youtubeId(url);
    if (!id) return false;
    ytCurrentId = id;
    ytPendingId = id;
    prepareYouTubePlayer();
    if (!ytPlayerReady || !ytPlayer) {
      musicToast('♪ YouTubeプレイヤーを準備中…');
      return false;
    }
    ytPlayer.setVolume(Math.round(musicOutputVolume() * 100));
    let loadedId = null;
    try { loadedId = ytPlayer.getVideoData().video_id; } catch (_) {}
    const start = startSeconds > 0 ? startSeconds : 0;
    if (loadedId === id) {
      if (start) ytPlayer.seekTo(start, true);
      ytPlayer.playVideo();
    } else if (start) {
      ytPlayer.loadVideoById({ videoId: id, startSeconds: start });
    } else {
      ytPlayer.loadVideoById(id);
    }
    ytPendingId = null;
    return true;
  }

  // -------------------------------------------------------- control panel ---
  function musicMenuRefresh() {
    if (!musicListEl) return;
    const rows = musicListEl.children;
    for (let i = 0; i < rows.length; i++) {
      // Green LCD with dark bold text; the selected row is inverted and marked ▶.
      rows[i].style.background = i === musicSel ? '#2e342e' : 'transparent';
      rows[i].style.color = i === musicSel ? '#33CC33' : '#2e342e';
      const item = musicItems[i];
      if (item) {
        rows[i].textContent = item.type === 'header'
          ? item.label
          : (i === musicSel ? '▶ ' : '■ ') + item.label;
      }
    }
    const row = rows[musicSel];
    if (row) {
      musicListEl.scrollTop = (row.offsetTop - musicListEl.offsetTop) - musicListEl.clientHeight / 2 + 14;
    }
  }

  function makeSlider(labelText, value, oninput) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:13px;margin:0 0 8px;';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    caption.style.cssText = 'width:120px;flex:none;color:#333029;font-weight:900;'
      + 'letter-spacing:1px;font-size:19px;'
      + 'font-family:"MS Gothic","ＭＳ ゴシック","Courier New",monospace;';
    const SEGS = 24;
    const meter = document.createElement('div');
    meter.style.cssText = 'flex:1;display:flex;gap:3px;align-items:center;height:28px;'
      + 'padding:5px 8px;box-sizing:border-box;cursor:pointer;touch-action:none;'
      + 'border:1px solid rgba(0,0,0,0.35);';
    const cells = [];
    for (let i = 0; i < SEGS; i++) {
      const cell = document.createElement('div');
      cell.style.cssText = 'flex:1;height:14px;';
      meter.appendChild(cell);
      cells.push(cell);
    }
    const readout = document.createElement('span');
    readout.style.cssText = 'width:60px;flex:none;text-align:right;color:#333029;'
      + 'font-family:"MS Gothic","ＭＳ ゴシック","Courier New",monospace;'
      + 'font-weight:900;font-size:19px;';
    const render = (v) => {
      const lit = Math.round(v * SEGS);
      cells.forEach((cell, i) => { cell.style.background = i < lit ? '#333029' : 'rgba(0,0,0,0.12)'; });
      readout.textContent = Math.round(v * 100) + '%';
    };
    render(value);
    const setFromEvent = (ev) => {
      const rect = meter.getBoundingClientRect();
      const v = clamp((ev.clientX - rect.left - 8) / (rect.width - 16), 0, 1);
      render(v);
      oninput(v);
    };
    let dragging = false;
    meter.addEventListener('pointerdown', (ev) => { dragging = true; meter.setPointerCapture(ev.pointerId); setFromEvent(ev); });
    meter.addEventListener('pointermove', (ev) => { if (dragging) setFromEvent(ev); });
    meter.addEventListener('pointerup', () => { dragging = false; });
    wrap.append(caption, meter, readout);
    return wrap;
  }

  function openMusicMenu() {
    // Load the player while the panel is open so choosing a track can start it with sound.
    prepareYouTubePlayer();
    if (!musicMenuEl) {
      musicMenuEl = document.createElement('div');
      musicMenuEl.id = 'control-panel';
      musicMenuEl.style.cssText = 'position:fixed;inset:0;z-index:8;display:flex;'
        + 'align-items:center;justify-content:center;background:rgba(8,14,20,0.22);';

      // Black casing with a white double frame.
      const panel = document.createElement('div');
      panel.style.cssText = 'width:min(639px,90vw);height:min(426px,88vh);display:flex;flex-direction:column;'
        + 'overflow:hidden;box-sizing:border-box;'
        + 'background:#0a0a0a;border:3px double #fff;border-radius:0;padding:8px 14px 14px;color:#fff;'
        + 'font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif;';

      const tabs = document.createElement('div');
      tabs.style.cssText = 'display:grid;grid-template-columns:1.15fr 1fr 1fr 52px;'
        + 'gap:4px;margin:-1px 2px 14px;font:24px/1.6 "Courier New",monospace;';
      const title = document.createElement('div');
      title.textContent = 'Control Panel';
      title.style.cssText = 'background:#030303;color:#fff;padding:0 18px;white-space:nowrap;'
        + 'border-bottom:1px solid #fff;letter-spacing:.5px;';
      const musicTab = document.createElement('div');
      musicTab.textContent = 'Music';
      musicTab.style.cssText = 'border-left:4px solid #111;text-align:center;'
        + 'background:#33CC33;color:#25231e;box-shadow:inset 0 -4px 0 #25231e;';
      const spacer = document.createElement('div');
      spacer.style.cssText = 'background:#030303;';
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', '閉じる');
      closeButton.style.cssText = 'border:0;border-left:4px solid #111;outline:none;'
        + 'background:#030303;color:#fff;cursor:pointer;font:inherit;line-height:1.6;';
      closeButton.addEventListener('click', closeMusicMenu);
      tabs.append(title, musicTab, spacer, closeButton);
      panel.appendChild(tabs);

      const page = document.createElement('div');
      page.style.cssText = 'display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden;'
        + 'padding:4px;background:#050505;box-sizing:border-box;';
      const volPanel = document.createElement('div');
      volPanel.style.cssText = 'background:linear-gradient(180deg,#43dd3d,#2fc92f);'
        + 'border:1px solid #666;padding:9px 12px 3px;margin:0 0 8px;';
      volPanel.appendChild(makeSlider('環境音量', ambientVolume, (v) => {
        ambientVolume = v;
        if (wavePlayerReady) wavePlayer.setVolume(Math.round(v * 100));
      }));
      volPanel.appendChild(makeSlider('音楽音量', musicVolume, (v) => {
        musicVolume = v;
        applyMusicVolume();
      }));
      page.appendChild(volPanel);

      musicListEl = document.createElement('div');
      musicListEl.style.cssText = 'overflow-y:hidden;font-size:19px;line-height:1.55;'
        + 'height:auto;flex:1;min-height:0;margin:0;padding:6px 4px 10px;border:1px solid #666;'
        + 'box-sizing:border-box;'
        + 'font-family:"MS Gothic","ＭＳ ゴシック","Courier New",monospace;'
        + 'font-weight:900;-webkit-text-stroke:0.5px currentColor;'
        + 'background:#33CC33;';
      musicItems.forEach((it, i) => {
        const row = document.createElement('div');
        row.textContent = '■ ' + it.label;
        row.style.cssText = 'padding:1px 10px;white-space:nowrap;overflow:hidden;color:#2e342e;cursor:pointer;';
        row.addEventListener('click', () => { musicSel = i; musicMenuRefresh(); });
        row.addEventListener('dblclick', () => { musicSel = i; if (playCurrent()) closeMusicMenu(); });
        musicListEl.appendChild(row);
      });
      page.appendChild(musicListEl);
      const bottomFrame = document.createElement('div');
      bottomFrame.style.cssText = 'height:18px;flex:none;background:#050505;';
      page.appendChild(bottomFrame);
      // Mouse wheel moves the selection one row per notch.
      musicListEl.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        if (!musicItems.length) return;
        musicSel = (musicSel + Math.sign(ev.deltaY) + musicItems.length) % musicItems.length;
        musicMenuRefresh();
      }, { passive: false });
      panel.appendChild(page);
      musicMenuEl.appendChild(panel);
      document.body.appendChild(musicMenuEl);
    }
    musicMode = true;
    musicMenuEl.style.display = 'flex';
    musicMenuRefresh();
  }
  function closeMusicMenu() {
    musicMode = false;
    if (musicMenuEl) musicMenuEl.style.display = 'none';
  }

  // Runs before the boat controls (capture phase); while the panel is open it keeps
  // every key for itself, so ↑↓ pick a track instead of steering.
  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    const lower = k.toLowerCase();
    if (!e.repeat && lower === 'm') {
      if (musicMode) closeMusicMenu(); else openMusicMenu();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (musicMode) {
      e.stopImmediatePropagation();
      if (k.startsWith('Arrow') || k === 'Enter' || k === ' ') e.preventDefault();
      if (k === 'Escape') closeMusicMenu();
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        if (musicItems.length) {
          const dir = (k === 'ArrowUp' ? -1 : 1) * (e.repeat ? 3 : 1);
          musicSel = (musicSel + dir + musicItems.length * 3) % musicItems.length;
        }
        musicMenuRefresh();
      } else if (k === 'Enter') {
        if (playCurrent()) closeMusicMenu();
      }
      return;
    }
    if (e.repeat) return;
    if (lower === 'b') toggleWave();
    if (lower === 'j') musicSeek(-10);
    if (lower === 'k') musicTogglePlay();
    if (lower === 'l') musicSeek(10);
    if (lower === 'i') playPrev();
    if (lower === 'o') playNext(false);
  }, true);

  loadMusicList();
  return { isMenuOpen: () => musicMode };
}
