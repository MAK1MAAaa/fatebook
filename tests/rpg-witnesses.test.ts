import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { ENDINGS } from '../src/content';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { LEGACY_RULESET } from '../src/rpg/rulesets';
import { CONTENT_VERSION, DEATH_CHAPTER, ENCOUNTERS } from '../src/rpg/content';
import type { CharacterConfig } from '../src/game/types';
import type { GameAction } from '../src/rpg/types';
import { captureActions, fullCampaign } from './rpg-helper';

interface Campaign {
  id: string;
  character: CharacterConfig;
  createdAt: string;
  actions: GameAction[];
}
interface Witnesses {
  contentVersion: string;
  campaigns: Campaign[];
  endings: { id: string; campaignId: string; actionCount: number; action: GameAction }[];
}
const file = new URL('../docs/rpg-witnesses.json', import.meta.url);

function generate(): Witnesses {
  const document: Witnesses = { contentVersion: CONTENT_VERSION, campaigns: [], endings: [] };
  const specs = [
    { id: 'witness-base', actor: 'custom' as const, choices: {}, endings: ['end-family', 'end-dragon', 'end-rebuild', 'end-retired'], optional: true },
    { id: 'witness-politics', actor: 'custom' as const, choices: { 'rpg-alliance': 'talk', 'rpg-legacy': 'future', 'rpg-outcast': 'guide' }, endings: ['end-politics', 'end-traveler', 'end-defiant', 'end-research'] },
    { id: 'witness-teaching', actor: 'custom' as const, choices: { 'rpg-legacy': 'teach' }, endings: ['end-teacher', 'end-sword'] },
    { id: 'witness-roxy', actor: 'roxy' as const, choices: {}, endings: [] },
  ];
  for (const spec of specs) {
    const character = createCharacter(spec.actor, { budget: 0 });
    const campaign: Campaign = { id: spec.id, character, createdAt: '2026-10-08T00:00:00.000Z', actions: [] };
    captureActions(campaign.actions);
    try { fullCampaign(createRpg(character, campaign.id, campaign.createdAt, LEGACY_RULESET), spec.choices as Record<string, string>, spec.optional); }
    finally { captureActions(null); }
    document.campaigns.push(campaign);
    for (const id of spec.endings) document.endings.push({ id, campaignId: campaign.id, actionCount: campaign.actions.length, action: { type: 'finish', endingId: id } });
  }
  for (const [id, chapter] of Object.entries(DEATH_CHAPTER)) {
    const campaign = document.campaigns.find(c => c.id === (id === 'dead-illness' ? 'witness-roxy' : 'witness-base'))!;
    const transitions = campaign.actions.map((action, index) => ({ action, index })).filter(row => row.action.type === 'nextChapter');
    document.endings.push({ id, campaignId: campaign.id, actionCount: chapter < 7 ? transitions[chapter - 1].index : campaign.actions.length, action: { type: 'finish', endingId: id, confirmed: true } });
  }
  writeFileSync(file, `${JSON.stringify(document)}\n`);
  return document;
}

describe('2.0正式动作见证路径', () => {
  it('四条构筑路径覆盖全部144场遭遇与18个结局，逐动作可重放', () => {
    const witnesses: Witnesses = process.env.GENERATE_RPG_WITNESSES === '1' ? generate() : JSON.parse(readFileSync(file, 'utf8'));
    expect(witnesses.contentVersion).toBe(CONTENT_VERSION);
    expect(witnesses.endings.map(e => e.id).sort()).toEqual(ENDINGS.map(e => e.id).sort());
    const reached = new Set<string>();
    const metrics: unknown[] = [];
    for (const campaign of witnesses.campaigns) {
      let state = createRpg(campaign.character, campaign.id, campaign.createdAt, LEGACY_RULESET);
      for (let index = 0; index <= campaign.actions.length; index++) {
        for (const ending of witnesses.endings.filter(e => e.campaignId === campaign.id && e.actionCount === index)) {
          const result = resolveAction(state, ending.action, state.revision);
          expect(result.endingId).toBe(ending.id);
          expect(result.status).toBe(ENDINGS.find(e => e.id === ending.id)!.kind);
          expect(() => resolveAction(result, { type: 'endTurn' }, result.revision)).toThrow('封存');
        }
        if (index < campaign.actions.length) state = resolveAction(state, campaign.actions[index], state.revision);
      }
      state.victories.forEach(id => reached.add(id));
      metrics.push({id:campaign.id, actions:campaign.actions.length, victories:state.victories.length, turns:state.receipts.reduce((n,r)=>n+r.turns,0), cardsPlayed:state.receipts.reduce((n,r)=>n+r.played,0), chapters:Array.from({length:7},(_,i)=>{const receipts=state.receipts.filter(r=>ENCOUNTERS.find(e=>e.id===r.encounterId)?.chapter===i+1);return {chapter:i+1,battles:receipts.length,turns:receipts.reduce((n,r)=>n+r.turns,0),cards:receipts.reduce((n,r)=>n+r.played,0)};})});
      expect(state.victories.filter(id => !ENCOUNTERS.find(e => e.id === id)!.optional)).toHaveLength(116);
    }
    if(process.env.GENERATE_RPG_WITNESSES==='1')writeFileSync(new URL('../docs/rpg-balance.json',import.meta.url),`${JSON.stringify({contentVersion:CONTENT_VERSION,method:'自动化启发式出牌；不是人类游玩时间',tacticalSignatures:new Set(ENCOUNTERS.map(e=>JSON.stringify([e.enemies,e.modifier,e.goal,e.rounds]))).size,metrics},null,2)}\n`);
    expect([...reached].sort()).toEqual(ENCOUNTERS.map(e => e.id).sort());
  }, 30000);
});
