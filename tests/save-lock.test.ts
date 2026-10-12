import { afterEach, describe, expect, it, vi } from "vitest";
import { withSaveLock } from "../src/game/save-lock";
import { STORAGE_KEY } from "../src/game/storage";

afterEach(() => vi.unstubAllGlobals());

type Handler = (() => void) | null;

function webLocks() {
  let queue = Promise.resolve();
  const request = vi.fn(
    (_name: string, _options: unknown, operation: () => unknown) => {
      const result = queue.then(operation);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  );
  return { request };
}

// 模拟不同数据库连接共享的 readwrite 调度队列，仅提供空 store 的 get。
function indexedDbMutex(
  options: {
    manualComplete?: boolean;
    openError?: Error;
    blocked?: boolean;
  } = {},
) {
  const pending: Array<{ start: () => void }> = [];
  const completions: Array<() => void> = [];
  const connections: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const accesses: Array<{ store: string; mode: string; key: string }> = [];
  const stores = new Set<string>();
  const open = vi.fn(() => {
    const database = {
      close: vi.fn(),
      onversionchange: null as Handler,
      objectStoreNames: { contains: (name: string) => stores.has(name) },
      createObjectStore: (name: string) => stores.add(name),
      transaction: (store: string, mode: string) => {
        const request = { onsuccess: null as Handler };
        let aborted = false;
        let finished = false;
        const transaction = {
          oncomplete: null as Handler,
          onabort: null as Handler,
          error: null,
          objectStore: () => ({
            get: (key: string) => {
              accesses.push({ store, mode, key });
              return request;
            },
          }),
          abort: () => {
            aborted = true;
            queueMicrotask(() => finish(true));
          },
        };
        const finish = (failed: boolean) => {
          if (finished) return;
          finished = true;
          if (failed) transaction.onabort?.();
          else transaction.oncomplete?.();
          pending.shift();
          pending[0]?.start();
        };
        const entry = {
          start: () =>
            queueMicrotask(() => {
              request.onsuccess?.();
              if (aborted) return;
              if (options.manualComplete) completions.push(() => finish(false));
              else queueMicrotask(() => finish(false));
            }),
        };
        pending.push(entry);
        if (pending.length === 1) entry.start();
        return transaction;
      },
    };
    connections.push(database);
    const request = {
      result: database,
      error: options.openError ?? null,
      onupgradeneeded: null as Handler,
      onsuccess: null as Handler,
      onerror: null as Handler,
      onblocked: null as Handler,
    };
    queueMicrotask(() => {
      if (options.openError) request.onerror?.();
      else if (options.blocked) {
        request.onblocked?.();
        queueMicrotask(() => request.onsuccess?.());
      } else {
        if (stores.size === 0) request.onupgradeneeded?.();
        request.onsuccess?.();
      }
    });
    return request;
  });
  return { open, connections, accesses, stores, completions };
}

describe("跨页面存档排他锁", () => {
  it("优先使用固定 storage key 的 Web Locks，排队取得锁后才执行操作", async () => {
    const locks = webLocks();
    const indexedDB = { open: vi.fn() };
    vi.stubGlobal("navigator", { locks });
    vi.stubGlobal("indexedDB", indexedDB);
    const order: string[] = [];
    const first = withSaveLock(() => {
      order.push("第一局");
      return 1;
    });
    const second = withSaveLock(() => {
      order.push("第二局");
      return 2;
    });
    expect(order).toEqual([]);
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(["第一局", "第二局"]);
    expect(locks.request).toHaveBeenCalledWith(
      STORAGE_KEY,
      { mode: "exclusive" },
      expect.any(Function),
    );
    expect(indexedDB.open).not.toHaveBeenCalled();
  });

  it("Web Locks 操作失败释放锁，并保留本地存储原始异常供重试", async () => {
    vi.stubGlobal("navigator", { locks: webLocks() });
    const failure = new DOMException(
      "localStorage quota",
      "QuotaExceededError",
    );
    const failed = withSaveLock(() => {
      throw failure;
    });
    const next = withSaveLock(() => "恢复保存");
    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe("恢复保存");
  });

  it("Web Locks 获取失败明确拒绝，不静默换成无锁写入", async () => {
    const operation = vi.fn();
    const failure = new Error("permission denied");
    vi.stubGlobal("navigator", {
      locks: { request: vi.fn().mockRejectedValue(failure) },
    });
    vi.stubGlobal("indexedDB", { open: vi.fn() });
    await expect(withSaveLock(operation)).rejects.toMatchObject({
      message: expect.stringContaining("无法建立跨页面存档锁"),
      cause: failure,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("无 Web Locks 时跨 IDB 连接串行读改写，mutex store 不存游戏数据", async () => {
    const indexedDB = indexedDbMutex();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", indexedDB);
    let saved = "{}";
    const order: string[] = [];
    const write = (id: string) => () => {
      const envelope = JSON.parse(saved);
      envelope[id] = "最新进度";
      saved = JSON.stringify(envelope);
      order.push(id);
      return id;
    };
    const first = withSaveLock(write("第一局"));
    const second = withSaveLock(write("第二局"));
    expect(order).toEqual([]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      "第一局",
      "第二局",
    ]);
    expect(JSON.parse(saved)).toEqual({
      第一局: "最新进度",
      第二局: "最新进度",
    });
    expect(order).toEqual(["第一局", "第二局"]);
    expect(indexedDB.stores).toEqual(new Set(["mutex"]));
    expect(indexedDB.accesses).toEqual([
      { store: "mutex", mode: "readwrite", key: STORAGE_KEY },
      { store: "mutex", mode: "readwrite", key: STORAGE_KEY },
    ]);
    expect(
      indexedDB.connections.every(
        (database) => database.close.mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it("IDB 操作结束后仍等待 transaction complete 才完成 Promise", async () => {
    const indexedDB = indexedDbMutex({ manualComplete: true });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", indexedDB);
    let resolved = false;
    const operation = vi.fn(() => 42);
    const saved = withSaveLock(operation).then((value) => {
      resolved = true;
      return value;
    });
    await vi.waitFor(() => expect(indexedDB.completions).toHaveLength(1));
    expect(operation).toHaveBeenCalledOnce();
    expect(resolved).toBe(false);
    indexedDB.completions.shift()?.();
    await expect(saved).resolves.toBe(42);
  });

  it("IDB 内本地存储失败会 abort、保留原异常，并允许后续请求取得锁", async () => {
    const indexedDB = indexedDbMutex();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", indexedDB);
    const failure = new Error("本地存储写入失败");
    const failed = withSaveLock(() => {
      throw failure;
    });
    const next = withSaveLock(() => "重试成功");
    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe("重试成功");
    expect(
      indexedDB.connections.every(
        (database) => database.close.mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it("IDB 缺失、打开失败或被阻止时均不运行存档操作", async () => {
    vi.stubGlobal("navigator", {});
    for (const indexedDB of [
      undefined,
      indexedDbMutex({ openError: new Error("禁止存储") }),
      indexedDbMutex({ blocked: true }),
    ]) {
      vi.stubGlobal("indexedDB", indexedDB);
      const operation = vi.fn();
      await expect(withSaveLock(operation)).rejects.toThrow(
        "无法建立跨页面存档锁",
      );
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it("拒绝锁内异步回调，避免 IndexedDB 事务提前结束后继续写入", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", indexedDbMutex());
    await expect(withSaveLock(() => Promise.resolve(1))).rejects.toThrow(
      "必须同步",
    );
    await expect(withSaveLock(() => undefined)).resolves.toBeUndefined();
  });
});
