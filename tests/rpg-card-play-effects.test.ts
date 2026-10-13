import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { CARDS } from '../src/rpg/cards';
import { buildCardPlayCue, CARD_PLAY_DURATION_MS, MAX_CARD_PLAY_CUES } from '../src/rpg/card-play-effects';
import { cardEffect, emptyStatuses } from '../src/rpg/combat';
import { ENCOUNTER_BY_ID } from '../src/rpg/content';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { cardFor, CURRENT_RULESET, LEGACY_RULESET } from '../src/rpg/rulesets';
import type { GameAction, RpgState, RulesetVersion } from '../src/rpg/types';

function ready(cardId: string, upgraded = false, version: RulesetVersion = CURRENT_RULESET) {
  const card = CARDS.find(candidate => candidate.id === cardId)!;
  let state = createRpg(createCharacter(card.actor ?? 'custom', { budget: 0 }), `cue:${cardId}:${upgraded}:${version}`, '2026-10-13T00:00:00.000Z', version);
  state.chapter = 7;
  for (const skill of Object.keys(state.skills) as Array<keyof typeof state.skills>) state.skills[skill] = 4;
  state.flags.push('dragonPact');
  state.resolvedEvents.push('rpg-learning');
  const encounter = ENCOUNTER_BY_ID['c7-main-1'];
  state.acceptedQuests.push(encounter.questId);
  const existing = state.collection.find(candidate => candidate.cardId === cardId);
  const owned = existing ?? { uid: `cue-card:${cardId}`, cardId, upgraded };
  owned.upgraded = upgraded;
  if (!existing) { state.collection.push(owned); state.deck[0] = owned.uid; }
  state = resolveAction(state, { type: 'startBattle', encounterId: encounter.id }, state.revision);
  // Focused post-start fixtures retain the actual engine's card ownership,
  // ruleset, formation, revisions, seeded battle and action resolution.
  const battle = state.battle!;
  battle.energy = 9;
  battle.hp = battle.maxHp - 80;
  battle.block = 4;
  battle.statuses = { burn: 3, weak: 2, vulnerable: 1 };
  battle.hand = [owned.uid, ...state.deck.filter(uid => uid !== owned.uid).slice(0, 2)];
  battle.drawPile = state.deck.filter(uid => !battle.hand.includes(uid));
  battle.discard = [];
  battle.exhausted = [];
  for (const enemy of battle.enemies) {
    enemy.hp = 500;
    enemy.maxHp = 500;
    enemy.block = 5;
    enemy.statuses = emptyStatuses();
  }
  return { state, owned, action: { type: 'playCard' as const, uid: owned.uid, target: battle.enemies[0].uid } };
}

function play(fixture: ReturnType<typeof ready>) {
  const before = fixture.state;
  const after = resolveAction(before, fixture.action, before.revision);
  const cue = buildCardPlayCue(before, after, fixture.action);
  expect(cue).not.toBeNull();
  return { before, after, cue: cue!, action: fixture.action };
}

const catalogCases = [LEGACY_RULESET, CURRENT_RULESET].flatMap(ruleset => [false, true].flatMap(upgraded => CARDS.map(card => ({ ruleset, upgraded, cardId: card.id }))));

describe('全部出牌反馈读取真实结算', () => {
  it('目录与普通／强化／旧新覆盖矩阵保持完整', () => {
    expect(CARDS).toHaveLength(96);
    expect(catalogCases).toHaveLength(384);
    expect(new Set(CARDS.map(card => card.id)).size).toBe(96);
    expect(CARD_PLAY_DURATION_MS).toBe(1100);
    expect(MAX_CARD_PLAY_CUES).toBe(4);
  });

  it.each(catalogCases)('$ruleset／$cardId／强化=$upgraded 的反馈与正式前后状态一致且无副作用', ({ ruleset, cardId, upgraded }) => {
    const fixture = ready(cardId, upgraded, ruleset);
    const before = fixture.state, after = resolveAction(before, fixture.action, before.revision);
    const beforeSnapshot = structuredClone(before), afterSnapshot = structuredClone(after);
    const cue = buildCardPlayCue(before, after, fixture.action)!;
    const card = cardFor(before, cardId), effect = cardEffect(before, fixture.owned);
    expect(cue).not.toBeNull();
    expect(cue.id).toEqual(expect.any(String));
    expect(cue.id.length).toBeGreaterThan(0);
    expect(cue).toMatchObject({ lifeId: before.id, encounterId: before.battle!.encounterId, battleSeed: before.battle!.seed, turn: before.battle!.turn, cardId, cardName: card.name, school: card.school, color: card.color, upgraded, all: !!effect.all, durationMs: 1100, effect });
    expect(cue.actor).toBe(card.actor);
    const affectsEnemies = !!(effect.damage || effect.burn || effect.weak || effect.vulnerable);
    const targets = affectsEnemies ? before.battle!.enemies.filter(enemy => enemy.hp > 0 && (effect.all || enemy.uid === fixture.action.target)) : [];
    expect(cue.targets.map(target => target.uid)).toEqual(targets.map(target => target.uid));
    for (const target of cue.targets) {
      const original = before.battle!.enemies.find(enemy => enemy.uid === target.uid)!;
      const result = after.battle!.enemies.find(enemy => enemy.uid === target.uid)!;
      expect(target).toMatchObject({ index: before.battle!.enemies.indexOf(original), damage: original.hp - result.hp, absorbed: original.block - result.block,
        burn: result.statuses.burn - original.statuses.burn, weak: result.statuses.weak - original.statuses.weak, vulnerable: result.statuses.vulnerable - original.statuses.vulnerable, defeated: original.hp > 0 && result.hp <= 0 });
    }
    const oldBattle = before.battle!, newBattle = after.battle!;
    expect(cue.hero).toEqual({ block: newBattle.block - oldBattle.block, heal: newBattle.hp - oldBattle.hp,
      cleanse: oldBattle.statuses.burn + oldBattle.statuses.weak + oldBattle.statuses.vulnerable - newBattle.statuses.burn - newBattle.statuses.weak - newBattle.statuses.vulnerable,
      draw: newBattle.hand.length - oldBattle.hand.length + 1, energy: newBattle.energy - oldBattle.energy + card.cost });
    expect(buildCardPlayCue(before, after, fixture.action)).toEqual(cue);
    expect(before).toEqual(beforeSnapshot);
    expect(after).toEqual(afterSnapshot);
    expect(before.battle!.rng).toBe(beforeSnapshot.battle!.rng);
    expect(after.battle!.rng).toBe(afterSnapshot.battle!.rng);
  });
});

describe('反馈数值边界与效果类型', () => {
  it('完全格挡只报告被吸收伤害，不伪报生命损失', () => {
    const fixture = ready('neutral-1');
    fixture.state.battle!.statuses = emptyStatuses();
    fixture.state.battle!.enemies[0].block = 80;
    const { cue, before, after } = play(fixture);
    expect(cue.effect.damage).toBe(32);
    expect(cue.targets).toEqual([{ uid: 'enemy-0', index: 0, damage: 0, absorbed: 32, burn: 0, weak: 0, vulnerable: 0, defeated: false }]);
    expect(after.battle!.enemies[0].hp).toBe(before.battle!.enemies[0].hp);
  });

  it('虚弱与易伤的真实伤害、破盾和过量击杀分别反馈', () => {
    const fixture = ready('neutral-1');
    fixture.state.battle!.statuses = { burn: 0, weak: 1, vulnerable: 0 };
    Object.assign(fixture.state.battle!.enemies[0], { hp: 10, block: 20, statuses: { burn: 0, weak: 0, vulnerable: 1 } });
    const { cue } = play(fixture);
    expect(cue.effect.damage).toBe(32);
    expect(cue.targets).toEqual([{ uid: 'enemy-0', index: 0, damage: 10, absorbed: 20, burn: 0, weak: 0, vulnerable: 0, defeated: true }]);
  });

  it('全体攻击跳过已退场敌人并保留原战场索引', () => {
    const fixture = ready('neutral-13'), battle = fixture.state.battle!;
    battle.statuses = emptyStatuses();
    Object.assign(battle.enemies[0], { hp: 24, block: 4 });
    Object.assign(battle.enemies[1], { hp: 0, block: 0 });
    Object.assign(battle.enemies[2], { hp: 100, block: 0 });
    const { cue } = play(fixture);
    expect(cue.all).toBe(true);
    expect(cue.targets).toEqual([
      { uid: 'enemy-0', index: 0, damage: 24, absorbed: 4, burn: 0, weak: 0, vulnerable: 0, defeated: true },
      { uid: 'enemy-2', index: 2, damage: 34, absorbed: 0, burn: 0, weak: 0, vulnerable: 0, defeated: false },
    ]);
  });

  it('单体攻击只反馈实际选择的目标，终结战斗切到奖励仍生成反馈', () => {
    const fixture = ready('neutral-1'), battle = fixture.state.battle!;
    battle.statuses = emptyStatuses();
    battle.enemies[0].hp = 0;
    Object.assign(battle.enemies[1], { hp: 7, block: 0 });
    battle.enemies[2].hp = 0;
    fixture.action.target = battle.enemies[1].uid;
    const { cue, after } = play(fixture);
    expect(after.scene).toBe('reward');
    expect(after.battle!.result).toBe('won');
    expect(cue.targets).toEqual([{ uid: 'enemy-1', index: 1, damage: 7, absorbed: 0, burn: 0, weak: 0, vulnerable: 0, defeated: true }]);
  });

  it('格挡牌不闪动敌方目标；满血治疗保留牌效但实际恢复为零', () => {
    const guard = play(ready('neutral-2')).cue;
    expect(guard.targets).toEqual([]);
    expect(guard.hero.block).toBe(22);
    const fixture = ready('neutral-4');
    fixture.state.battle!.hp = fixture.state.battle!.maxHp;
    const { cue } = play(fixture);
    expect(cue.targets).toEqual([]);
    expect(cue.effect.heal).toBe(28);
    expect(cue.hero.heal).toBe(0);
  });

  it.each([false, true])('手牌10张时观察（强化=$value）只能实际抽入1张', upgraded => {
    const fixture = ready('neutral-3', upgraded), battle = fixture.state.battle!;
    battle.hand = [fixture.owned.uid, ...fixture.state.deck.filter(uid => uid !== fixture.owned.uid).slice(0, 9)];
    battle.drawPile = fixture.state.deck.filter(uid => !battle.hand.includes(uid));
    const { cue, after } = play(fixture);
    expect(cue.effect.draw).toBe(upgraded ? 3 : 2);
    expect(cue.hero.draw).toBe(1);
    expect(after.battle!.hand).toHaveLength(10);
  });

  it('牌堆耗尽时抽牌反馈为零；旧跨流派抽回同一实体仍报告真实1张', () => {
    const empty = ready('neutral-3');
    empty.state.battle!.drawPile = [];
    empty.state.battle!.discard = [];
    expect(play(empty).cue.hero.draw).toBe(0);
    const recycled = ready('identity-custom-2', false, LEGACY_RULESET);
    recycled.state.battle!.drawPile = [];
    recycled.state.battle!.discard = [];
    const originalHand = [...recycled.state.battle!.hand];
    const { cue, after } = play(recycled);
    expect(after.battle!.hand).toContain(recycled.owned.uid);
    expect([...after.battle!.hand].sort()).toEqual(originalHand.sort());
    expect(cue.hero.draw).toBe(1);
  });

  it.each([{ ruleset: CURRENT_RULESET, expected: 1, cost: 1 }, { ruleset: LEGACY_RULESET, expected: 2, cost: 2 }])('$ruleset风行按扣费后的9点上限报告实际回能$expected', ({ ruleset, expected, cost }) => {
    const fixture = ready('wind-4', false, ruleset);
    const { cue, after } = play(fixture);
    expect(cardFor(fixture.state, 'wind-4').cost).toBe(cost);
    expect(after.battle!.energy).toBe(9);
    expect(cue.hero.energy).toBe(expected);
  });

  it('零费回能在已满行动力时报告实际0；强化回能在空余空间时报告2', () => {
    expect(play(ready('neutral-7')).cue.hero.energy).toBe(0);
    const fixture = ready('neutral-7', true);
    fixture.state.battle!.energy = 2;
    const { cue, after } = play(fixture);
    expect(after.battle!.energy).toBe(4);
    expect(cue.hero.energy).toBe(2);
  });

  it('净化报告消除的异常层数；燃烧、虚弱和易伤独立记录真实增加量', () => {
    const cleanse = play(ready('healing-3')).cue;
    expect(cleanse.hero.cleanse).toBe(6);
    expect(cleanse.targets).toEqual([]);
    const burned = play(ready('fire-1', true)).cue;
    expect(burned.targets[0].burn).toBe(4);
    const weakened = play(ready('water-3', true)).cue;
    expect(weakened.targets[0]).toMatchObject({ damage: 0, weak: 4, vulnerable: 3 });
  });
});

describe('只接收同一正式出牌提交的前后快照', () => {
  it.each(['endTurn', 'potion', 'support'] as const)('真实%s动作不产生出牌反馈', type => {
    const fixture = ready('neutral-1');
    fixture.state.companionId = 'roxy';
    const action: GameAction = type === 'support' ? { type, target: 'enemy-0' } : { type };
    const after = resolveAction(fixture.state, action, fixture.state.revision);
    expect(buildCardPlayCue(fixture.state, after, action)).toBeNull();
  });

  it('没有成功提交、未知实体或牌不在原手牌均返回null', () => {
    const fixture = ready('neutral-1');
    expect(buildCardPlayCue(fixture.state, fixture.state, fixture.action)).toBeNull();
    const { before, after, action } = play(fixture);
    expect(buildCardPlayCue(before, after, { ...action, uid: 'missing-card' })).toBeNull();
    const outside = before.collection.find(card => !before.battle!.hand.includes(card.uid))!;
    expect(buildCardPlayCue(before, after, { ...action, uid: outside.uid })).toBeNull();
  });

  const spans: Array<{ name: string; alter: (state: RpgState) => void }> = [
    { name: '不同人生', alter: state => { state.id = 'other-life'; } },
    { name: '不同人生种子', alter: state => { state.seed++; } },
    { name: '不同遭遇', alter: state => { state.battle!.encounterId = 'c7-main-2'; } },
    { name: '不同战斗种子', alter: state => { state.battle!.seed++; } },
    { name: '不同回合', alter: state => { state.battle!.turn++; } },
    { name: '相同修订', alter: state => { state.revision--; } },
    { name: '跳过修订', alter: state => { state.revision++; } },
    { name: '跳过一次出牌', alter: state => { state.battle!.played++; } },
    { name: '没有战局', alter: state => { state.battle = null; } },
    { name: '地区场景', alter: state => { state.scene = 'hub'; } },
    { name: '规则被切换', alter: state => { state.rulesetVersion = LEGACY_RULESET; } },
  ];
  it.each(spans)('$name的跨度不能误报出牌', ({ alter }) => {
    const { before, after, action } = play(ready('neutral-1'));
    alter(after);
    expect(buildCardPlayCue(before, after, action)).toBeNull();
  });

  it('原快照未在战斗或战斗已经结束，均不构建反馈', () => {
    const { before, after, action } = play(ready('neutral-1'));
    const noBattle = structuredClone(before);
    noBattle.battle = null;
    expect(buildCardPlayCue(noBattle, after, action)).toBeNull();
    const ended = structuredClone(before);
    ended.battle!.result = 'lost';
    expect(buildCardPlayCue(ended, after, action)).toBeNull();
  });
});
