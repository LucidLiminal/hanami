// A strict SDK fixture: load() alone never starts audio, READY is initial-only,
// getters are asynchronous, and old PAUSE/FINISH messages can arrive late.
(() => {
  const events = Object.fromEntries(["READY", "PLAY", "PAUSE", "PLAY_PROGRESS", "FINISH", "SEEK", "ERROR"].map((name) => [name, name]));
  const telemetry = { instances: 0, loads: [], plays: 0, pauses: 0, seeks: [], finishes: 0, callbacks: 0, volumes: [] };
  function Widget(frame) {
    telemetry.instances++;
    const config = window.__SC_V138_CONFIG__ || {};
    const listeners = new Map();
    let currentUrl = new URL(frame.src).searchParams.get("url") || "https://soundcloud.com/fixture/breathe";
    let position = 0, paused = true, transitioning = false, timer = 0;
    const duration = () => config.natural ? 1800 : 334000;
    const soundId = () => currentUrl.includes("second-reader") ? "654321" : currentUrl.includes("third-reader") ? "333333" : "123456";
    const emit = (name, detail = {}) => { for (const listener of listeners.get(name) || []) listener(detail); };
    const stop = () => { clearInterval(timer); timer = 0; };
    const finish = () => {
      stop(); paused = true; position = duration(); telemetry.finishes++;
      emit(events.PAUSE);
      if (!config.noFinish) emit(events.FINISH);
      if (config.stale && !config.noFinish) setTimeout(() => {
        emit(events.PLAY_PROGRESS, { currentPosition: duration(), relativePosition: 1 });
        emit(events.FINISH);
        emit(events.PAUSE);
      }, 6);
    };
    const progress = () => {
      stop();
      timer = setInterval(() => {
        if (paused || transitioning) return;
        position = Math.min(duration(), position + 80);
        emit(events.PLAY_PROGRESS, { currentPosition: position, relativePosition: position / duration(), loadProgress: 1 });
        if (config.natural && position >= duration()) finish();
      }, 80);
    };
    const asyncGet = (callback, value) => setTimeout(() => callback(value()), 12);
    const api = {
      bind(name, listener) { const values = listeners.get(name) || []; values.push(listener); listeners.set(name, values); },
      load(url, options = {}) {
        telemetry.loads.push({ url, options: { ...options, callback: typeof options.callback === "function" } });
        stop(); paused = true; transitioning = true; emit(events.PAUSE);
        setTimeout(() => {
          if (currentUrl !== url) position = 0;
          currentUrl = url; transitioning = false;
          if (typeof options.callback === "function") { telemetry.callbacks++; options.callback(); }
          // The widget waits for an explicit play() after it is ready.
        }, 35);
      },
      play() {
        telemetry.plays++;
        if (transitioning || config.blocked) return;
        paused = false; emit(events.PLAY); progress();
      },
      pause() { telemetry.pauses++; paused = true; stop(); emit(events.PAUSE); },
      seekTo(milliseconds) { position = Math.max(0, Number(milliseconds) || 0); telemetry.seeks.push(position); emit(events.SEEK, { currentPosition: position }); },
      setVolume(value) { telemetry.volumes.push(value); },
      getDuration(callback) { asyncGet(callback, duration); },
      getPosition(callback) { asyncGet(callback, () => position); },
      isPaused(callback) { asyncGet(callback, () => paused); },
      getCurrentSound(callback) { asyncGet(callback, () => ({ id: soundId(), title: "Fixture SoundCloud", permalink_url: currentUrl })); },
    };
    setTimeout(() => emit(events.READY), 25);
    window.__SC_V138_FINISH__ = finish;
    window.__SC_V138_STATE__ = () => ({ currentUrl, position, paused, transitioning });
    return api;
  }
  Widget.Events = events;
  window.__SC_WIDGET_TELEMETRY__ = telemetry;
  window.SC = { Widget };
})();