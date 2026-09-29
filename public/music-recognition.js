/*
 * Browser port of TSuki's GPL-3.0 Shazam signature generator.
 * Upstream attribution and license: THIRD_PARTY_NOTICES.md.
 */
const RATE = 16_000;
const FFT_SIZE = 2_048;
const FFT_BINS = 1_025;
const BAND_RANGES = [
  [250, 520],
  [520, 1450],
  [1450, 3500],
  [3500, 5500],
];

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

class FftEngine {
  constructor(size) {
    this.size = size;
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    this.reverse = new Uint32Array(size);
    for (let index = 0; index < size / 2; index++) {
      this.cos[index] = Math.cos((2 * Math.PI * index) / size);
      this.sin[index] = Math.sin((2 * Math.PI * index) / size);
    }
    const bits = Math.log2(size);
    for (let index = 0; index < size; index++) {
      let source = index;
      let target = 0;
      for (let bit = 0; bit < bits; bit++) {
        target = (target << 1) | (source & 1);
        source >>>= 1;
      }
      this.reverse[index] = target;
    }
  }

  transform(real, imaginary) {
    const size = this.size;
    for (let index = 0; index < size; index++) {
      const reverse = this.reverse[index];
      if (reverse <= index) continue;
      [real[index], real[reverse]] = [real[reverse], real[index]];
      [imaginary[index], imaginary[reverse]] = [imaginary[reverse], imaginary[index]];
    }
    for (let length = 2; length <= size; length <<= 1) {
      const half = length / 2;
      const step = size / length;
      for (let offset = 0; offset < size; offset += length) {
        for (let index = 0, table = 0; index < half; index++, table += step) {
          const first = offset + index;
          const second = first + half;
          const real2 = real[second];
          const imaginary2 = imaginary[second];
          const cosine = this.cos[table];
          const sine = this.sin[table];
          const productReal = real2 * cosine + imaginary2 * sine;
          const productImaginary = -real2 * sine + imaginary2 * cosine;
          real[second] = real[first] - productReal;
          imaginary[second] = imaginary[first] - productImaginary;
          real[first] += productReal;
          imaginary[first] += productImaginary;
        }
      }
    }
  }
}

function writeInt32(target, value) {
  const unsigned = value >>> 0;
  target.push(
    unsigned & 0xff,
    (unsigned >>> 8) & 0xff,
    (unsigned >>> 16) & 0xff,
    (unsigned >>> 24) & 0xff,
  );
}

function writeInt16(target, value) {
  const unsigned = value >>> 0;
  target.push(unsigned & 0xff, (unsigned >>> 8) & 0xff);
}

function crc32(bytes, from = 0) {
  let crc = 0xffffffff;
  for (let index = from; index < bytes.length; index++) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let value = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk)
    value += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(value);
}

function payloadBytes(sampleCount, peaksByBand) {
  const body = [];
  for (let band = 0; band < BAND_RANGES.length; band++) {
    const peaks = peaksByBand.get(band) || [];
    if (!peaks.length) continue;
    const encoded = [];
    let previous = 0;
    for (const peak of peaks) {
      let delta = peak.fftNumber - previous;
      if (delta >= 255) {
        encoded.push(0xff);
        writeInt32(encoded, peak.fftNumber);
        previous = peak.fftNumber;
        delta = 0;
      }
      encoded.push(Math.max(0, Math.min(254, delta)));
      writeInt16(encoded, peak.magnitude);
      writeInt16(encoded, peak.bin);
      previous = peak.fftNumber;
    }
    writeInt32(body, 0x60030040 + band);
    writeInt32(body, encoded.length);
    body.push(...encoded);
    while (encoded.length % 4) {
      body.push(0);
      encoded.push(0);
    }
  }
  const sectionSize = body.length + 8;
  const header = new Uint8Array(48);
  const view = new DataView(header.buffer);
  const values = [
    0xcafe2580,
    0,
    sectionSize,
    0x94119c00,
    0,
    0,
    0,
    3 << 27,
    0,
    0,
    Math.trunc(sampleCount + RATE * 0.24),
    (15 << 19) + 0x40000,
  ];
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0, true));
  const bytes = [...header];
  writeInt32(bytes, 0x40000000);
  writeInt32(bytes, sectionSize);
  bytes.push(...body);
  const result = Uint8Array.from(bytes);
  new DataView(result.buffer).setUint32(4, crc32(result, 8), true);
  return result;
}

export class ShazamSignatureGenerator {
  constructor({ maxTimeSeconds = 3.1, maxPeaks = 255 } = {}) {
    this.maxTimeSeconds = maxTimeSeconds;
    this.maxPeaks = maxPeaks;
    this.engine = new FftEngine(FFT_SIZE);
    this.hann = new Float64Array(FFT_SIZE);
    for (let index = 0; index < FFT_SIZE; index++)
      this.hann[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (index + 1)) / 2049);
    this.real = new Float64Array(FFT_SIZE);
    this.imaginary = new Float64Array(FFT_SIZE);
    this.ring = new Int16Array(FFT_SIZE);
    this.ffts = Array.from({ length: 256 }, () => new Float64Array(FFT_BINS));
    this.spreads = Array.from({ length: 256 }, () => new Float64Array(FFT_BINS));
    this.reset();
  }

  reset() {
    this.queue = [];
    this.consumed = 0;
    this.ring.fill(0);
    this.ringIndex = 0;
    this.fftHead = 0;
    this.fftCount = 0;
    this.spreads.forEach((spread) => spread.fill(0));
    this.spreadHead = 0;
    this.spreadCount = 0;
    this.totalSamples = 0;
    this.peaksByBand = new Map();
  }

  feedPcm16Mono(samples) {
    for (const sample of samples) this.queue.push(Number(sample) || 0);
  }

  get peakCount() {
    let total = 0;
    for (const peaks of this.peaksByBand.values()) total += peaks.length;
    return total;
  }

  nextSignatureOrNull() {
    if (this.queue.length - this.consumed < 128) return null;
    while (
      this.queue.length - this.consumed >= 128 &&
      (this.totalSamples / RATE < this.maxTimeSeconds || this.peakCount < this.maxPeaks)
    ) {
      this.ingest(this.consumed, this.consumed + 128);
      this.consumed += 128;
    }
    if (!this.peaksByBand.size) return null;
    const bytes = payloadBytes(this.totalSamples, this.peaksByBand);
    const result = {
      uri: `data:audio/vnd.shazam.sig;base64,${bytesToBase64(bytes)}`,
      sampleDurationMs: Math.trunc((this.totalSamples * 1000) / RATE),
      peakCount: this.peakCount,
    };
    this.reset();
    return result;
  }

  ingest(from, to) {
    this.totalSamples += to - from;
    for (let offset = from; offset < to; offset += 128) {
      this.runFft(offset, offset + 128);
      this.runSpreading();
    }
  }

  runFft(from, to) {
    for (let index = from; index < to; index++) {
      this.ring[this.ringIndex] = this.queue[index];
      this.ringIndex = (this.ringIndex + 1) % FFT_SIZE;
    }
    let position = this.ringIndex;
    for (let index = 0; index < FFT_SIZE; index++) {
      if (position === FFT_SIZE) position = 0;
      this.real[index] = this.ring[position] * this.hann[index];
      this.imaginary[index] = 0;
      position++;
    }
    this.engine.transform(this.real, this.imaginary);
    const output = this.ffts[this.fftHead];
    for (let bin = 0; bin < FFT_BINS; bin++) {
      const real = this.real[bin];
      const imaginary = this.imaginary[bin];
      const energy = (real * real + imaginary * imaginary) / 131072;
      output[bin] = energy <= 1e-10 ? 1e-10 : energy;
    }
    this.fftHead = (this.fftHead + 1) % this.ffts.length;
    this.fftCount++;
  }

  runSpreading() {
    this.spread();
    if (this.spreadCount >= 46) this.recognizePeaks();
  }

  spread() {
    const source = this.ffts[mod(this.fftHead - 1, this.ffts.length)];
    const current = new Float64Array(FFT_BINS);
    for (let bin = 0; bin <= 1021; bin++)
      current[bin] = Math.max(source[bin], source[bin + 1], source[bin + 2]);
    current[1022] = source[1022];
    current[1023] = source[1023];
    current[1024] = source[1024];
    const previous1 = this.spreads[mod(this.spreadHead - 1, this.spreads.length)];
    const previous3 = this.spreads[mod(this.spreadHead - 3, this.spreads.length)];
    const previous6 = this.spreads[mod(this.spreadHead - 6, this.spreads.length)];
    for (let bin = 0; bin < FFT_BINS; bin++) {
      const maximum1 = Math.max(current[bin], previous1[bin]);
      previous1[bin] = maximum1;
      const maximum2 = Math.max(maximum1, previous3[bin]);
      previous3[bin] = maximum2;
      previous6[bin] = Math.max(maximum2, previous6[bin]);
    }
    this.spreads[this.spreadHead].set(current);
    this.spreadHead = (this.spreadHead + 1) % this.spreads.length;
    this.spreadCount++;
  }

  recognizePeaks() {
    const fft = this.ffts[mod(this.fftHead - 46, this.ffts.length)];
    const spread = this.spreads[mod(this.spreadHead - 49, this.spreads.length)];
    for (let bin = 10; bin <= 1014; bin++) {
      const energy = fft[bin];
      if (energy < 1 / 64 || energy < spread[bin - 1]) continue;
      let neighbourhood = 0;
      for (const offset of [-10, -7, -4, -3, 1, 2, 5, 8])
        neighbourhood = Math.max(neighbourhood, spread[bin + offset]);
      if (energy <= neighbourhood) continue;
      let temporal = neighbourhood;
      for (const offset of [-53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249])
        temporal = Math.max(
          temporal,
          this.spreads[mod(this.spreadHead + offset, this.spreads.length)][bin - 1],
        );
      if (energy <= temporal) continue;
      const magnitude = Math.log(Math.max(1 / 64, energy)) * 1477.3 + 6144;
      const magnitudeLeft = Math.log(Math.max(1 / 64, fft[bin - 1])) * 1477.3 + 6144;
      const magnitudeRight = Math.log(Math.max(1 / 64, fft[bin + 1])) * 1477.3 + 6144;
      const curvature = magnitude * 2 - magnitudeLeft - magnitudeRight;
      if (curvature <= 0) continue;
      const correction = ((magnitudeRight - magnitudeLeft) * 32) / curvature;
      const correctedBin = bin * 64 + correction;
      const hertz = correctedBin * (RATE / 2 / 1024 / 64);
      const band = BAND_RANGES.findIndex(
        ([low, high], index) => (index === 0 ? hertz >= low : hertz > low) && hertz <= high,
      );
      if (band < 0) continue;
      const peaks = this.peaksByBand.get(band) || [];
      peaks.push({
        fftNumber: this.spreadCount - 46,
        magnitude: Math.trunc(magnitude),
        bin: Math.trunc(correctedBin),
      });
      this.peaksByBand.set(band, peaks);
    }
  }
}

export function resampleMono(input, sourceRate, targetRate = RATE) {
  const source = input instanceof Float32Array ? input : Float32Array.from(input || []);
  const from = Number(sourceRate);
  if (!source.length || !Number.isFinite(from) || from <= 0) return new Int16Array();
  const outputLength = Math.max(1, Math.floor((source.length * targetRate) / from));
  const output = new Int16Array(outputLength);
  const ratio = from / targetRate;
  for (let index = 0; index < outputLength; index++) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(source.length - 1, left + 1);
    const mix = position - left;
    const value = Math.max(-1, Math.min(1, source[left] * (1 - mix) + source[right] * mix));
    output[index] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  }
  return output;
}

export function signatureFromPcm(samples, sampleRate = RATE) {
  let pcm;
  if (samples instanceof Int16Array && Number(sampleRate) === RATE) pcm = samples;
  else if (samples instanceof Int16Array) {
    const normalized = Float32Array.from(samples, (sample) =>
      sample < 0 ? sample / 32768 : sample / 32767,
    );
    pcm = resampleMono(normalized, sampleRate, RATE);
  } else pcm = resampleMono(samples, sampleRate, RATE);
  const generator = new ShazamSignatureGenerator();
  generator.feedPcm16Mono(pcm);
  return generator.nextSignatureOrNull();
}

export async function captureMicrophone({ durationMs = 6_000, onProgress } = {}) {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia)
    throw new Error("El navegador no permite acceder al micrófono en este contexto.");
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio no está disponible en este navegador.");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const context = new AudioContextClass();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silent = context.createGain();
  silent.gain.value = 0;
  const chunks = [];
  let sampleCount = 0;
  processor.onaudioprocess = (event) => {
    const data = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(data);
    chunks.push(copy);
    sampleCount += copy.length;
  };
  source.connect(processor);
  processor.connect(silent);
  silent.connect(context.destination);
  await context.resume();
  const started = performance.now();
  const timer = setInterval(() => {
    onProgress?.(Math.min(1, (performance.now() - started) / durationMs));
  }, 120);
  try {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  } finally {
    clearInterval(timer);
    onProgress?.(1);
    processor.disconnect();
    source.disconnect();
    silent.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => {});
  }
  const samples = new Float32Array(sampleCount);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return { samples, sampleRate: context.sampleRate };
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `El servicio respondió HTTP ${response.status}`);
  return data;
}

export async function recognizeAmbient({ onProgress } = {}) {
  const recording = await captureMicrophone({ durationMs: 6_000, onProgress });
  onProgress?.(1, "Analizando firma…");
  const signature = signatureFromPcm(recording.samples, recording.sampleRate);
  if (!signature)
    throw new Error("No hubo suficiente señal musical. Acerca el dispositivo a la fuente e inténtalo otra vez.");
  return apiJson("/api/music/recognize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      signature: signature.uri,
      sampleDurationMs: signature.sampleDurationMs,
    }),
  });
}

if (typeof window !== "undefined")
  window.HanamiMusicRecognition = {
    ShazamSignatureGenerator,
    resampleMono,
    signatureFromPcm,
    captureMicrophone,
    recognizeAmbient,
  };
