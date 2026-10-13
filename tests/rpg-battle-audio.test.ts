import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARDS } from '../src/rpg/cards';
import { CARD_PLAY_IMPACT_MS, type CardPlayCue } from '../src/rpg/card-play-effects';
import { AUDIO_PREFERENCES_KEY, BattleAudioPlayer, buildBattleAudioPlan, MAX_BATTLE_AUDIO_VOICES, readBattleAudioPreferences, writeBattleAudioPreferences } from '../src/rpg/battle-audio';

function cue(overrides: Partial<CardPlayCue> = {}): CardPlayCue {
  return {
    id: 'life:seed:1', lifeId: 'life', encounterId: 'encounter', battleSeed: 123, turn: 1,
    cardId: 'fire-1', cardName: '火弹', school: 'fire', color: '#ce6650', upgraded: false, all: false, durationMs: 1100,
    effect: { damage: 20 }, targets: [{ uid: 'enemy:1', index: 0, damage: 20, absorbed: 0, burn: 0, weak: 0, vulnerable: 0, defeated: false }],
    hero: { block: 0, heal: 0, cleanse: 0, draw: 0, energy: 0 }, ...overrides,
  };
}

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeSource extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  buffer: unknown = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { frequency = new FakeParam(); Q = new FakeParam(); type = ''; }
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam();
}
class FakeContext {
  static instances: FakeContext[] = [];
  static initialState = 'running';
  static failConstructor = false;
  state = FakeContext.initialState;
  currentTime = 12;
  sampleRate = 1000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  compressors: FakeCompressor[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createGain = vi.fn(() => { const node = new FakeGain(); this.gains.push(node); return node; });
  createOscillator = vi.fn(() => this.createSource());
  createBufferSource = vi.fn(() => this.createSource());
  createBiquadFilter = vi.fn(() => { const node = new FakeFilter(); this.filters.push(node); return node; });
  createDynamicsCompressor = vi.fn(() => { const node = new FakeCompressor(); this.compressors.push(node); return node; });
  createBuffer = vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }));
  constructor() {
    if (FakeContext.failConstructor) throw new Error('Audio device unavailable');
    FakeContext.instances.push(this);
  }
  private createSource() { const source = new FakeSource(); this.sources.push(source); return source; }
}

const memory = new Map<string, string>();
const storage = { getItem: vi.fn((key: string) => memory.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { memory.set(key, value); }) };
let visibility: { hidden: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let visibilityHandlers: Set<() => void>;
const players: BattleAudioPlayer[] = [];
function player(preferences = { enabled: true, volume: 0.55 }) {
  const instance = new BattleAudioPlayer(preferences);
  players.push(instance);
  return instance;
}
function context() { return FakeContext.instances.at(-1)!; }
function hide() { visibility.hidden = true; for (const callback of visibilityHandlers) callback(); }

beforeEach(() => {
  vi.restoreAllMocks();
  memory.clear(); storage.getItem.mockClear(); storage.setItem.mockClear();
  FakeContext.instances = []; FakeContext.initialState = 'running'; FakeContext.failConstructor = false;
  visibilityHandlers = new Set();
  visibility = {
    hidden: false,
    addEventListener: vi.fn((_type: string, callback: () => void) => { visibilityHandlers.add(callback); }),
    removeEventListener: vi.fn((_type: string, callback: () => void) => { visibilityHandlers.delete(callback); }),
  };
  vi.stubGlobal('window', { localStorage: storage, AudioContext: FakeContext });
  vi.stubGlobal('document', visibility);
});
afterEach(() => { for (const instance of players.splice(0)) instance.dispose(); vi.unstubAllGlobals(); });

describe('确定性流派与真实结算音效计划', () => {
  it.each(CARDS)('$id 的出牌音覆盖当前目录，计划有限且不改动回执', card => {
    const receipt = cue({ cardId: card.id, cardName: card.name, school: card.school, actor: card.actor, effect: card.effect });
    const snapshot = structuredClone(receipt), random = vi.spyOn(Math, 'random');
    const plan = buildBattleAudioPlan(receipt);
    expect(plan.filter(note => note.kind === 'cast')).toHaveLength(2);
    expect(plan[0].offsetMs).toBe(0);
    expect(plan.length).toBeLessThanOrEqual(14);
    for (const note of plan) {
      expect(note.durationMs).toBeGreaterThan(0); expect(note.durationMs).toBeLessThanOrEqual(270);
      expect(note.volume).toBeGreaterThan(0); expect(note.volume).toBeLessThan(0.4);
      expect(note.frequency).toBeGreaterThan(0); expect(note.frequencyEnd).toBeGreaterThan(0);
    }
    expect(plan).toEqual(buildBattleAudioPlan(receipt));
    expect(receipt).toEqual(snapshot); expect(random).not.toHaveBeenCalled();
  });

  it('十个流派都有可区分的施法音型', () => {
    const schools = [...new Set(CARDS.map(card => card.school))];
    expect(schools).toHaveLength(10);
    expect(new Set(schools.map(school => JSON.stringify(buildBattleAudioPlan(cue({ school })).filter(note => note.kind === 'cast')))).size).toBe(10);
  });
  it('身份音色按人物区分，联盟牌不落入自建身份音色', () => {
    const identities = ['custom', 'rudeus', 'eris', 'sylphie', 'roxy'] as const;
    const signatures = identities.map(actor => JSON.stringify(buildBattleAudioPlan(cue({ school: 'identity', actor })).filter(note => note.kind === 'cast')));
    signatures.push(JSON.stringify(buildBattleAudioPlan(cue({ school: 'identity', cardId: 'identity-alliance' })).filter(note => note.kind === 'cast')));
    expect(new Set(signatures).size).toBe(6);
  });
  it('强化牌提升施法强调但不修改实际受击数据', () => {
    const normal = buildBattleAudioPlan(cue()), upgraded = buildBattleAudioPlan(cue({ upgraded: true }));
    expect(upgraded[0].frequency).toBeGreaterThan(normal[0].frequency);
    expect(upgraded[0].volume).toBeGreaterThan(normal[0].volume);
    expect(upgraded.filter(note => note.kind === 'hit').map(note => note.offsetMs)).toEqual([CARD_PLAY_IMPACT_MS, CARD_PLAY_IMPACT_MS]);
  });
  it('减少动画的短反馈即时命中，与静态结算数字同时出现', () => {
    const receipt = cue({ durationMs: 240, hero: { heal: 8, cleanse: 0, block: 20, draw: 1, energy: 2 } });
    receipt.targets[0].absorbed = 12;
    const short = buildBattleAudioPlan(receipt);
    expect(short.filter(note => note.kind === 'cast').map(note => note.offsetMs)).toEqual([0, 22]);
    expect(short.filter(note => note.kind === 'hit').map(note => note.offsetMs)).toEqual([0, 0]);
    expect(short.find(note => note.kind === 'absorbed')!.offsetMs).toBe(0);
    expect(short.find(note => note.kind === 'block')!.offsetMs).toBe(0);
    expect(short.find(note => note.kind === 'heal')!.offsetMs).toBe(0);
    expect(buildBattleAudioPlan({ ...receipt, durationMs: 1100 }).filter(note => note.kind === 'hit').map(note => note.offsetMs)).toEqual([150, 150]);
  });
  it('实际生命伤害为零时只播放吸收声，不制造受击或击杀音', () => {
    const receipt = cue(); receipt.targets[0].damage = 0; receipt.targets[0].absorbed = 50;
    const plan = buildBattleAudioPlan(receipt);
    expect(plan.some(note => note.kind === 'hit' || note.kind === 'defeat')).toBe(false);
    expect(plan.filter(note => note.kind === 'absorbed')).toHaveLength(2);
  });
  it('状态攻击无需生命伤害也产生状态回声', () => {
    const receipt = cue({ effect: { weak: 2 } }); receipt.targets[0].damage = 0; receipt.targets[0].weak = 2;
    expect(buildBattleAudioPlan(receipt).map(note => note.kind)).toEqual(['cast', 'cast', 'status']);
  });
  it('全体攻击和多目标击杀各聚合一次，声部不会随敌人数叠加', () => {
    const receipt = cue({ all: true }); receipt.targets[0].defeated = true;
    receipt.targets = [0, 1, 2].map(index => ({ ...receipt.targets[0], uid: `enemy:${index}`, index }));
    const plan = buildBattleAudioPlan(receipt);
    expect(plan.filter(note => note.kind === 'hit')).toHaveLength(2);
    expect(plan.filter(note => note.kind === 'defeat')).toHaveLength(2);
    expect(plan.filter(note => note.kind === 'defeat').every(note => note.offsetMs > CARD_PLAY_IMPACT_MS)).toBe(true);
  });
  it('纯增益只有对应资源回声，满血 / 满手 / 回能无增量时不冒充收益', () => {
    const full = buildBattleAudioPlan(cue({ targets: [], effect: { heal: 20, draw: 3, energy: 2 } }));
    expect(full.map(note => note.kind)).toEqual(['cast', 'cast']);
    const active = buildBattleAudioPlan(cue({ targets: [], hero: { heal: 8, cleanse: 3, block: 20, draw: 1, energy: 2 } }));
    expect(active.some(note => note.kind === 'hit' || note.kind === 'absorbed' || note.kind === 'defeat')).toBe(false);
    expect(new Set(active.map(note => note.kind))).toEqual(new Set(['cast', 'block', 'heal', 'draw', 'energy']));
  });
  it('混合极端反馈有固定 14 个音符上限', () => {
    const receipt = cue({ upgraded: true, all: true, hero: { heal: 8, cleanse: 3, block: 20, draw: 1, energy: 2 } });
    Object.assign(receipt.targets[0], { absorbed: 10, burn: 3, defeated: true });
    expect(buildBattleAudioPlan(receipt)).toHaveLength(14);
  });
});

describe('独立声音偏好', () => {
  it('空偏好默认开启 55%，读写不触碰游戏存档', () => {
    expect(readBattleAudioPreferences()).toEqual({ enabled: true, volume: 0.55 });
    writeBattleAudioPreferences({ enabled: false, volume: 0.31 });
    expect(readBattleAudioPreferences()).toEqual({ enabled: false, volume: 0.31 });
    expect([...memory.keys()]).toEqual([AUDIO_PREFERENCES_KEY]);
  });
  it.each(['{', 'null', '[]', 'true', '{"enabled":"yes","volume":"loud"}', '{"volume":null}'])('损坏偏好 %s 安全返回默认值', value => {
    memory.set(AUDIO_PREFERENCES_KEY, value);
    expect(readBattleAudioPreferences()).toEqual({ enabled: true, volume: 0.55 });
  });
  it('有限音量限制在 0～1，非法数字回落默认值', () => {
    writeBattleAudioPreferences({ enabled: true, volume: -2 }); expect(readBattleAudioPreferences().volume).toBe(0);
    writeBattleAudioPreferences({ enabled: true, volume: 3 }); expect(readBattleAudioPreferences().volume).toBe(1);
    writeBattleAudioPreferences({ enabled: true, volume: NaN }); expect(readBattleAudioPreferences().volume).toBe(0.55);
  });
  it('存储不可用与无 window 环境均不抛异常', () => {
    storage.getItem.mockImplementationOnce(() => { throw new Error('blocked'); });
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota'); });
    expect(readBattleAudioPreferences()).toEqual({ enabled: true, volume: 0.55 });
    expect(() => writeBattleAudioPreferences({ enabled: false, volume: 0 })).not.toThrow();
    vi.stubGlobal('window', undefined);
    expect(readBattleAudioPreferences()).toEqual({ enabled: true, volume: 0.55 });
    expect(() => writeBattleAudioPreferences({ enabled: false, volume: 0 })).not.toThrow();
  });
});

describe('Web Audio 生命周期和浏览器失败降级', () => {
  it('prepare 前 play 不自行创建上下文，之后也不补播该回执', () => {
    const sound = player(); sound.play(cue()); expect(FakeContext.instances).toHaveLength(0);
    sound.prepare(); sound.play(cue()); expect(context().sources).toHaveLength(0);
    sound.play(cue({ id: 'new' })); expect(context().sources).toHaveLength(4);
  });
  it('在当前音频时钟同步排程施法与 150 ms 命中，不靠 JS 延迟定时器', () => {
    const sound = player(), timeout = vi.spyOn(globalThis, 'setTimeout'); sound.prepare(); sound.play(cue());
    expect(context().sources.map(source => source.start.mock.calls[0][0])).toEqual([12, 12.022, 12.15, 12.15]);
    expect(context().sources.every(source => source.stop.mock.calls[0][0] > source.start.mock.calls[0][0])).toBe(true);
    expect(timeout).not.toHaveBeenCalled(); expect(context().createBuffer).toHaveBeenCalledTimes(1);
    expect(context().compressors[0].ratio.value).toBe(6);
  });
  it('noise texture 不读取 Math.random，全体牌只有一个聚合音型', () => {
    const random = vi.spyOn(Math, 'random'), sound = player(); sound.prepare(); sound.play(cue({ all: true }));
    expect(random).not.toHaveBeenCalled(); expect(context().sources).toHaveLength(4);
  });
  it('相同回执只排程一次，保存重试不会重播声音', () => {
    const sound = player(); sound.prepare(); sound.play(cue()); sound.play(cue());
    expect(context().sources).toHaveLength(4);
  });
  it('静音和音量为零均不创建上下文，切回开启只为下一次出牌解锁', () => {
    const mute = player({ enabled: false, volume: 0.55 }), zero = player({ enabled: true, volume: 0 });
    mute.prepare(); mute.play(cue()); zero.prepare(); zero.play(cue());
    expect(FakeContext.instances).toHaveLength(0);
    mute.setPreferences({ enabled: true, volume: 0.55 }); mute.prepare(); mute.play(cue());
    expect(context().sources).toHaveLength(0);
    mute.play(cue({ id: 'after-unmute' })); expect(context().sources).toHaveLength(4);
  });
  it.each([{ enabled: false, volume: 0.55 }, { enabled: true, volume: 0 }])('设置 $enabled / $volume 立即停止已排程声音', preferences => {
    const sound = player(); sound.prepare(); sound.play(cue()); const audio = context();
    sound.setPreferences(preferences);
    for (const source of audio.sources) { expect(source.stop).toHaveBeenCalledTimes(2); expect(source.disconnect).toHaveBeenCalledOnce(); expect(source.onended).toBeNull(); }
  });
  it('实时音量调整作用于主增益，不重新创建或重播声部', () => {
    const sound = player(); sound.prepare(); sound.play(cue()); sound.setPreferences({ enabled: true, volume: 0.2 });
    expect(context().gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.06, 12);
    expect(context().sources).toHaveLength(4); expect(FakeContext.instances).toHaveLength(1);
  });
  it('prepare 同步请求 resume；异步 autoplay 拒绝安全静默且不补播', async () => {
    FakeContext.initialState = 'suspended'; const sound = player(); sound.prepare();
    expect(context().resume).toHaveBeenCalledOnce();
    context().state = 'suspended'; context().resume.mockRejectedValueOnce(new Error('autoplay'));
    sound.prepare(); sound.play(cue()); await Promise.resolve();
    context().state = 'running'; sound.play(cue()); expect(context().sources).toHaveLength(0);
    sound.play(cue({ id: 'new-after-unlock' })); expect(context().sources).toHaveLength(4);
  });
  it('resume 未完成时不积压声音，成功解锁后只有新回执可发声', async () => {
    FakeContext.initialState = 'suspended'; const sound = player(); sound.prepare();
    context().state = 'suspended';
    let finish!: () => void;
    context().resume.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    sound.prepare(); sound.play(cue()); finish(); await Promise.resolve(); context().state = 'running';
    sound.play(cue()); expect(context().sources).toHaveLength(0);
    sound.play(cue({ id: 'fresh' })); expect(context().sources).toHaveLength(4);
  });
  it('后台页面立即 cancel，后台回执不会切回页面后再播放', () => {
    const sound = player(); sound.prepare(); sound.play(cue()); const audio = context();
    hide(); for (const source of audio.sources) expect(source.disconnect).toHaveBeenCalledOnce();
    sound.play(cue({ id: 'hidden' })); expect(audio.sources).toHaveLength(4);
    visibility.hidden = false; sound.play(cue({ id: 'hidden' })); expect(audio.sources).toHaveLength(4);
    sound.play(cue({ id: 'visible' })); expect(audio.sources).toHaveLength(8);
  });
  it('页面已隐藏时 prepare 不创建声音设备', () => {
    visibility.hidden = true; player().prepare(); expect(FakeContext.instances).toHaveLength(0);
  });
  it('自然播放结束立即解绑并断开节点；cancel 不重复停止已结束声部', () => {
    const sound = player(); sound.prepare(); sound.play(cue()); const audio = context();
    for (const source of audio.sources) source.onended?.();
    sound.cancel();
    for (const source of audio.sources) { expect(source.stop).toHaveBeenCalledOnce(); expect(source.disconnect).toHaveBeenCalledOnce(); }
    expect(audio.gains.slice(1).every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(audio.filters.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('连续出牌保持 32 个声部上限，优先释放最旧声部', () => {
    const sound = player(); sound.prepare();
    for (let index = 0; index < 30; index++) sound.play(cue({ id: `rapid:${index}` }));
    const audio = context();
    expect(audio.sources.filter(source => source.onended !== null)).toHaveLength(MAX_BATTLE_AUDIO_VOICES);
    expect(audio.sources[0].disconnect).toHaveBeenCalledOnce();
    sound.cancel(); expect(audio.sources.every(source => source.onended === null)).toBe(true);
  });
  it('去重记录限制 128 个标识，近期回执仍去重', () => {
    const sound = player(); sound.prepare();
    for (let index = 0; index < 129; index++) sound.play(cue({ id: `recent:${index}` }));
    const audio = context(), count = audio.sources.length;
    sound.play(cue({ id: 'recent:128' })); expect(audio.sources).toHaveLength(count);
    sound.play(cue({ id: 'recent:0' })); expect(audio.sources).toHaveLength(count + 4);
  });
  it('AudioContext 缺失或创建失败时 prepare / play 均不抛错', () => {
    const sound = player(); vi.stubGlobal('window', { localStorage: storage });
    expect(() => sound.prepare()).not.toThrow(); expect(() => sound.play(cue())).not.toThrow();
    vi.stubGlobal('window', { localStorage: storage, AudioContext: FakeContext }); FakeContext.failConstructor = true;
    expect(() => sound.prepare()).not.toThrow(); expect(FakeContext.instances).toHaveLength(0);
  });
  it('支持只有 webkitAudioContext 的浏览器', () => {
    vi.stubGlobal('window', { localStorage: storage, webkitAudioContext: FakeContext });
    const sound = player(); sound.prepare(); sound.play(cue()); expect(context().sources).toHaveLength(4);
  });
  it('创建主输出失败时关闭部分上下文，不留下设备或后台声源', () => {
    // Fail immediately after creating the device using its graph factory.
    const BrokenContext = class extends FakeContext { override createDynamicsCompressor = vi.fn(() => { throw new Error('device graph'); }); };
    vi.stubGlobal('window', { localStorage: storage, AudioContext: BrokenContext });
    expect(() => player().prepare()).not.toThrow(); expect(context().close).toHaveBeenCalledOnce();
    expect(context().gains[0].disconnect).toHaveBeenCalledOnce();
  });
  it('inspect 只报告设备状态和存活声部，不创建声音设备或改动偏好', () => {
    const sound = player(); expect(sound.inspect()).toEqual({ state: 'idle', activeVoices: 0 });
    sound.prepare(); expect(sound.inspect()).toEqual({ state: 'running', activeVoices: 0 });
    sound.play(cue()); expect(sound.inspect()).toEqual({ state: 'running', activeVoices: 4 });
    sound.cancel(); expect(sound.inspect()).toEqual({ state: 'running', activeVoices: 0 });
    sound.dispose(); expect(sound.inspect()).toEqual({ state: 'idle', activeVoices: 0 });
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('设备在外部关闭后重新 prepare 清理旧图和噪声缓存', () => {
    const sound = player(); sound.prepare(); sound.play(cue()); const old = context(); old.state = 'closed';
    sound.prepare(); sound.play(cue({ id: 'new-device' }));
    expect(FakeContext.instances).toHaveLength(2);
    expect(old.sources.every(source => source.disconnect.mock.calls.length === 1)).toBe(true);
    expect(old.gains[0].disconnect).toHaveBeenCalledOnce();
    expect(context().createBuffer).toHaveBeenCalledOnce();
    expect(sound.inspect()).toEqual({ state: 'running', activeVoices: 4 });
  });
  it('渲染中途失败立即清理之前排程和部分创建的声部，游戏继续', () => {
    const sound = player(); sound.prepare(); const audio = context();
    audio.createBiquadFilter.mockImplementationOnce(() => { throw new Error('filter failure'); });
    expect(() => sound.play(cue())).not.toThrow();
    expect(audio.sources).toHaveLength(2);
    expect(audio.sources.every(source => source.disconnect.mock.calls.length === 1 && source.onended === null)).toBe(true);
    expect(audio.gains.slice(1).every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('关闭失败与节点 stop / disconnect 失败仍能卸载且禁止再发声', async () => {
    const sound = player(); sound.prepare(); sound.play(cue()); const audio = context();
    audio.close.mockRejectedValueOnce(new Error('close failure'));
    audio.sources[0].stop.mockImplementationOnce(() => { throw new Error('already stopped'); });
    audio.sources[0].disconnect.mockImplementationOnce(() => { throw new Error('detached'); });
    expect(() => sound.dispose()).not.toThrow(); await Promise.resolve();
    sound.prepare(); sound.play(cue({ id: 'after-dispose' })); sound.dispose();
    expect(audio.close).toHaveBeenCalledOnce(); expect(audio.sources).toHaveLength(4);
    expect(visibility.removeEventListener).toHaveBeenCalledOnce(); expect(visibilityHandlers.size).toBe(0);
    expect(audio.gains[0].disconnect).toHaveBeenCalledOnce(); expect(audio.compressors[0].disconnect).toHaveBeenCalledOnce();
  });
  it('无 document 的服务端环境保持惰性且可卸载', () => {
    vi.stubGlobal('document', undefined); vi.stubGlobal('window', undefined);
    const sound = player(); expect(() => sound.prepare()).not.toThrow(); expect(() => sound.play(cue())).not.toThrow();
    expect(() => sound.dispose()).not.toThrow(); expect(FakeContext.instances).toHaveLength(0);
  });
});
