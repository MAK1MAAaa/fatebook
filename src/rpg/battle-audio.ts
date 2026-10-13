import { CARD_PLAY_IMPACT_MS, type CardPlayCue } from './card-play-effects';
import type { BattleFeedbackCue, BattleFeedbackEvent } from './battle-feedback';

export const AUDIO_PREFERENCES_KEY = 'fatebook:battle-audio:v1';
export const MAX_BATTLE_AUDIO_VOICES = 32;
export const MAX_BATTLE_FEEDBACK_AUDIO_NOTES = 28;
const MAX_REMEMBERED_CUES = 128;
const MAX_CUE_NOTES = 14;

export interface BattleAudioPreferences { enabled: boolean; volume: number }
export interface BattleAudioNote {
  kind: 'cast' | 'hit' | 'absorbed' | 'status' | 'block' | 'heal' | 'draw' | 'energy' | 'defeat'
    | 'enemy-prepare' | 'hero-hurt' | 'hero-burn' | 'drain' | 'ritual' | 'escort-hit' | 'victory' | 'loss';
  offsetMs: number;
  durationMs: number;
  type: OscillatorType | 'noise';
  frequency: number;
  frequencyEnd: number;
  volume: number;
}

const DEFAULT_PREFERENCES: BattleAudioPreferences = { enabled: true, volume: 0.55 };

function normalizePreferences(value: unknown): BattleAudioPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFERENCES };
  const candidate = value as Partial<BattleAudioPreferences>;
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_PREFERENCES.enabled,
    volume: typeof candidate.volume === 'number' && Number.isFinite(candidate.volume)
      ? Math.max(0, Math.min(1, candidate.volume)) : DEFAULT_PREFERENCES.volume,
  };
}

/** Audio preferences are deliberately separate from gameplay saves. */
export function readBattleAudioPreferences(): BattleAudioPreferences {
  try { return normalizePreferences(JSON.parse(window.localStorage.getItem(AUDIO_PREFERENCES_KEY) ?? 'null')); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}

export function writeBattleAudioPreferences(preferences: BattleAudioPreferences): void {
  try { window.localStorage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(normalizePreferences(preferences))); }
  catch { /* Private browsing or unavailable storage must not interrupt combat. */ }
}

interface CastProfile { type: OscillatorType; start: number; end: number; airy?: boolean }
const SCHOOL_PROFILES: Record<CardPlayCue['school'], CastProfile> = {
  fire: { type: 'sawtooth', start: 180, end: 95, airy: true },
  water: { type: 'sine', start: 680, end: 320, airy: true },
  earth: { type: 'triangle', start: 130, end: 65, airy: true },
  wind: { type: 'triangle', start: 620, end: 1050, airy: true },
  sword: { type: 'triangle', start: 1020, end: 360, airy: true },
  waterSword: { type: 'sine', start: 860, end: 510 },
  northSword: { type: 'square', start: 210, end: 760, airy: true },
  healing: { type: 'sine', start: 620, end: 930 },
  neutral: { type: 'triangle', start: 350, end: 520 },
  identity: { type: 'triangle', start: 440, end: 660 },
};
const IDENTITY_PROFILES: Partial<Record<NonNullable<CardPlayCue['actor']>, CastProfile>> = {
  custom: { type: 'triangle', start: 440, end: 660 },
  rudeus: { type: 'sawtooth', start: 220, end: 480, airy: true },
  eris: { type: 'triangle', start: 1050, end: 540, airy: true },
  sylphie: { type: 'sine', start: 730, end: 1080 },
  roxy: { type: 'sine', start: 520, end: 800 },
};
const ALLIANCE_PROFILE: CastProfile = { type: 'triangle', start: 392, end: 784 };

/** A bounded, deterministic score uses committed receipts, never predicted damage. */
export function buildBattleAudioPlan(cue: CardPlayCue): BattleAudioNote[] {
  const profile = cue.cardId === 'identity-alliance' ? ALLIANCE_PROFILE : cue.school === 'identity' && cue.actor
    ? IDENTITY_PROFILES[cue.actor] ?? SCHOOL_PROFILES.identity : SCHOOL_PROFILES[cue.school];
  const pitch = cue.upgraded ? 1.09 : 1;
  const emphasis = cue.upgraded ? 1.12 : 1;
  const notes: BattleAudioNote[] = [];
  const add = (kind: BattleAudioNote['kind'], offsetMs: number, durationMs: number, type: BattleAudioNote['type'], frequency: number, frequencyEnd: number, volume: number) => {
    notes.push({ kind, offsetMs, durationMs, type, frequency, frequencyEnd, volume: volume * emphasis });
  };
  add('cast', 0, 115, profile.type, profile.start * pitch, profile.end * pitch, 0.2);
  add('cast', 22, 80, profile.airy ? 'noise' : 'sine', profile.airy ? profile.start * 3 : profile.start * pitch * 1.5,
    profile.airy ? profile.end * 4 : profile.end * pitch * 1.5, 0.085);

  const damage = cue.targets.reduce((sum, target) => sum + target.damage, 0);
  const absorbed = cue.targets.reduce((sum, target) => sum + target.absorbed, 0);
  const status = cue.targets.some(target => target.burn > 0 || target.weak > 0 || target.vulnerable > 0);
  // Reduced motion shows a short static receipt immediately, so its impact
  // should land with that receipt instead of after it has nearly disappeared.
  const impact = cue.durationMs <= 240 ? 0 : CARD_PLAY_IMPACT_MS;
  if (damage > 0) {
    // A group attack is one fuller impact, avoiding one loud stack per enemy.
    const weight = Math.min(1.35, 0.9 + Math.sqrt(damage) / 35 + (cue.all ? 0.08 : 0));
    add('hit', impact, 95, 'noise', cue.school === 'earth' ? 420 : 1800, 280, 0.2 * weight);
    add('hit', impact, 140, 'sine', cue.school === 'earth' ? 100 : 150, 45, 0.22 * weight);
  }
  if (absorbed > 0) {
    add('absorbed', impact, 115, 'triangle', 1560, 640, 0.12);
    add('absorbed', impact + 10, 160, 'sine', 830, 790, 0.07);
  }
  if (status) add('status', impact + 35, 180, cue.targets.some(target => target.burn > 0) ? 'noise' : 'sine', 1100, 350, 0.075);
  if (cue.hero.block > 0) add('block', impact, 160, 'triangle', 520, 390, 0.13);
  if (cue.hero.heal > 0 || cue.hero.cleanse > 0) {
    add('heal', impact, 240, 'sine', 660, 880, 0.13);
    add('heal', impact + 55, 250, 'sine', 990, 1320, 0.07);
  }
  if (cue.hero.draw > 0) add('draw', impact + 15, 50, 'noise', 2500, 1700, 0.06);
  if (cue.hero.energy > 0) add('energy', impact + 45, 210, 'sine', 780, 1170, 0.11);
  if (cue.targets.some(target => target.defeated)) {
    add('defeat', impact + 120, 270, 'triangle', 440, 660, 0.1);
    add('defeat', impact + 170, 270, 'sine', 660, 880, 0.07);
  }
  return notes.slice(0, MAX_CUE_NOTES);
}

/** Real enemy events share the visual timeline; terminal music keeps its budget. */
export function buildBattleFeedbackAudioPlan(cue: BattleFeedbackCue): BattleAudioNote[] {
  const body: { note: BattleAudioNote; priority: number }[] = [], tail: BattleAudioNote[] = [];
  const add = (kind: BattleAudioNote['kind'], offsetMs: number, durationMs: number,
    type: BattleAudioNote['type'], frequency: number, frequencyEnd: number, volume: number,
    endMs: number, priority = 1, terminal = false) => {
    const duration = Math.min(durationMs, endMs - offsetMs, cue.durationMs - offsetMs);
    if (duration <= 0) return;
    const note = { kind, offsetMs, durationMs: duration, type, frequency, frequencyEnd, volume };
    if (terminal) tail.push(note); else body.push({ note, priority });
  };
  const hurt = (damage: number, at: number, end: number) => {
    if (damage <= 0) return;
    const weight = Math.min(1.25, 0.85 + Math.sqrt(damage) / 35);
    add('hero-hurt', at, 150, 'triangle', 125, 42, 0.22 * weight, end, 0);
    add('hero-hurt', at, 95, 'noise', 1700, 240, 0.15 * weight, end, 3);
  };
  const burn = (damage: number, at: number, end: number) => {
    if (damage <= 0) return;
    add('hero-burn', at, 130, 'noise', 780, 180, 0.11, end, 0);
    add('hero-burn', at, 145, 'sine', 220, 60, 0.09, end, 3);
  };
  const absorbed = (amount: number, at: number, end: number) => {
    if (amount > 0) add('absorbed', at, 130, 'triangle', 1300, 570, 0.13, end);
  };
  const eventNote = (event: BattleFeedbackEvent, at: number, end: number) => {
    if (event.kind === 'enemy-burn' && event.damage > 0) {
      add('hit', at, 100, 'noise', 1000, 300, 0.065, end);
      if (event.defeated) add('defeat', at + 20, 160, 'triangle', 330, 520, 0.07, end, 2);
    }
    if (event.amount > 0) {
      if (event.kind === 'enemy-guard') add('block', at, 130, 'triangle', 470, 310, 0.1, end);
      else if (event.kind === 'enemy-heal') add('heal', at, 200, 'sine', 520, 780, 0.11, end);
      else if (event.kind === 'enemy-status') add('status', at, 160, event.status === 'burn' ? 'noise' : 'sine', 930, 330, 0.1, end);
      else if (event.kind === 'enemy-drain') add('drain', at, 110, 'noise', 2100, 550, 0.08, end);
      else if (event.kind === 'enemy-ritual') add('ritual', at, 200, 'sawtooth', 130, 200, 0.08, end, 0);
    }
    if (event.escortDamage > 0) add('escort-hit', at, 135, 'sine', 290, 105, 0.075, end, 2);
  };

  if (cue.durationMs <= 240) {
    // Static receipts display every delta together. Aggregate each mechanism
    // once rather than stacking all multi-hit sounds on the same audio frame.
    const end = Math.min(220, cue.durationMs), attacks = cue.events.filter(event => event.kind === 'enemy-attack');
    if (attacks.length) add('enemy-prepare', 0, 55, 'noise', 1200, 400, 0.07, end);
    hurt(attacks.reduce((sum, event) => sum + event.damage, 0), 0, end);
    absorbed(attacks.reduce((sum, event) => sum + event.absorbed, 0), 0, end);
    burn(cue.events.filter(event => event.kind === 'hero-burn').reduce((sum, event) => sum + event.damage, 0), 0, end);
    const mechanisms = ['enemy-burn', 'enemy-guard', 'enemy-heal', 'enemy-status', 'enemy-drain', 'enemy-ritual'] as const;
    for (const kind of mechanisms) {
      const events = cue.events.filter(event => event.kind === kind);
      if (!events.length) continue;
      eventNote({ ...events[0], damage: events.reduce((sum, event) => sum + event.damage, 0),
        amount: events.reduce((sum, event) => sum + event.amount, 0), escortDamage: 0,
        defeated: events.some(event => event.defeated) }, 0, end);
    }
    const escortDamage = cue.events.reduce((sum, event) => sum + event.escortDamage, 0);
    if (escortDamage > 0) add('escort-hit', 0, 135, 'sine', 290, 105, 0.075, end, 2);
  } else {
    for (const event of cue.events) {
      const at = event.offsetMs + event.impactMs, end = event.offsetMs + event.durationMs;
      if (event.kind === 'enemy-attack') {
        if ((event.hitIndex ?? 0) === 0) add('enemy-prepare', event.offsetMs, 95, 'noise', 1200, 400, 0.075, end);
        hurt(event.damage, at, end);
        absorbed(event.absorbed, at, end);
      } else if (event.kind === 'hero-burn') burn(event.damage, at, end);
      eventNote(event, at, end);
    }
  }

  if (cue.outcome) {
    const { result, offsetMs, durationMs } = cue.outcome, end = offsetMs + durationMs;
    const scale = durationMs / 800;
    if (result === 'won') {
      for (const [index, frequency] of [523.25, 659.25, 783.99, 1046.5].entries()) {
        add('victory', offsetMs + index * 110 * scale, (index === 3 ? 420 : 230) * scale,
          index === 3 ? 'triangle' : 'sine', frequency, frequency * 1.015,
          index === 3 ? 0.15 : 0.12, end, 0, true);
      }
    } else {
      add('loss', offsetMs, 680 * scale, 'triangle', 220, 82.41, 0.15, end, 0, true);
      add('loss', offsetMs + 100 * scale, 630 * scale, 'sine', 146.83, 55, 0.095, end, 0, true);
    }
  }

  const capacity = MAX_BATTLE_FEEDBACK_AUDIO_NOTES - tail.length;
  const retained = new Set(body.map((entry, index) => ({ priority: entry.priority, index }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .slice(0, capacity).map(entry => entry.index));
  // Actual hurt and block receipts take priority over extra texture. Selection
  // remains deterministic, preserves timeline order and never trims the ending.
  return [...body.filter((_entry, index) => retained.has(index)).map(entry => entry.note), ...tail];
}

interface Voice { source: AudioScheduledSourceNode; nodes: AudioNode[] }

/** Web Audio is unlocked only by prepare(), called synchronously from a user action. */
export class BattleAudioPlayer {
  private preferences: BattleAudioPreferences;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private played = new Set<string>();
  private disposed = false;
  private readonly visibilityDocument = typeof document === 'undefined' ? null : document;
  private readonly onVisibilityChange = () => { if (this.hidden()) this.cancel(); };

  constructor(preferences: BattleAudioPreferences = readBattleAudioPreferences()) {
    this.preferences = normalizePreferences(preferences);
    this.visibilityDocument?.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private hidden(): boolean { return this.visibilityDocument?.hidden ?? false; }
  private audible(): boolean { return !this.disposed && this.preferences.enabled && this.preferences.volume > 0 && !this.hidden(); }

  prepare(): void {
    if (!this.audible()) return;
    try {
      if (this.context?.state === 'closed') this.releaseContext();
      if (!this.context) {
        const host = typeof window === 'undefined' ? null : window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const Constructor = host?.AudioContext ?? host?.webkitAudioContext;
        if (!Constructor) return;
        const context = new Constructor();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.preferences.volume * 0.3;
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -16;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 6;
        this.compressor.attack.value = 0.005;
        this.compressor.release.value = 0.08;
        this.master.connect(this.compressor);
        this.compressor.connect(context.destination);
      }
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => { /* Autoplay denial is a silent fallback. */ });
    } catch { this.releaseContext(); }
  }

  setPreferences(preferences: BattleAudioPreferences): void {
    this.preferences = normalizePreferences(preferences);
    if (!this.preferences.enabled || this.preferences.volume === 0) this.cancel();
    try { this.master?.gain.setValueAtTime(this.preferences.volume * 0.3, this.context?.currentTime ?? 0); }
    catch { /* A closed device must not interrupt preferences or gameplay. */ }
  }

  play(cue: CardPlayCue): void {
    this.playScore(cue.id, () => buildBattleAudioPlan(cue));
  }

  playFeedback(cue: BattleFeedbackCue): void {
    this.playScore(`feedback:${cue.id}`, () => buildBattleFeedbackAudioPlan(cue));
  }

  private playScore(id: string, buildPlan: () => BattleAudioNote[]): void {
    if (this.disposed || this.played.has(id)) return;
    // Remember skipped receipts too: resuming audio never replays old combat.
    this.played.add(id);
    if (this.played.size > MAX_REMEMBERED_CUES) this.played.delete(this.played.values().next().value!);
    if (!this.audible() || !this.context || this.context.state !== 'running' || !this.master) return;
    try {
      const start = this.context.currentTime;
      for (const note of buildPlan()) this.renderNote(note, start);
    } catch { this.cancel(); }
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const context = this.context!;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
    const samples = buffer.getChannelData(0);
    // Deterministic texture does not consume gameplay or global random sources.
    let seed = 74651;
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[index] = (seed / 0x100000000) * 2 - 1;
    }
    this.noise = buffer;
    return buffer;
  }

  private renderNote(note: BattleAudioNote, base: number): void {
    const context = this.context!, master = this.master!;
    while (this.voices.size >= MAX_BATTLE_AUDIO_VOICES) this.releaseVoice(this.voices.values().next().value!, true);
    const nodes: AudioNode[] = [];
    let voice: Voice | null = null;
    try {
      const source = note.type === 'noise' ? context.createBufferSource() : context.createOscillator();
      nodes.push(source);
      voice = { source, nodes };
      this.voices.add(voice);
      source.onended = () => this.releaseVoice(voice!, false);
      const gain = context.createGain();
      nodes.push(gain);
      const start = base + note.offsetMs / 1000, end = start + note.durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, note.volume), start + Math.min(0.008, note.durationMs / 5000));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      if (note.type === 'noise') {
        const noise = source as AudioBufferSourceNode;
        noise.buffer = this.noiseBuffer();
        const filter = context.createBiquadFilter();
        nodes.push(filter);
        filter.type = 'bandpass';
        filter.Q.value = 0.7;
        filter.frequency.setValueAtTime(note.frequency, start);
        filter.frequency.exponentialRampToValueAtTime(note.frequencyEnd, end);
        noise.connect(filter);
        filter.connect(gain);
      } else {
        const oscillator = source as OscillatorNode;
        oscillator.type = note.type;
        oscillator.frequency.setValueAtTime(note.frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(note.frequencyEnd, end);
        oscillator.connect(gain);
      }
      gain.connect(master);
      source.start(start);
      source.stop(end + 0.01);
    } catch (error) {
      if (voice) this.releaseVoice(voice, true);
      else for (const node of nodes) { try { node.disconnect(); } catch { /* Partially created nodes can already be detached. */ } }
      throw error;
    }
  }

  private releaseVoice(voice: Voice, stop: boolean): void {
    this.voices.delete(voice);
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(); } catch { /* Sources may already be stopped. */ } }
    for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Device closure can detach nodes first. */ } }
  }

  cancel(): void { for (const voice of [...this.voices]) this.releaseVoice(voice, true); }

  /** Development diagnostics describe this device only; nothing is persisted. */
  inspect(): { state: AudioContextState | 'idle'; activeVoices: number } {
    return { state: this.context?.state ?? 'idle', activeVoices: this.voices.size };
  }

  private releaseContext(): void {
    this.cancel();
    try { this.master?.disconnect(); } catch { /* No live output remains. */ }
    try { this.compressor?.disconnect(); } catch { /* No live output remains. */ }
    try { if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {}); } catch { /* Device teardown is best effort. */ }
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noise = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visibilityDocument?.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.releaseContext();
    this.played.clear();
  }
}
