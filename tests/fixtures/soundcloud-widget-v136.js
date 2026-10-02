(() => {
  const events = {
    READY: "READY",
    PLAY: "PLAY",
    PAUSE: "PAUSE",
    PLAY_PROGRESS: "PLAY_PROGRESS",
    FINISH: "FINISH",
    SEEK: "SEEK",
    ERROR: "ERROR",
  };
  const telemetry = {
    instances: 0,
    loads: [],
    plays: 0,
    pauses: 0,
    seeks: [],
    volumes: [],
  };
  function Widget(frame) {
    telemetry.instances++;
    const listeners = new Map();
    let position = 0;
    const duration = 185_000;
    let paused = true;
    let currentId = "123456";
    let currentUrl = "https://soundcloud.com/hanami/crimson-reader";
    let progressTimer = 0;
    const emit = (name, detail = {}) => {
      for (const listener of listeners.get(name) || []) listener(detail);
    };
    const stopProgress = () => {
      clearInterval(progressTimer);
      progressTimer = 0;
    };
    const startProgress = () => {
      stopProgress();
      progressTimer = setInterval(() => {
        if (paused) return;
        position = Math.min(duration, position + 1_000);
        emit(events.PLAY_PROGRESS, {
          currentPosition: position,
          relativePosition: position / duration,
          loadProgress: 1,
        });
      }, 80);
    };
    const ready = () => setTimeout(() => emit(events.READY), 20);
    const api = {
      bind(name, listener) {
        const values = listeners.get(name) || [];
        values.push(listener);
        listeners.set(name, values);
      },
      load(url, options = {}) {
        telemetry.loads.push({ url, options });
        currentUrl = url;
        currentId = url.includes("second-reader") ? "654321" : "123456";
        position = 0;
        paused = !options.auto_play;
      },
      play() {
        telemetry.plays++;
        paused = false;
        emit(events.PLAY);
        startProgress();
      },
      pause() {
        telemetry.pauses++;
        paused = true;
        stopProgress();
        emit(events.PAUSE);
      },
      seekTo(milliseconds) {
        position = Math.max(0, Number(milliseconds) || 0);
        telemetry.seeks.push(position);
        emit(events.SEEK, { currentPosition: position });
      },
      setVolume(value) {
        telemetry.volumes.push(value);
      },
      getDuration(callback) {
        callback(duration);
      },
      getPosition(callback) {
        callback(position);
      },
      isPaused(callback) {
        callback(paused);
      },
      getCurrentSound(callback) {
        callback({
          id: currentId,
          title: "Crimson Reader",
          permalink_url: currentUrl,
        });
      },
    };
    ready();
    return api;
  }
  Widget.Events = events;
  window.__SC_WIDGET_TELEMETRY__ = telemetry;
  window.SC = { Widget };
})();
