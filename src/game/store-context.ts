import { createContext, useContext } from "react";
import type { CharacterConfig, GameState, SaveEnvelope } from "./types";
export interface GameStore {
  envelope: SaveEnvelope;
  error: string | null;
  pending: GameState | null;
  saving: boolean;
  start: (character: CharacterConfig) => Promise<void>;
  choose: (state: GameState, choiceId: string) => Promise<void>;
  remove: (id: string) => Promise<boolean>;
  retry: () => Promise<void>;
  dismiss: () => void;
  refresh: () => void;
}
export const GameContext = createContext<GameStore | null>(null);
export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error("游戏存档尚未初始化");
  return value;
}
