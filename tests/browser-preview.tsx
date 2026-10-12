// A development-only UI fixture, replayed through the production engine.
// It never reads or writes the player's browser saves and is excluded from dist.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router';
import { RpgContext } from '../src/rpg/context';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { emptyEnvelope } from '../src/rpg/storage';
import { createCharacter } from '../src/game/characters';
import RpgStory from '../src/pages/RpgStory';
import witnesses from '../docs/rpg-witnesses.json';
import type { GameAction, RpgState } from '../src/rpg/types';
import '../src/index.css';
import '../src/App.css';
import '../src/components/rpg/rpg.css';

const campaign = witnesses.campaigns[0];
let initial: RpgState = createRpg(createCharacter('custom', { budget: 0 }), campaign.id, campaign.createdAt);
for (const action of campaign.actions) {
  initial = resolveAction(initial, action as GameAction, initial.revision);
  if (action.type === 'startBattle' && action.encounterId === 'c5-main-1') break;
}
export function Preview() {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return <RpgContext.Provider value={{
    envelope: { ...emptyEnvelope(), saves: { [state.id]: state } }, error, pending: null, saving: false,
    async dispatch(previous, action) { try { setState(resolveAction(previous, action, state.revision)); setError(null); return true; } catch (e) { setError(String(e)); return false; } },
    async start() {}, async remove() { return false; }, async retry() {}, dismiss() {}, refresh() {},
  }}><div style={{padding:12,background:'#684c30',color:'#fff0dc'}}>布局验证沙盒 · 正式引擎重放 · 不写入存档{error&&<p role="alert">{error}</p>}</div><Routes><Route path="/story/:id" element={<RpgStory/>}/></Routes></RpgContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<HashRouter><Preview/></HashRouter>);
