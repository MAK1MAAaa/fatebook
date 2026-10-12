import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { createRpg } from '../src/rpg/engine';
import { ENCOUNTER_BY_ID } from '../src/rpg/content';
import { createBattle, emptyStatuses, endTurn, forecastEnemyIntents } from '../src/rpg/combat';
import { ENEMY_BY_ID } from '../src/rpg/enemies';

function battle(id = 'c3-main-1') {
  const state = createRpg(createCharacter('custom', { budget: 0 }), 'intent-forecast', '2026-10-10T00:00:00.000Z');
  state.chapter = ENCOUNTER_BY_ID[id].chapter;
  state.scene = 'battle';
  state.battle = createBattle(state, id);
  state.battle.block = 0;
  return state;
}

function pairedBattle() {
  const state = battle(), archer = ENEMY_BY_ID['enemy-10'];
  const hp = Math.round(archer.hp * 1.16);
  // A focused formation fixture, not a change to the encounter's default roster.
  state.battle!.enemies.push({ uid: 'enemy-1', definitionId: archer.id, name: archer.name, hp, maxHp: hp, block: 0, statuses: emptyStatuses(), intent: { ...archer.pattern[0] }, phase: 0 });
  return state;
}

describe('按行动顺序预告敌方意图', () => {
  it('先易伤后射击的组合预告34，和结算一致且不修改状态或随机种子', () => {
    const state = pairedBattle(), snapshot = structuredClone(state);
    expect(state.battle!.enemies.map(enemy => enemy.definitionId)).toEqual(['enemy-7', 'enemy-10']);

    const forecast = forecastEnemyIntents(state);
    expect(forecast['enemy-1']).toEqual({ amount: 34, willAct: true });
    expect(forecastEnemyIntents(state)).toEqual(forecast);
    expect(state).toEqual(snapshot);

    endTurn(snapshot);
    expect(state.battle!.hp - snapshot.battle!.hp).toBe(34);
  });

  it('正式c3-main-2第2回合先易伤后扑击预告27，和结算一致', () => {
    const state = battle('c3-main-2');
    endTurn(state);
    expect(state.battle!.turn).toBe(2);
    expect(state.battle!.enemies.map(enemy => enemy.definitionId)).toEqual(['enemy-9', 'enemy-11']);
    const next = structuredClone(state);

    expect(forecastEnemyIntents(state)['enemy-1']).toEqual({ amount: 27, willAct: true });
    endTurn(next);
    expect(state.battle!.hp - next.battle!.hp).toBe(27);
  });

  it.each([{ vulnerable: 1, expected: 15 }, { vulnerable: 2, expected: 23 }])('旧易伤$vulnerable层先衰减，敌方虚弱保留到攻击后', ({ vulnerable, expected }) => {
    const state = battle('c2-main-1'), current = state.battle!;
    current.enemies = current.enemies.slice(0, 1);
    current.enemies[0].intent = { kind: 'attack', amount: 20, hits: 2, label: '连击' };
    current.enemies[0].statuses.weak = 1;
    current.statuses.vulnerable = vulnerable;
    current.statuses.weak = 3;
    const next = structuredClone(state);

    expect(forecastEnemyIntents(state)['enemy-0'].amount).toBe(expected);
    endTurn(next);
    expect(current.hp - next.battle!.hp).toBe(expected * 2);
    expect(current.statuses).toEqual({ burn: 0, weak: 3, vulnerable });
  });

  it.each([{ hp: 0, burn: 0 }, { hp: 1, burn: 1 }])('退场或被燃烧击倒的前排不会继续施加易伤（$hp/$burn）', ({ hp, burn }) => {
    const state = pairedBattle(), current = state.battle!;
    current.enemies[0].hp = hp;
    current.enemies[0].statuses.burn = burn;
    const next = structuredClone(state), forecast = forecastEnemyIntents(state);

    expect(forecast['enemy-0'].willAct).toBe(false);
    expect(forecast['enemy-1']).toEqual({ amount: 23, willAct: true });
    endTurn(next);
    expect(current.hp - next.battle!.hp).toBe(23);
  });

  it('最后一层燃烧仍降低当次再生，防御意图含章节加成', () => {
    const state = battle('c4-main-9'), enemy = state.battle!.enemies[0];
    enemy.hp -= 80;
    enemy.statuses.burn = 1;
    enemy.intent = { kind: 'heal', amount: 20, label: '再生' };
    const next = structuredClone(state);

    expect(forecastEnemyIntents(state)[enemy.uid].amount).toBe(10);
    endTurn(next);
    expect(next.battle!.enemies[0].hp - enemy.hp).toBe(9);
    enemy.intent = { kind: 'guard', amount: 20, label: '架势' };
    expect(forecastEnemyIntents(state)[enemy.uid].amount).toBe(23);
  });

  it('主角被燃烧击倒或前排攻击结束战斗时，后续意图取消', () => {
    const burned = pairedBattle();
    burned.battle!.hp = 1;
    burned.battle!.statuses.burn = 2;
    expect(Object.values(forecastEnemyIntents(burned)).every(intent => !intent.willAct)).toBe(true);
    const burnedNext = structuredClone(burned);
    endTurn(burnedNext);
    expect(burnedNext.battle!.result).toBe('lost');

    const attacked = pairedBattle();
    attacked.battle!.hp = 1;
    attacked.battle!.enemies[0].intent = { kind: 'attack', amount: 20, label: '先手攻击' };
    const forecast = forecastEnemyIntents(attacked);
    expect(forecast['enemy-0'].willAct).toBe(true);
    expect(forecast['enemy-1'].willAct).toBe(false);
    const attackedNext = structuredClone(attacked);
    endTurn(attackedNext);
    expect(attackedNext.battle!.result).toBe('lost');
  });
});
