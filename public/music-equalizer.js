/* Web Audio equivalent of TSuki's native EQ/BassBoost/Virtualizer/Loudness chain. */
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  flat: { label: "Plano", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bass: 0, width: 0, gain: 0 },
  bass: { label: "Graves", bands: [6, 5, 4, 2, 0, -1, 0, 1, 2, 2], bass: 6, width: 0.08, gain: -1 },
  vocal: { label: "Voz", bands: [-2, -1, 0, 2, 4, 4, 3, 1, -1, -2], bass: 0, width: 0.04, gain: -1 },
  rock: { label: "Rock", bands: [4, 3, 1, -1, -2, 1, 3, 4, 4, 3], bass: 2, width: 0.16, gain: -2 },
  night: { label: "Noche", bands: [2, 2, 1, 0, -1, 0, 1, 2, 1, 0], bass: 2, width: 0.03, gain: -4 },
};

const STORAGE_KEY = "hanami-reader-equalizer-v1";
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const defaults = {
  enabled: false,
  preset: "flat",
  bands: [...EQ_PRESETS.flat.bands],
  bass: 0,
  width: 0,
  gain: 0,
};

function readState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...defaults,
      ...parsed,
      bands:
        Array.isArray(parsed.bands) && parsed.bands.length === EQ_FREQUENCIES.length
          ? parsed.bands.map((value) => clamp(value, -12, 12))
          : [...defaults.bands],
      enabled: parsed.enabled === true,
      bass: clamp(parsed.bass, 0, 12),
      width: clamp(parsed.width, 0, 1),
      gain: clamp(parsed.gain, -6, 15),
    };
  } catch {
    return { ...defaults, bands: [...defaults.bands] };
  }
}

function gainFromDb(decibels) {
  return Math.pow(10, decibels / 20);
}

function smooth(parameter, value, context) {
  if (!parameter || !context) return;
  parameter.cancelScheduledValues(context.currentTime);
  parameter.setTargetAtTime(value, context.currentTime, 0.018);
}

export class HanamiAudioEqualizer {
  constructor() {
    this.state = readState();
    this.elements = [];
    this.sources = new WeakMap();
    this.context = null;
    this.graph = null;
  }

  connect(elements) {
    this.elements = [...new Set((elements || []).filter(Boolean))];
    return this;
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {}
  }

  async ensureGraph() {
    if (this.graph) {
      await this.context.resume().catch(() => {});
      return this.graph;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio no está disponible en este navegador.");
    if (!this.elements.length) throw new Error("El reproductor todavía no está preparado.");
    const context = new AudioContextClass();
    const input = context.createGain();
    let attached = 0;
    for (const element of this.elements) {
      try {
        const source = context.createMediaElementSource(element);
        source.connect(input);
        this.sources.set(element, source);
        attached++;
      } catch (error) {
        await context.close().catch(() => {});
        throw new Error(error?.message || "No se pudo conectar el audio al ecualizador.");
      }
    }
    if (!attached) {
      await context.close().catch(() => {});
      throw new Error("No se pudo conectar el reproductor al ecualizador.");
    }

    const dry = context.createGain();
    const wet = context.createGain();
    const master = context.createGain();
    input.connect(dry);
    dry.connect(master);

    const bands = EQ_FREQUENCIES.map((frequency) => {
      const filter = context.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = frequency < 125 ? 0.8 : frequency > 8000 ? 0.9 : 1.18;
      return filter;
    });
    input.connect(bands[0]);
    bands.forEach((filter, index) => {
      if (bands[index + 1]) filter.connect(bands[index + 1]);
    });
    const bass = context.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = 105;
    bands.at(-1).connect(bass);

    const splitter = context.createChannelSplitter(2);
    const merger = context.createChannelMerger(2);
    const leftLeft = context.createGain();
    const leftRight = context.createGain();
    const rightRight = context.createGain();
    const rightLeft = context.createGain();
    bass.connect(splitter);
    splitter.connect(leftLeft, 0);
    splitter.connect(leftRight, 0);
    splitter.connect(rightRight, 1);
    splitter.connect(rightLeft, 1);
    leftLeft.connect(merger, 0, 0);
    rightLeft.connect(merger, 0, 0);
    rightRight.connect(merger, 0, 1);
    leftRight.connect(merger, 0, 1);
    merger.connect(wet);
    wet.connect(master);
    master.connect(context.destination);

    this.context = context;
    this.graph = {
      input,
      dry,
      wet,
      master,
      bands,
      bass,
      width: { leftLeft, leftRight, rightRight, rightLeft },
    };
    this.apply();
    await context.resume().catch(() => {});
    return this.graph;
  }

  apply() {
    if (!this.graph || !this.context) return;
    const { dry, wet, master, bands, bass, width } = this.graph;
    smooth(dry.gain, this.state.enabled ? 0 : 1, this.context);
    smooth(wet.gain, this.state.enabled ? 1 : 0, this.context);
    bands.forEach((filter, index) => smooth(filter.gain, this.state.bands[index], this.context));
    smooth(bass.gain, this.state.bass, this.context);
    const amount = this.state.width;
    smooth(width.leftLeft.gain, 1 + amount / 2, this.context);
    smooth(width.rightRight.gain, 1 + amount / 2, this.context);
    smooth(width.leftRight.gain, -amount / 2, this.context);
    smooth(width.rightLeft.gain, -amount / 2, this.context);
    smooth(master.gain, gainFromDb(this.state.gain), this.context);
  }

  async setEnabled(enabled) {
    const next = enabled === true;
    if (next) await this.ensureGraph();
    this.state.enabled = next;
    this.persist();
    this.apply();
    return this.state.enabled;
  }

  async resume() {
    if (!this.state.enabled) return;
    await this.ensureGraph();
  }

  setPreset(name) {
    const preset = EQ_PRESETS[name];
    if (!preset) return;
    this.state.preset = name;
    this.state.bands = [...preset.bands];
    this.state.bass = preset.bass;
    this.state.width = preset.width;
    this.state.gain = preset.gain;
    this.persist();
    this.apply();
  }

  setBand(index, value) {
    if (!Number.isInteger(index) || index < 0 || index >= EQ_FREQUENCIES.length) return;
    this.state.bands[index] = clamp(value, -12, 12);
    this.state.preset = "custom";
    this.persist();
    this.apply();
  }

  setBass(value) {
    this.state.bass = clamp(value, 0, 12);
    this.state.preset = "custom";
    this.persist();
    this.apply();
  }

  setWidth(value) {
    this.state.width = clamp(value, 0, 1);
    this.state.preset = "custom";
    this.persist();
    this.apply();
  }

  setGain(value) {
    this.state.gain = clamp(value, -6, 15);
    this.state.preset = "custom";
    this.persist();
    this.apply();
  }

  get attached() {
    return !!this.graph;
  }

  snapshot() {
    return {
      ...this.state,
      bands: [...this.state.bands],
      attached: this.attached,
      contextState: this.context?.state || "uninitialized",
    };
  }
}

export const equalizer = new HanamiAudioEqualizer();

if (typeof window !== "undefined")
  window.HanamiMusicEqualizer = { equalizer, HanamiAudioEqualizer, EQ_FREQUENCIES, EQ_PRESETS };
