import { STORAGE_KEY } from "./storage";

const LOCK_DATABASE = `${STORAGE_KEY}:lock`;
const LOCK_STORE = "mutex";

function lockError(cause?: unknown) {
  return new Error(
    "无法建立跨页面存档锁，写入已暂停，请检查浏览器存储权限后重试。",
    { cause },
  );
}

function runSynchronous<T>(operation: () => T): T {
  const result = operation();
  if (
    result !== null &&
    (typeof result === "object" || typeof result === "function") &&
    typeof (result as { then?: unknown }).then === "function"
  ) {
    throw new Error("存档锁内必须同步完成读写，不能返回异步操作。");
  }
  return result;
}

function openLockDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    const fail = (cause?: unknown) => {
      settled = true;
      reject(lockError(cause));
    };
    try {
      if (!globalThis.indexedDB)
        throw new Error("当前浏览器不支持 IndexedDB。");
      request = globalThis.indexedDB.open(LOCK_DATABASE, 1);
    } catch (error) {
      fail(error);
      return;
    }
    request.onupgradeneeded = () => {
      try {
        if (!request.result.objectStoreNames.contains(LOCK_STORE)) {
          request.result.createObjectStore(LOCK_STORE);
        }
      } catch (error) {
        request.transaction?.abort();
        fail(error);
      }
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error("存档锁数据库被其他页面阻止。"));
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function withIndexedDbLock<T>(operation: () => T): Promise<T> {
  const database = await openLockDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let result: T;
    let completedOperation = false;
    let operationFailure: { error: unknown } | undefined;
    try {
      // 相同 store 的 readwrite 事务跨连接串行；store 始终为空，存档仍在 localStorage。
      transaction = database.transaction(LOCK_STORE, "readwrite");
      const request = transaction.objectStore(LOCK_STORE).get(STORAGE_KEY);
      transaction.oncomplete = () => {
        database.close();
        if (completedOperation) resolve(result);
        else reject(lockError());
      };
      transaction.onabort = () => {
        database.close();
        reject(
          operationFailure
            ? operationFailure.error
            : lockError(transaction.error),
        );
      };
      request.onsuccess = () => {
        try {
          result = runSynchronous(operation);
          completedOperation = true;
        } catch (error) {
          operationFailure = { error };
          transaction.abort();
        }
      };
    } catch (error) {
      database.close();
      reject(lockError(error));
    }
  });
}

/** operation 必须同步完成整个存档信封的读改写。 */
export async function withSaveLock<T>(operation: () => T): Promise<T> {
  let locks: LockManager | undefined;
  try {
    locks = globalThis.navigator?.locks;
  } catch (error) {
    throw lockError(error);
  }
  if (locks && typeof locks.request === "function") {
    let entered = false;
    try {
      return await locks.request(STORAGE_KEY, { mode: "exclusive" }, () => {
        entered = true;
        return runSynchronous(operation);
      });
    } catch (error) {
      if (entered) throw error;
      throw lockError(error);
    }
  }
  return withIndexedDbLock(operation);
}
