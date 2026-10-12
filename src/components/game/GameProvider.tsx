import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { GameContext } from "../../game/store-context";
import { createGame, resolveChoice } from "../../game/engine";
import {
  loadEnvelope,
  persistGame,
  removeSave,
  STORAGE_KEY,
} from "../../game/storage";
import { CONTENT_VERSION } from "../../content";
import { withSaveLock } from "../../game/save-lock";
import type {
  CharacterConfig,
  GameState,
  SaveEnvelope,
} from "../../game/types";
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "无法保存，请检查浏览器本地存储权限。";
export default function GameProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [initial] = useState(() => {
    try {
      return { envelope: loadEnvelope(), error: null };
    } catch (error) {
      return {
        envelope: {
          schemaVersion: 1,
          contentVersion: CONTENT_VERSION,
          revision: 0,
          saves: {},
          unlocked: [],
        } as SaveEnvelope,
        error: message(error),
      };
    }
  });
  const [envelope, setEnvelope] = useState(initial.envelope);
  const [error, setError] = useState<string | null>(initial.error);
  const [pending, setPending] = useState<GameState | null>(null);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const pendingRef = useRef<GameState | null>(null);
  function queuePending(state: GameState | null) {
    pendingRef.current = state;
    setPending(state);
  }
  function refresh() {
    if (busyRef.current) return;
    try {
      setEnvelope(loadEnvelope());
      setError(null);
    } catch (error) {
      setError(message(error));
    }
  }
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        try {
          setEnvelope(loadEnvelope());
          setError("另一页面更新了记录，请确认当前进度后再继续。");
        } catch (error) {
          setError(message(error));
        }
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  useEffect(() => {
    if (!pending && !saving) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [pending, saving]);
  async function commit(state: GameState): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const saved = await withSaveLock(() => persistGame(state));
      setEnvelope(saved);
      queuePending(null);
      setError(null);
      navigate(`/story/${state.id}`);
    } catch (error) {
      const reason = message(error);
      setError(reason);
      // Only a failed storage operation can be retried with the same result.
      // A newer authoritative record must be reloaded instead of queued forever.
      if (
        /保存失败|禁止访问本地存储|读取本地存档失败|无法使用本地存储|跨页面存档锁|写入已暂停/.test(
          reason,
        )
      ) {
        queuePending(state);
      } else {
        queuePending(null);
        try {
          setEnvelope(loadEnvelope());
        } catch {
          // Preserve the displayed records while the damaged container is untouched.
        }
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }
  async function start(character: CharacterConfig): Promise<void> {
    if (!pendingRef.current && !busyRef.current) {
      try {
        await commit(createGame(character));
      } catch (error) {
        setError(message(error));
      }
    }
  }
  async function choose(state: GameState, choiceId: string): Promise<void> {
    if (pendingRef.current || busyRef.current) return;
    try {
      await commit(resolveChoice(state, choiceId, state.step).state);
    } catch (error) {
      setError(message(error));
    }
  }
  async function remove(id: string): Promise<boolean> {
    if (busyRef.current) return false;
    if (pendingRef.current?.id === id) {
      setError("此人生有尚未保存的结果，请先重试保存。");
      return false;
    }
    busyRef.current = true;
    setSaving(true);
    try {
      const saved = await withSaveLock(() => removeSave(id));
      setEnvelope(saved);
      setError(null);
      return true;
    } catch (error) {
      setError(message(error));
      return false;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }
  async function retry(): Promise<void> {
    if (busyRef.current) return;
    if (pendingRef.current) await commit(pendingRef.current);
    else refresh();
  }
  return (
    <GameContext.Provider
      value={{
        envelope,
        error,
        pending,
        saving,
        start,
        choose,
        remove,
        retry,
        dismiss: () => setError(null),
        refresh,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
