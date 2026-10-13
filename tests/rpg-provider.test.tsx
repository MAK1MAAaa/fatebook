import type { ReactElement } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import RpgProvider from '../src/components/rpg/RpgProvider';
import { createCharacter } from '../src/game/characters';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { CARD_BY_ID } from '../src/rpg/cards';
import { cardFor } from '../src/rpg/rulesets';
import { CARD_PLAY_DURATION_MS, MAX_CARD_PLAY_CUES } from '../src/rpg/card-play-effects';
import { loadRpgEnvelope, listRpgSaves, persistRpg, STORAGE_KEY, validateRpg } from '../src/rpg/storage';
import type { RpgStore } from '../src/rpg/context';
import type { GameAction, RpgState } from '../src/rpg/types';
const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: new Map<
    number,
    { deps?: readonly unknown[]; cleanup?: () => void }
  >(),
  scheduled: [] as (() => void)[],
  pathname: '/story/async-battle',
  navigate: vi.fn(),
  lock: vi.fn(),
}));
const audio = vi.hoisted(() => ({
  preferences: { enabled: true, volume: 0.65 },
  prepare: vi.fn(),
  play: vi.fn(),
  playFeedback: vi.fn(),
  cancel: vi.fn(),
  setEnabled: vi.fn(),
  setVolume: vi.fn(),
}));

// A minimal hook host lets these tests exercise the provider's real async actions
// without adding a DOM renderer or a second testing dependency.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const index = runtime.cursor++;
      if (runtime.slots.length <= index) {
        runtime.slots[index] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      }
      return [
        runtime.slots[index] as T,
        (value: T | ((previous: T) => T)) => {
          runtime.slots[index] =
            typeof value === "function"
              ? (value as (previous: T) => T)(runtime.slots[index] as T)
              : value;
        },
      ];
    },
    useRef<T>(initial: T) {
      const index = runtime.cursor++;
      if (runtime.slots.length <= index)
        runtime.slots[index] = { current: initial };
      return runtime.slots[index] as { current: T };
    },
    useEffect(callback: () => void | (() => void), deps?: readonly unknown[]) {
      const index = runtime.cursor++;
      const previous = runtime.effects.get(index);
      if (
        previous &&
        deps &&
        previous.deps &&
        deps.length === previous.deps.length &&
        deps.every((value, position) =>
          Object.is(value, previous.deps?.[position]),
        )
      )
        return;
      runtime.scheduled.push(() => {
        previous?.cleanup?.();
        const cleanup = callback();
        runtime.effects.set(index, { deps, cleanup: cleanup || undefined });
      });
    },
  };
});
vi.mock("react-router", () => ({ useNavigate: () => runtime.navigate, useLocation: () => ({ pathname: runtime.pathname }) }));
vi.mock("../src/game/save-lock", () => ({
  withSaveLock: (operation: () => unknown) => runtime.lock(operation),
}));
vi.mock('../src/hooks/use-battle-audio', () => ({
  useBattleAudio: () => audio,
}));

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.values.size;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("quota");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
}

let storage: MemoryStorage;
let listeners: Map<string, EventListenerOrEventListenerObject>;
const character = () => createCharacter("custom", { budget: 0 });

function render(): RpgStore {
  runtime.cursor = 0;
  const element = RpgProvider({ children: null }) as ReactElement<{
    value: RpgStore;
  }>;
  runtime.scheduled.splice(0).forEach((effect) => effect());
  return element.props.value;
}

function delayNextLock() {
  let release: () => void = () => {
    throw new Error("没有等待中的锁");
  };
  runtime.lock.mockImplementationOnce(
    (operation: () => unknown) =>
      new Promise((resolve, reject) => {
        release = () => {
          try {
            resolve(operation());
          } catch (error) {
            reject(error);
          }
        };
      }),
  );
  return () => release();
}

beforeEach(() => {
  runtime.slots = [];
  runtime.cursor = 0;
  runtime.effects.clear();
  runtime.scheduled = [];
  runtime.pathname = '/story/async-battle';
  runtime.navigate.mockReset();
  audio.prepare.mockReset();
  audio.play.mockReset();
  audio.playFeedback.mockReset();
  audio.cancel.mockReset();
  audio.setEnabled.mockReset();
  audio.setVolume.mockReset();
  runtime.lock
    .mockReset()
    .mockImplementation(async (operation: () => unknown) => operation());
  storage = new MemoryStorage();
  listeners = new Map();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  });
});

afterEach(() => {
  runtime.effects.forEach((effect) => effect.cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});


function ready() {
  let state = createRpg(character(), 'async-battle');
  persistRpg(state, null, 0);
  for (const action of [{type:'event',eventId:'rpg-learning',choiceId:'magic'}, {type:'acceptQuest',questId:'q1-1'}, {type:'startBattle',encounterId:'c1-main-1'}] as GameAction[]) {
    const next = resolveAction(state, action, state.revision); persistRpg(next, action, state.revision); state=next;
  }
  return state;
}
const saved = () => listRpgSaves(loadRpgEnvelope())[0].state!;

function winningCardFixture() {
  const state = ready(), battle = state.battle!;
  // Seed a valid near-victory snapshot at the test storage boundary. The play
  // and subsequent save still run through the production resolver/validator.
  battle.enemies.forEach((enemy, index) => { enemy.hp = index === 0 ? 1 : 0; enemy.block = 0; });
  const uid = state.collection.find(card => card.cardId === 'neutral-1')!.uid;
  if (!battle.hand.includes(uid)) {
    const replaced = battle.hand.shift()!;
    battle.drawPile = battle.drawPile.filter(card => card !== uid);
    battle.drawPile.push(replaced);
    battle.hand.push(uid);
  }
  validateRpg(state, state.id);
  const envelope = loadRpgEnvelope(); envelope.saves[state.id] = state;
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  return { state: saved(), uid };
}

function remount() {
  runtime.effects.forEach(effect => effect.cleanup?.());
  runtime.slots = []; runtime.effects.clear(); runtime.scheduled = [];
  return render();
}

function expectSameBattle(actual: RpgState, expected: RpgState) {
  expect(actual.revision).toBe(expected.revision);
  expect(actual.scene).toBe(expected.scene);
  expect(actual.battle).toEqual(expected.battle);
  expect(actual.reward).toEqual(expected.reward);
}

describe('出牌音效只跟随成功保存', () => {
  it('在等待保存锁之前同步解锁声音，落盘后才播放同一份真实结算反馈', async () => {
    const state = ready();
    const release = delayNextLock();
    const action = render().dispatch(state, {
      type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0',
    });
    expect(audio.prepare).toHaveBeenCalledTimes(1);
    expect(audio.prepare.mock.invocationCallOrder[0]).toBeLessThan(runtime.lock.mock.invocationCallOrder[0]);
    expect(audio.play).not.toHaveBeenCalled();
    expect(saved().battle!.played).toBe(0);
    release();
    expect(await action).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith(render().cardPlays![0]);
    expect(saved().battle!.played).toBe(1);
    expect(audio.play.mock.invocationCallOrder[0]).toBeGreaterThan(runtime.lock.mock.invocationCallOrder[0]);
  });

  it('保存失败保持静音，重试成功只播放一次且不重复结算', async () => {
    const state = ready();
    storage.failWrites = true;
    expect(await render().dispatch(state, {
      type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0',
    })).toBe(false);
    expect(audio.prepare).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();
    expect(saved().battle!.played).toBe(0);
    storage.failWrites = false;
    await render().retry();
    expect(audio.prepare).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith(render().cardPlays![0]);
    expect(saved().battle!.played).toBe(1);
    await render().retry();
    expect(audio.prepare).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(saved().battle!.played).toBe(1);
  });

  it('双击等待中的手牌不会再次解锁或重复播放音效', async () => {
    const state = ready();
    const store = render();
    const release = delayNextLock();
    const action: GameAction = { type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0' };
    const first = store.dispatch(state, action);
    expect(await store.dispatch(state, action)).toBe(false);
    expect(audio.prepare).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();
    release();
    expect(await first).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(saved().battle!.played).toBe(1);
  });

  it('结束回合只产生回合声音，非法动作与其他标签的出牌不制造新声音', async () => {
    let state = ready();
    expect(await render().dispatch(state, { type: 'playCard', uid: 'not-in-hand', target: 'enemy-0' })).toBe(false);
    expect(await render().dispatch(state, { type: 'endTurn' })).toBe(true);
    state = saved();
    const action: GameAction = { type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0' };
    persistRpg(resolveAction(state, action, state.revision), action, state.revision);
    (listeners.get('storage') as EventListener)({ key: STORAGE_KEY } as StorageEvent);
    expect(audio.prepare).toHaveBeenCalledTimes(1);
    expect(audio.playFeedback).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();
    expect(saved().battle!.played).toBe(1);
  });

  it('保存冲突不播放被拒绝的出牌，重新挂载不回放已保存动作', async () => {
    const state = ready();
    const release = delayNextLock();
    const action: GameAction = { type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0' };
    const pending = render().dispatch(state, action);
    persistRpg(resolveAction(state, action, state.revision), action, state.revision);
    release();
    expect(await pending).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
    await render().retry();
    expect(audio.prepare).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();
    runtime.effects.forEach(effect => effect.cleanup?.());
    runtime.slots = [];
    runtime.effects.clear();
    expect(render().cardPlays).toEqual([]);
    expect(saved().battle!.played).toBe(1);
    expect(audio.prepare).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();
  });
});

describe('出牌特效只跟随成功保存', () => {
  it('等待锁期间没有特效，成功后只出现一次且按时清理', async () => {
    vi.useFakeTimers();
    const state = ready(), uid = state.battle!.hand[0], release = delayNextLock();
    const action = render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' });
    expect(render().cardPlays).toEqual([]);
    release(); expect(await action).toBe(true);
    const cue = render().cardPlays![0];
    expect(cue.cardId).toBe(state.collection.find(card => card.uid === uid)!.cardId);
    expect(render().cardPlays).toHaveLength(1); expect(saved().battle!.played).toBe(1);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).saves[state.id].cardPlays).toBeUndefined();
    vi.advanceTimersByTime(CARD_PLAY_DURATION_MS);
    expect(render().cardPlays).toEqual([]); expect(saved().battle!.played).toBe(1);
  });

  it('写入失败不播放，重试成功再播放且不重新出牌', async () => {
    vi.useFakeTimers();
    const state = ready(), uid = state.battle!.hand[0]; storage.failWrites = true;
    expect(await render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' })).toBe(false);
    expect(render().cardPlays).toEqual([]); expect(saved().battle!.played).toBe(0);
    storage.failWrites = false; await render().retry();
    const cueId = render().cardPlays![0].id;
    await render().retry();
    expect(render().cardPlays!.map(cue => cue.id)).toEqual([cueId]);
    expect(saved().battle!.played).toBe(1);
  });

  it('非法出牌与其他标签的更新不制造施放反馈', async () => {
    const state = ready();
    expect(await render().dispatch(state, { type: 'playCard', uid: 'not-in-hand', target: 'enemy-0' })).toBe(false);
    expect(render().cardPlays).toEqual([]);
    const action: GameAction = { type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0' };
    persistRpg(resolveAction(state, action, state.revision), action, state.revision);
    (listeners.get('storage') as EventListener)({ key: STORAGE_KEY } as StorageEvent);
    expect(render().cardPlays).toEqual([]); expect(saved().battle!.played).toBe(1);
  });

  it('重新挂载不重播已存战斗日志，并清理未完成特效计时器', async () => {
    vi.useFakeTimers();
    const state = ready(); await render().dispatch(state, { type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0' });
    expect(render().cardPlays).toHaveLength(1);
    runtime.effects.forEach(effect => effect.cleanup?.());
    expect(vi.getTimerCount()).toBe(0);
    runtime.slots = []; runtime.effects.clear();
    expect(render().cardPlays).toEqual([]); expect(saved().battle!.played).toBe(1);
  });

  it('减少动画偏好使用短反馈，快速连续出牌队列有上限', async () => {
    vi.useFakeTimers();
    Object.assign(window, { matchMedia: () => ({ matches: true }) });
    let state = ready();
    for (let count = 0; count < MAX_CARD_PLAY_CUES + 1; count++) {
      let uid = state.battle!.hand.filter(uid => cardFor(state, state.collection.find(card => card.uid === uid)!.cardId).cost <= state.battle!.energy)
        .sort((left, right) => Number(!!cardFor(state, state.collection.find(card => card.uid === left)!.cardId).effect.damage) - Number(!!cardFor(state, state.collection.find(card => card.uid === right)!.cardId).effect.damage))[0];
      if (!uid) {
        expect(await render().dispatch(state, { type: 'endTurn' })).toBe(true); state = saved();
        uid = state.battle!.hand.find(uid => cardFor(state, state.collection.find(card => card.uid === uid)!.cardId).cost <= state.battle!.energy)!;
      }
      expect(await render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' })).toBe(true); state = saved();
    }
    expect(render().cardPlays!.length).toBeGreaterThan(0);
    expect(render().cardPlays!.length).toBeLessThanOrEqual(MAX_CARD_PLAY_CUES);
    expect(render().cardPlays!.every(cue => cue.durationMs === 240)).toBe(true);
    vi.advanceTimersByTime(240); expect(render().cardPlays).toEqual([]);
  });
});

describe('敌人回合与胜负反馈只跟随成功保存', () => {
  it('结束回合等待保存锁期间只解锁设备，落盘后才发布真实回合回执', async () => {
    vi.useFakeTimers();
    const state = ready(), release = delayNextLock();
    const pending = render().dispatch(state, { type: 'endTurn' });
    expect(audio.prepare).toHaveBeenCalledOnce();
    expect(audio.prepare.mock.invocationCallOrder[0]).toBeLessThan(runtime.lock.mock.invocationCallOrder[0]);
    expect(render().battleFeedback).toEqual([]);
    expect(audio.playFeedback).not.toHaveBeenCalled(); expect(audio.cancel).not.toHaveBeenCalled();
    expect(saved().battle!.turn).toBe(1);
    release(); expect(await pending).toBe(true);
    const feedback = render().battleFeedback![0];
    expect(feedback.events.length).toBeGreaterThan(0);
    expect(feedback.sourceTurn).toBe(1); expect(feedback.turn).toBe(2);
    expect(feedback.revision).toBe(saved().revision);
    expect(audio.playFeedback).toHaveBeenCalledOnce(); expect(audio.playFeedback).toHaveBeenCalledWith(feedback);
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.playFeedback.mock.invocationCallOrder[0]).toBeGreaterThan(runtime.lock.mock.invocationCallOrder[0]);
    expect(saved().battle!.turn).toBe(2);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).saves[state.id].battleFeedback).toBeUndefined();
    vi.advanceTimersByTime(feedback.durationMs); expect(render().battleFeedback).toEqual([]);
  });

  it('敌方回合保存失败不播放，重试只发布一次且保留原结算手牌与生命', async () => {
    vi.useFakeTimers();
    const state = ready(), action: GameAction = { type: 'endTurn' };
    const expected = resolveAction(state, action, state.revision);
    storage.failWrites = true;
    expect(await render().dispatch(state, action)).toBe(false);
    expect(render().battleFeedback).toEqual([]); expect(audio.playFeedback).not.toHaveBeenCalled();
    expect(audio.cancel).not.toHaveBeenCalled(); expect(saved().battle!.turn).toBe(1);
    expectSameBattle(render().pending!, expected);
    storage.failWrites = false; await render().retry();
    expectSameBattle(saved(), expected);
    const feedback = render().battleFeedback![0];
    expect(audio.prepare).toHaveBeenCalledTimes(2);
    expect(audio.playFeedback).toHaveBeenCalledOnce(); expect(audio.cancel).toHaveBeenCalledOnce();
    await render().retry();
    expectSameBattle(saved(), expected);
    expect(render().battleFeedback!.map(cue => cue.id)).toEqual([feedback.id]);
    expect(audio.prepare).toHaveBeenCalledTimes(2); expect(audio.playFeedback).toHaveBeenCalledOnce();
  });

  it('双击等待中的结束回合不会重复解锁、结算或发布反馈', async () => {
    const state = ready(), store = render(), release = delayNextLock();
    const first = store.dispatch(state, { type: 'endTurn' });
    expect(await store.dispatch(state, { type: 'endTurn' })).toBe(false);
    expect(audio.prepare).toHaveBeenCalledOnce(); expect(audio.playFeedback).not.toHaveBeenCalled();
    release(); expect(await first).toBe(true);
    expect(saved().battle!.turn).toBe(2); expect(audio.playFeedback).toHaveBeenCalledOnce();
    expect(render().battleFeedback).toHaveLength(1);
  });

  it('其他标签先保存回合时，拒绝旧提交而不播放敌人或终局音', async () => {
    const state = ready(), action: GameAction = { type: 'endTurn' }, release = delayNextLock();
    const pending = render().dispatch(state, action);
    persistRpg(resolveAction(state, action, state.revision), action, state.revision);
    release(); expect(await pending).toBe(false);
    expect(saved().battle!.turn).toBe(2); expect(render().battleFeedback).toEqual([]);
    expect(audio.playFeedback).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled();
    await render().retry(); expect(audio.prepare).toHaveBeenCalledOnce();
    expect(audio.playFeedback).not.toHaveBeenCalled();
  });

  it('正式出牌致胜后同时发布原卡牌命中与胜利反馈，保留最后一击音', async () => {
    vi.useFakeTimers();
    const { state, uid } = winningCardFixture();
    expect(await render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' })).toBe(true);
    const store = render(), card = store.cardPlays![0], feedback = store.battleFeedback![0];
    expect(saved().scene).toBe('reward'); expect(saved().battle!.result).toBe('won');
    expect(saved().battle!.played).toBe(1); expect(card.targets[0].damage).toBe(1);
    expect(feedback.events).toEqual([]); expect(feedback.outcome!.result).toBe('won');
    expect(audio.play).toHaveBeenCalledOnce(); expect(audio.play).toHaveBeenCalledWith(card);
    expect(audio.playFeedback).toHaveBeenCalledOnce(); expect(audio.playFeedback).toHaveBeenCalledWith(feedback);
    expect(audio.cancel).not.toHaveBeenCalled();
    expect(audio.play.mock.invocationCallOrder[0]).toBeLessThan(audio.playFeedback.mock.invocationCallOrder[0]);
    vi.advanceTimersByTime(CARD_PLAY_DURATION_MS);
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toHaveLength(1);
    vi.advanceTimersByTime(feedback.durationMs - CARD_PLAY_DURATION_MS);
    expect(render().battleFeedback).toEqual([]);
  });

  it('致胜保存失败暂不显示结果，重试后命中与胜利各播放一次', async () => {
    const { state, uid } = winningCardFixture(); storage.failWrites = true;
    expect(await render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' })).toBe(false);
    expect(saved().battle!.result).toBe('playing'); expect(render().pending!.battle!.result).toBe('won');
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toEqual([]);
    expect(audio.play).not.toHaveBeenCalled(); expect(audio.playFeedback).not.toHaveBeenCalled();
    storage.failWrites = false; await render().retry(); await render().retry();
    expect(saved().battle!.result).toBe('won'); expect(saved().battle!.played).toBe(1);
    expect(audio.play).toHaveBeenCalledOnce(); expect(audio.playFeedback).toHaveBeenCalledOnce();
    expect(render().cardPlays).toHaveLength(1); expect(render().battleFeedback).toHaveLength(1);
    expect(audio.cancel).not.toHaveBeenCalled();
  });

  it('减少动画的敌人回执使用 240 ms，所有事件即时显示并按时清理', async () => {
    vi.useFakeTimers(); Object.assign(window, { matchMedia: () => ({ matches: true }) });
    const state = ready(); expect(await render().dispatch(state, { type: 'endTurn' })).toBe(true);
    const feedback = render().battleFeedback![0];
    expect(feedback.durationMs).toBe(240);
    expect(feedback.events.every(event => event.offsetMs === 0 && event.impactMs === 0 && event.durationMs === 220)).toBe(true);
    expect(audio.playFeedback).toHaveBeenCalledWith(feedback);
    vi.advanceTimersByTime(239); expect(render().battleFeedback).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(render().battleFeedback).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });

  it('减少动画的致胜命中与结果都为短回执，保留真实最终生命', async () => {
    vi.useFakeTimers(); Object.assign(window, { matchMedia: () => ({ matches: true }) });
    const { state, uid } = winningCardFixture();
    expect(await render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' })).toBe(true);
    const feedback = render().battleFeedback![0];
    expect(render().cardPlays![0].durationMs).toBe(240); expect(feedback.durationMs).toBe(240);
    expect(feedback.outcome).toMatchObject({ result: 'won', offsetMs: 0, durationMs: 220 });
    expect(saved().battle!.enemies.every(enemy => enemy.hp === 0)).toBe(true);
    vi.advanceTimersByTime(240);
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('卸载清理所有尚未结束的反馈定时器，重新挂载不回放日志与回合', async () => {
    vi.useFakeTimers();
    const state = ready(); await render().dispatch(state, { type: 'endTurn' });
    expect(render().battleFeedback).toHaveLength(1); expect(vi.getTimerCount()).toBeGreaterThan(0);
    const persisted = saved(), store = remount();
    expect(vi.getTimerCount()).toBe(0); expect(store.battleFeedback).toEqual([]); expect(store.cardPlays).toEqual([]);
    expectSameBattle(listRpgSaves(store.envelope)[0].state!, persisted);
    expect(audio.prepare).toHaveBeenCalledOnce(); expect(audio.playFeedback).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000); expect(render().battleFeedback).toEqual([]);
  });

  it('storage 成功更新同时清空卡牌与终局回执并取消旧声音，重新挂载不重播', async () => {
    vi.useFakeTimers();
    const { state, uid } = winningCardFixture();
    await render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' });
    expect(render().cardPlays).toHaveLength(1); expect(render().battleFeedback).toHaveLength(1);
    const current = saved(), action: GameAction = { type: 'claimReward', cardId: null };
    persistRpg(resolveAction(current, action, current.revision), action, current.revision);
    (listeners.get('storage') as EventListener)({ key: STORAGE_KEY } as StorageEvent);
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toEqual([]);
    expect(audio.cancel).toHaveBeenCalledOnce(); expect(saved().scene).toBe('hub');
    const store = remount(); expect(store.cardPlays).toEqual([]); expect(store.battleFeedback).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(audio.prepare).toHaveBeenCalledOnce(); expect(audio.play).toHaveBeenCalledOnce(); expect(audio.playFeedback).toHaveBeenCalledOnce();
  });

  it('成功敌方回合清理上一张卡的视觉与尾音，取消发生在新回合播放前', async () => {
    vi.useFakeTimers();
    const state = ready();
    await render().dispatch(state, { type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0' });
    expect(render().cardPlays).toHaveLength(1); expect(audio.cancel).not.toHaveBeenCalled();
    const current = saved(), release = delayNextLock(), pending = render().dispatch(current, { type: 'endTurn' });
    expect(render().cardPlays).toHaveLength(1); expect(audio.cancel).not.toHaveBeenCalled();
    release(); expect(await pending).toBe(true);
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toHaveLength(1);
    expect(audio.play).toHaveBeenCalledOnce(); expect(audio.cancel).toHaveBeenCalledOnce();
    expect(audio.cancel.mock.invocationCallOrder[0]).toBeLessThan(audio.playFeedback.mock.invocationCallOrder[0]);
  });

  it('非战斗结束回合非法动作不解锁设备，也不发布任何战斗反馈', async () => {
    const state = createRpg(character(), 'not-in-battle'); persistRpg(state, null, 0);
    expect(await render().dispatch(state, { type: 'endTurn' })).toBe(false);
    expect(audio.prepare).not.toHaveBeenCalled(); expect(audio.playFeedback).not.toHaveBeenCalled();
    expect(render().battleFeedback).toEqual([]); expect(render().cardPlays).toEqual([]);
  });
});

describe('战斗路由变化清理反馈', () => {
  it('初次挂载与原路径重复渲染不额外取消声音或创建计时器', () => {
    vi.useFakeTimers(); ready();
    render(); render();
    expect(audio.cancel).not.toHaveBeenCalled(); expect(audio.prepare).not.toHaveBeenCalled();
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('离开致胜战场同时清理卡牌、结果、声音和计时器，返回不回放已存动作', async () => {
    vi.useFakeTimers(); const { state, uid } = winningCardFixture();
    await render().dispatch(state, { type: 'playCard', uid, target: 'enemy-0' });
    expect(render().cardPlays).toHaveLength(1); expect(render().battleFeedback).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(2); expect(audio.cancel).not.toHaveBeenCalled();
    const persisted = storage.getItem(STORAGE_KEY);
    runtime.pathname = '/saves'; render();
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toEqual([]);
    expect(audio.cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    expect(storage.getItem(STORAGE_KEY)).toBe(persisted);
    runtime.pathname = `/story/${state.id}`; render();
    expect(render().cardPlays).toEqual([]); expect(render().battleFeedback).toEqual([]);
    expect(audio.cancel).toHaveBeenCalledTimes(2); expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.playFeedback).toHaveBeenCalledOnce(); expect(audio.prepare).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000); expect(vi.getTimerCount()).toBe(0);
    expect(saved().battle!.result).toBe('won'); expect(saved().battle!.played).toBe(1);
  });

  it('切到另一人生路径也清理正在播放的敌人回合，不改变原战斗存档', async () => {
    vi.useFakeTimers(); const state = ready(); await render().dispatch(state, { type: 'endTurn' });
    expect(render().battleFeedback).toHaveLength(1); expect(vi.getTimerCount()).toBe(1);
    expect(audio.cancel).toHaveBeenCalledOnce();
    const persisted = saved(); runtime.pathname = '/story/another-life'; render();
    expect(render().battleFeedback).toEqual([]); expect(render().cardPlays).toEqual([]);
    expect(audio.cancel).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    expectSameBattle(saved(), persisted); expect(audio.playFeedback).toHaveBeenCalledOnce();
  });

  it('同一战场提交后保持反馈，正常换回合只取消上一张卡且不会被路由重复取消', async () => {
    vi.useFakeTimers(); const state = ready();
    await render().dispatch(state, { type: 'playCard', uid: state.battle!.hand[0], target: 'enemy-0' });
    const cardId = render().cardPlays![0].id;
    expect(runtime.navigate).toHaveBeenLastCalledWith(runtime.pathname);
    runtime.pathname = `/story/${state.id}`; render(); render();
    expect(render().cardPlays!.map(card => card.id)).toEqual([cardId]);
    expect(audio.cancel).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
    await render().dispatch(saved(), { type: 'endTurn' });
    const feedbackId = render().battleFeedback![0].id;
    expect(runtime.navigate).toHaveBeenLastCalledWith(runtime.pathname); render(); render();
    expect(render().battleFeedback!.map(feedback => feedback.id)).toEqual([feedbackId]);
    expect(audio.cancel).toHaveBeenCalledOnce(); expect(audio.playFeedback).toHaveBeenCalledOnce();
    expect(saved().battle!.turn).toBe(2);
  });

  it('离场清理不丢弃写入失败的待保存战局和暂停提示', async () => {
    vi.useFakeTimers(); const state = ready(); storage.failWrites = true;
    expect(await render().dispatch(state, { type: 'endTurn' })).toBe(false);
    const pending = render().pending!, error = render().error, persisted = storage.getItem(STORAGE_KEY);
    runtime.pathname = '/saves'; render();
    expectSameBattle(render().pending!, pending); expect(render().error).toBe(error);
    expect(render().saving).toBe(false); expect(listeners.has('beforeunload')).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe(persisted);
    expect(audio.cancel).toHaveBeenCalledOnce(); expect(audio.playFeedback).not.toHaveBeenCalled();
    expect(render().battleFeedback).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('2.0异步写入与多标签冲突', () => {
  it('HTTP 浏览器没有 randomUUID 时，洛琪希开局可保存并在重新挂载后续玩', async () => {
    vi.stubGlobal('crypto', {});
    await render().start(createCharacter('roxy', {budget:0}));
    expect(render().error).toBeNull();
    expect(listRpgSaves(render().envelope)).toHaveLength(1);
    const initial=saved();
    expect(initial.character.actor).toBe('roxy');
    expect(runtime.navigate).toHaveBeenLastCalledWith(`/story/${initial.id}`);
    runtime.effects.forEach(effect=>effect.cleanup?.());
    runtime.slots=[]; runtime.effects.clear();
    expect(listRpgSaves(render().envelope)[0].state).toEqual(initial);
    expect(await render().dispatch(initial,{type:'event',eventId:'rpg-learning',choiceId:'magic'})).toBe(true);
    expect(saved().revision).toBe(1);
    expect(saved().resolvedEvents).toContain('rpg-learning');
    expect(render().error).toBeNull();
  });
  it('双击开局在等待锁时只创建一个人生，保存成功后才导航', async () => {
    const store=render(), release=delayNextLock();
    const first=store.start(character()); await store.start(character());
    expect(render().saving).toBe(true); expect(Object.keys(render().envelope.saves)).toHaveLength(0);
    expect(runtime.lock).toHaveBeenCalledTimes(1); expect(runtime.navigate).not.toHaveBeenCalled();
    expect(listeners.has('beforeunload')).toBe(true);
    release(); await first;
    expect(Object.keys(render().envelope.saves)).toHaveLength(1); expect(listeners.has('beforeunload')).toBe(false);
  });
  it('双击同一张手牌只消耗一次行动力，等待中仍显示上次保存状态', async () => {
    const state=ready(), store=render(), uid=state.battle!.hand.find(uid=>CARD_BY_ID[state.collection.find(c=>c.uid===uid)!.cardId].cost===1)!;
    const action:GameAction={type:'playCard',uid,target:'enemy-0'}, release=delayNextLock();
    const first=store.dispatch(state,action); expect(await store.dispatch(state,action)).toBe(false);
    expect(saved().battle!.played).toBe(0); expect(listRpgSaves(render().envelope)[0].state!.revision).toBe(state.revision);
    release(); expect(await first).toBe(true);
    expect(saved().battle!.energy).toBe(2); expect(saved().battle!.played).toBe(1);
    expect(saved().battle!.hand).not.toContain(uid);
  });
  it('出牌保存失败立即暂停，重试保存不重新出牌或耗费行动力', async () => {
    const state=ready(), store=render(), uid=state.battle!.hand[0]; storage.failWrites=true;
    expect(await store.dispatch(state,{type:'playCard',uid,target:'enemy-0'})).toBe(false);
    const paused=render(); expect(paused.pending!.battle!.played).toBe(1); expect(saved().battle!.played).toBe(0);
    const calls=runtime.lock.mock.calls.length; await paused.dispatch(state,{type:'endTurn'});
    expect(runtime.lock).toHaveBeenCalledTimes(calls); expect(listeners.has('beforeunload')).toBe(true);
    storage.failWrites=false; await paused.retry();
    expect(render().pending).toBeNull(); expect(saved().battle!.played).toBe(1); expect(saved().battle!.turn).toBe(1);
  });
  it('另一标签先提交时，旧动作被拒绝并读取最新战局', async () => {
    const state=ready(), store=render(), action:GameAction={type:'endTurn'};
    persistRpg(resolveAction(state,action,state.revision),action,state.revision);
    expect(await store.dispatch(state,action)).toBe(false);
    expect(render().pending).toBeNull(); expect(render().error).toContain('动作已结算');
    expect(listRpgSaves(render().envelope)[0].state!.battle!.turn).toBe(2);
  });
  it('存储事件刷新正常状态，但待提交出牌保留暂停提示', async () => {
    const state=ready(); let store=render(); storage.failWrites=true;
    await store.dispatch(state,{type:'endTurn'}); store=render();
    const before=store.error;
    const listener=listeners.get('storage') as EventListener; listener({key:STORAGE_KEY} as StorageEvent);
    expect(render().pending).not.toBeNull(); expect(render().error).toBe(before);
  });
  it('重新挂载精确读取保存的手牌、种子、状态与回合', async () => {
    const state=ready(); await render().dispatch(state,{type:'endTurn'}); const current=saved();
    runtime.slots=[]; runtime.effects.clear();
    expect(listRpgSaves(render().envelope)[0].state).toEqual(current);
  });
  it('删除只在写入成功后移除，失败时保留原记录', async () => {
    const state=ready(), store=render(), release=delayNextLock();
    const first=store.remove(state.id); expect(await store.remove(state.id)).toBe(false);
    expect(render().envelope.saves[state.id]).toBeDefined(); release(); expect(await first).toBe(true);
    expect(render().envelope.saves[state.id]).toBeUndefined();
    const second=ready(); render().refresh(); storage.failWrites=true;
    expect(await render().remove(second.id)).toBe(false); expect(render().envelope.saves[second.id]).toBeDefined();
  });
});
