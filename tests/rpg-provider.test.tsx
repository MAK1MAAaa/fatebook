import type { ReactElement } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import RpgProvider from '../src/components/rpg/RpgProvider';
import { createCharacter } from '../src/game/characters';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { CARD_BY_ID } from '../src/rpg/cards';
import { cardFor } from '../src/rpg/rulesets';
import { CARD_PLAY_DURATION_MS, MAX_CARD_PLAY_CUES } from '../src/rpg/card-play-effects';
import { loadRpgEnvelope, listRpgSaves, persistRpg, STORAGE_KEY } from '../src/rpg/storage';
import type { RpgStore } from '../src/rpg/context';
import type { GameAction } from '../src/rpg/types';
const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: new Map<
    number,
    { deps?: readonly unknown[]; cleanup?: () => void }
  >(),
  scheduled: [] as (() => void)[],
  navigate: vi.fn(),
  lock: vi.fn(),
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
vi.mock("react-router", () => ({ useNavigate: () => runtime.navigate }));
vi.mock("../src/game/save-lock", () => ({
  withSaveLock: (operation: () => unknown) => runtime.lock(operation),
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
  runtime.navigate.mockReset();
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
    expect(render().cardPlays).toHaveLength(MAX_CARD_PLAY_CUES);
    expect(render().cardPlays!.every(cue => cue.durationMs === 240)).toBe(true);
    vi.advanceTimersByTime(240); expect(render().cardPlays).toEqual([]);
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
