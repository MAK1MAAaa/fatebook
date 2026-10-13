import { useState } from 'react';
import type { GameAction, RpgState } from '../rpg/types';

export function useBattleSelection(state: RpgState | undefined, dispatch: (state: RpgState, action: GameAction) => Promise<boolean>) {
  const [selection, setSelection] = useState<{ uid: string; life: string; turn: number } | null>(null);
  const battle = state?.battle;
  const selected = state?.scene === 'battle' && battle?.result === 'playing' && selection?.life === state.id && selection.turn === battle.turn && battle.hand.includes(selection.uid) ? selection.uid : null;
  const setSelected = (uid: string | null) => setSelection(uid && state && battle ? { uid, life: state.id, turn: battle.turn } : null);
  const commitSelection = async (action: GameAction) => {
    if (!state) return false;
    const saved = await dispatch(state, action);
    if (saved) setSelection(null);
    return saved;
  };
  return { selected, setSelected, commitSelection };
}
