import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_SAMPLE_RATE = 16_000;
const MAX_AUDIO_SECONDS = 30;
const ANALYSIS_HOP_SECONDS = 0.01;
const MIN_TEMPO_BPM = 60;
const MAX_TEMPO_BPM = 200;

export interface AudioEndingAnalysis {
  status: 'clean' | 'review' | 'uncertain';
  reasons: string[];
  tailRmsRatio: number;
  terminalRms: number;
}

export interface AudioRhythmAnalysis {
  onsetSeconds: number[];
  beatSeconds: number[];
  bpm?: number;
  confidence: number;
  method: 'energy-autocorrelation' | 'editorial-fallback';
  fallbackReason?: string;
  ending: AudioEndingAnalysis;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number, places = 3): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function rms(samples: Float32Array, start: number, end: number): number {
  const from = Math.max(0, Math.min(samples.length, Math.floor(start)));
  const to = Math.max(from, Math.min(samples.length, Math.floor(end)));
  if (to === from) return 0;
  let sum = 0;
  for (let index = from; index < to; index++) sum += samples[index] * samples[index];
  return Math.sqrt(sum / (to - from));
}

function endingAnalysis(samples: Float32Array, sampleRate: number, onsets: number[]): AudioEndingAnalysis {
  const duration = samples.length / sampleRate;
  const tailStart = Math.max(0, duration - 0.5);
  const precedingStart = Math.max(0, tailStart - 2);
  const tailRms = rms(samples, tailStart * sampleRate, samples.length);
  const precedingRms = rms(samples, precedingStart * sampleRate, tailStart * sampleRate);
  const terminalRms = rms(samples, Math.max(0, duration - 0.1) * sampleRate, samples.length);
  const earlyTailRms = rms(samples, tailStart * sampleRate, Math.min(duration, tailStart + 0.2) * sampleRate);
  const lateTailRms = rms(samples, Math.max(tailStart, duration - 0.2) * sampleRate, samples.length);
  const tailRmsRatio = tailRms / Math.max(precedingRms, 1e-6);
  const tailTrend = lateTailRms / Math.max(earlyTailRms, 1e-6);
  const nearFinalOnset = onsets.some(second => second >= Math.max(0, duration - 0.4));
  const reasons: string[] = [];

  // This is a signal heuristic only. It cannot determine whether a lyric or phrase
  // is semantically complete, and it never modifies the source audio.
  if (precedingRms < 0.0015 && tailRms < 0.0015) {
    return { status: 'clean', reasons: ['silent-ending'], tailRmsRatio: round(tailRmsRatio), terminalRms: round(terminalRms, 5) };
  }
  if (nearFinalOnset) reasons.push('energy-onset-near-end');
  if (terminalRms > 0.008 && tailRmsRatio > 0.68 && tailTrend > 0.68) reasons.push('sustained-energy-at-end');
  if (reasons.length) return { status: 'review', reasons, tailRmsRatio: round(tailRmsRatio), terminalRms: round(terminalRms, 5) };
  if (terminalRms < 0.004 && tailRmsRatio < 0.45 && tailTrend < 0.7) {
    return { status: 'clean', reasons: ['decaying-ending'], tailRmsRatio: round(tailRmsRatio), terminalRms: round(terminalRms, 5) };
  }
  return { status: 'uncertain', reasons: ['ambiguous-ending-energy'], tailRmsRatio: round(tailRmsRatio), terminalRms: round(terminalRms, 5) };
}

function normalizedSamples(pcm: Int16Array | Float32Array): Float32Array {
  if (pcm instanceof Float32Array) return pcm;
  const output = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index++) output[index] = pcm[index] / 32768;
  return output;
}

/** Analyze decoded mono PCM. Returned beat times are detected energy events, never a fabricated beat grid. */
export function analyzePetPcm(pcm: Int16Array | Float32Array, sampleRate = DEFAULT_SAMPLE_RATE): AudioRhythmAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) throw new Error('Unsupported PCM sample rate');
  const samples = normalizedSamples(pcm);
  const hop = Math.max(1, Math.round(sampleRate * ANALYSIS_HOP_SECONDS));
  const window = Math.max(hop, Math.round(sampleRate * 0.02));
  const frameCount = Math.max(0, Math.floor((samples.length - window) / hop) + 1);
  const energy = new Array<number>(frameCount);
  for (let frame = 0; frame < frameCount; frame++) energy[frame] = rms(samples, frame * hop, frame * hop + window);

  const positiveEnergy = energy.map((value, index) => Math.max(0, value - (index ? energy[index - 1] : value)));
  const fluxFloor = median(positiveEnergy);
  const fluxDeviation = median(positiveEnergy.map(value => Math.abs(value - fluxFloor)));
  const maximumEnergy = energy.length ? Math.max(...energy) : 0;
  const onsetThreshold = Math.max(0.002, fluxFloor + 4 * Math.max(fluxDeviation, 0.0005), maximumEnergy * 0.08);
  const onsetFrames: number[] = [];
  const minimumOnsetFrames = Math.max(1, Math.round(0.08 / ANALYSIS_HOP_SECONDS));
  for (let frame = 1; frame + 1 < positiveEnergy.length; frame++) {
    if (positiveEnergy[frame] < onsetThreshold || positiveEnergy[frame] < positiveEnergy[frame - 1] || positiveEnergy[frame] < positiveEnergy[frame + 1]) continue;
    const previous = onsetFrames.at(-1);
    if (previous !== undefined && frame - previous < minimumOnsetFrames) {
      if (positiveEnergy[frame] > positiveEnergy[previous]) onsetFrames[onsetFrames.length - 1] = frame;
    } else onsetFrames.push(frame);
  }
  const onsetSeconds = onsetFrames.map(frame => round(frame * hop / sampleRate));
  const ending = endingAnalysis(samples, sampleRate, onsetSeconds);
  const duration = samples.length / sampleRate;
  if (duration < 1 || maximumEnergy < 0.0015) {
    return { onsetSeconds, beatSeconds: [], confidence: 0, method: 'editorial-fallback', fallbackReason: 'silent-or-near-silent-audio', ending };
  }
  if (onsetFrames.length < 4) {
    return { onsetSeconds, beatSeconds: [], confidence: 0, method: 'editorial-fallback', fallbackReason: 'insufficient-rhythmic-onsets', ending };
  }

  // Autocorrelation of the onset envelope estimates periodicity. It only selects
  // already-observed onsets below; it does not claim lyric or word alignment.
  const envelope = positiveEnergy.map(value => value >= onsetThreshold ? value : 0);
  const minimumLag = Math.max(1, Math.floor((60 / MAX_TEMPO_BPM) / ANALYSIS_HOP_SECONDS));
  const maximumLag = Math.min(envelope.length - 1, Math.ceil((60 / MIN_TEMPO_BPM) / ANALYSIS_HOP_SECONDS));
  let bestLag = 0; let bestCorrelation = 0;
  for (let lag = minimumLag; lag <= maximumLag; lag++) {
    let cross = 0; let left = 0; let right = 0;
    for (let frame = lag; frame < envelope.length; frame++) {
      const a = envelope[frame]; const b = envelope[frame - lag];
      cross += a * b; left += a * a; right += b * b;
    }
    const correlation = cross / Math.sqrt(Math.max(left * right, 1e-12));
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; }
  }
  const periodSeconds = bestLag * ANALYSIS_HOP_SECONDS;
  const bpm = bestLag ? 60 / periodSeconds : undefined;
  const tolerance = Math.min(0.12, periodSeconds * 0.24);
  let bestEvents: number[] = [];
  for (const phase of onsetSeconds) {
    const events = onsetSeconds.filter(second => {
      const cycles = Math.round((second - phase) / periodSeconds);
      return Math.abs(second - (phase + cycles * periodSeconds)) <= tolerance;
    });
    if (events.length > bestEvents.length) bestEvents = events;
  }
  const periodicFraction = bestEvents.length / onsetSeconds.length;
  const confidence = Math.max(0, Math.min(1, bestCorrelation * (0.45 + 0.55 * periodicFraction)));
  if (!bpm || confidence < 0.42 || bestEvents.length < 4) {
    return { onsetSeconds, beatSeconds: [], bpm: bpm ? round(bpm, 1) : undefined, confidence: round(confidence), method: 'editorial-fallback', fallbackReason: 'low-tempo-confidence', ending };
  }
  return {
    onsetSeconds,
    beatSeconds: bestEvents,
    bpm: round(bpm, 1),
    confidence: round(confidence),
    method: 'energy-autocorrelation',
    ending,
  };
}

/** Decode at a bounded 16 kHz mono rate for deterministic, dependency-free analysis. */
export async function analyzePetAudioRhythm(binary: string, filename: string, durationSeconds?: number): Promise<AudioRhythmAnalysis> {
  const boundedSeconds = Math.max(0.1, Math.min(MAX_AUDIO_SECONDS, durationSeconds || MAX_AUDIO_SECONDS));
  const result = await execFileAsync(binary, [
    '-hide_banner', '-v', 'error', '-i', filename, '-map', '0:a:0', '-ac', '1', '-ar', String(DEFAULT_SAMPLE_RATE),
    '-t', String(boundedSeconds), '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1',
  ], { timeout: 30_000, maxBuffer: DEFAULT_SAMPLE_RATE * MAX_AUDIO_SECONDS * 2 + 64 * 1024, encoding: 'buffer' });
  const bytes = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout);
  const aligned = bytes.subarray(0, bytes.length - bytes.length % 2);
  const pcm = new Int16Array(aligned.length / 2);
  for (let index = 0; index < pcm.length; index++) pcm[index] = aligned.readInt16LE(index * 2);
  return analyzePetPcm(pcm, DEFAULT_SAMPLE_RATE);
}
