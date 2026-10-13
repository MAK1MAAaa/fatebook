import type { StatusKey } from './types';

// Transient observations emitted by the real combat path; never part of a save.
export interface CombatEvent {
  kind: 'enemy-attack' | 'hero-burn' | 'enemy-burn' | 'enemy-guard' | 'enemy-heal' | 'enemy-status' | 'enemy-drain' | 'enemy-ritual';
  enemyUid?: string;
  label: string;
  damage: number;
  absorbed: number;
  amount: number;
  escortDamage: number;
  hitIndex?: number;
  hitCount?: number;
  status?: StatusKey;
  defeated?: boolean;
}

export type CombatEventObserver = (event: CombatEvent) => void;

export function emitCombatEvent(observer: CombatEventObserver | undefined, event: CombatEvent): void {
  try {
    observer?.(event);
  } catch {
    // Optional presentation must never cancel a resolved combat action.
  }
}
