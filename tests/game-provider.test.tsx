import type { ReactElement } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import GameProvider from "../src/components/game/GameProvider";
import { createCharacter } from "../src/game/characters";
import {
  createGame,
  getAvailableChoices,
  resolveChoice,
} from "../src/game/engine";
import { STORY_BY_ID } from "../src/content";
import { listSaves, persistGame, STORAGE_KEY } from "../src/game/storage";
import type { GameStore } from "../src/game/store-context";

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

function render(): GameStore {
  runtime.cursor = 0;
  const element = GameProvider({ children: null }) as ReactElement<{
    value: GameStore;
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
  vi.unstubAllGlobals();
});

describe("异步存档提交", () => {
  it("等待锁时同步阻止重复开局，写入完成后才发布记录与导航", async () => {
    const store = render();
    const release = delayNextLock();
    const first = store.start(character());
    await store.start(character());
    const waiting = render();
    expect(waiting.saving).toBe(true);
    expect(Object.keys(waiting.envelope.saves)).toHaveLength(0);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(runtime.lock).toHaveBeenCalledTimes(1);
    expect(runtime.navigate).not.toHaveBeenCalled();
    expect(listeners.has("beforeunload")).toBe(true);
    release();
    await first;
    const saved = render();
    expect(saved.saving).toBe(false);
    expect(listSaves(saved.envelope)).toHaveLength(1);
    expect(runtime.navigate).toHaveBeenCalledTimes(1);
    expect(listeners.has("beforeunload")).toBe(false);
  });

  it("同一抉择在锁等待期间只结算一次，状态保留上次已保存进度", async () => {
    const initial = createGame(character());
    persistGame(initial);
    const store = render();
    const choice = getAvailableChoices(
      STORY_BY_ID[initial.nodeId],
      initial,
    ).find((item) => item.ok)!.choice;
    const release = delayNextLock();
    const first = store.choose(initial, choice.id);
    await store.choose(initial, choice.id);
    const waiting = render();
    expect(listSaves(waiting.envelope)[0].state?.step).toBe(0);
    expect(runtime.lock).toHaveBeenCalledTimes(1);
    release();
    await first;
    const saved = render();
    expect(listSaves(saved.envelope)[0].state?.step).toBe(1);
    expect(listSaves(saved.envelope)[0].state?.history).toHaveLength(1);
  });

  it("失锁保留待提交结果，重试同一人生且待保存时暂停新动作", async () => {
    runtime.lock.mockRejectedValueOnce(
      new Error(
        "无法建立跨页面存档锁，写入已暂停，请检查浏览器存储权限后重试。",
      ),
    );
    await render().start(character());
    const failed = render();
    expect(failed.pending?.step).toBe(0);
    expect(failed.error).toContain("存档锁");
    expect(failed.saving).toBe(false);
    expect(listeners.has("beforeunload")).toBe(true);
    const id = failed.pending!.id;
    await failed.start(character());
    expect(runtime.lock).toHaveBeenCalledTimes(1);
    await failed.retry();
    const retried = render();
    expect(retried.pending).toBeNull();
    expect(listSaves(retried.envelope)[0].id).toBe(id);
    expect(runtime.lock).toHaveBeenCalledTimes(2);
  });

  it("存储空间失败后保留结果，重试成功前不切换到新故事", async () => {
    storage.failWrites = true;
    await render().start(character());
    const failed = render();
    expect(failed.pending).not.toBeNull();
    expect(failed.error).toContain("保存失败");
    expect(runtime.navigate).not.toHaveBeenCalled();
    storage.failWrites = false;
    await failed.retry();
    expect(render().pending).toBeNull();
    expect(runtime.navigate).toHaveBeenCalledTimes(1);
  });

  it("逻辑冲突重新读取最新进度，不保留无法提交的旧结果", async () => {
    const initial = createGame(character());
    persistGame(initial);
    const store = render();
    const choice = getAvailableChoices(
      STORY_BY_ID[initial.nodeId],
      initial,
    ).find((item) => item.ok)!.choice;
    persistGame(resolveChoice(initial, choice.id).state);
    await store.choose(initial, choice.id);
    const conflicted = render();
    expect(conflicted.pending).toBeNull();
    expect(conflicted.error).toContain("其他页面更新");
    expect(listSaves(conflicted.envelope)[0].state?.step).toBe(1);
    expect(runtime.navigate).not.toHaveBeenCalled();
  });

  it("删除等待提交后才移除记录，重复请求返回失败且失败时保留记录", async () => {
    const initial = createGame(character());
    persistGame(initial);
    const store = render();
    const release = delayNextLock();
    const first = store.remove(initial.id);
    expect(await store.remove(initial.id)).toBe(false);
    expect(render().envelope.saves[initial.id]).toBeDefined();
    release();
    expect(await first).toBe(true);
    expect(render().envelope.saves[initial.id]).toBeUndefined();
    expect(runtime.navigate).not.toHaveBeenCalled();
    persistGame(createGame(character(), "retained-record"));
    render().refresh();
    runtime.lock.mockRejectedValueOnce(
      new Error("无法建立跨页面存档锁，写入已暂停。"),
    );
    expect(await render().remove("retained-record")).toBe(false);
    expect(render().envelope.saves["retained-record"]).toBeDefined();
  });
});
