import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { buildBattleFeedbackCue, reduceBattleFeedbackCue } from '../src/rpg/battle-feedback';
import { createBattle, emptyStatuses, endTurn } from '../src/rpg/combat';
import type { CombatEvent } from '../src/rpg/combat-events';
import { ENCOUNTERS, ENCOUNTER_BY_ID } from '../src/rpg/content';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { CURRENT_RULESET, LEGACY_RULESET } from '../src/rpg/rulesets';
import type { GameAction, Intent, RpgState, RulesetVersion } from '../src/rpg/types';

function ready(id = 'c2-main-1', version: RulesetVersion = CURRENT_RULESET) {
  const state = createRpg(createCharacter('custom', { budget: 0 }), `feedback:${id}:${version}`, '2026-10-13T00:00:00.000Z', version);
  state.chapter = ENCOUNTER_BY_ID[id].chapter;
  state.scene = 'battle';
  state.battle = createBattle(state, id);
  return state;
}

function collect(state: RpgState, action: GameAction = { type: 'endTurn' }) {
  const events: CombatEvent[] = [];
  const after = resolveAction(state, action, state.revision, event => events.push(event));
  return { after, events, cue: buildBattleFeedbackCue(state, after, action, events) };
}

function onlyEnemy(state: RpgState) {
  state.battle!.enemies = state.battle!.enemies.slice(0, 1);
  return state.battle!.enemies[0];
}

function finishCard(state: RpgState) {
  const battle = state.battle!, card = state.collection.find(owned => owned.cardId === 'neutral-1')!;
  battle.hand = [card.uid];
  battle.energy = 9;
  battle.statuses = emptyStatuses();
  battle.enemies.forEach((enemy, index) => { enemy.hp = index ? 0 : 1; enemy.block = 0; });
  return { type: 'playCard' as const, uid: card.uid, target: battle.enemies[0].uid };
}

const rules = [LEGACY_RULESET, CURRENT_RULESET];
const encounterCases = rules.flatMap(version => ENCOUNTERS.map(encounter => ({ version, id: encounter.id })));

describe('敌方反馈直接观察真实结算，保持全部旧新战局完全一致', () => {
  it.each(encounterCases)('$version／$id 有无observer的战局、日志与RNG完全一致', ({ version, id }) => {
    const state = ready(id, version), original = structuredClone(state);
    const expected = resolveAction(state, { type: 'endTurn' }, state.revision);
    const { after, events, cue } = collect(state);
    expect(after).toEqual(expected);
    expect(state).toEqual(original);
    expect(after.battle!.rng).toBe(expected.battle!.rng);
    expect(events.length).toBeGreaterThan(0);
    expect(cue).not.toBeNull();
    expect(cue).toMatchObject({ lifeId: state.id, encounterId: id, revision: after.revision, battleSeed: state.battle!.seed, sourceTurn: 1, turn: after.battle!.turn });
    expect(cue!.events.reduce((sum, event) => sum + (event.kind === 'hero-burn' || event.kind === 'enemy-attack' ? event.damage : 0), 0)).toBe(after.battle!.damageTaken - state.battle!.damageTaken);
    const serialized = JSON.stringify(after);
    expect(serialized).not.toContain('offsetMs');
    expect(serialized).not.toContain('enemy-attack');
    expect(serialized).not.toContain('battleFeedback');
  });

  const intents: Intent[] = [
    { kind: 'attack', amount: 8, hits: 3, label: '连击' }, { kind: 'guard', amount: 12, label: '守势' },
    { kind: 'heal', amount: 12, label: '恢复' }, { kind: 'burn', amount: 3, label: '引燃' },
    { kind: 'weak', amount: 2, label: '牵制' }, { kind: 'vulnerable', amount: 2, label: '破绽' },
    { kind: 'drain', amount: 2, label: '扰乱' }, { kind: 'ritual', amount: 1, label: '仪式' },
  ];
  it.each(rules.flatMap(version => intents.map(intent => ({ version, intent }))))('$version／$intent.kind observer抛错或修改事件不影响任何结算', ({ version, intent }) => {
    const state = ready('c2-main-1', version), enemy = onlyEnemy(state);
    enemy.intent = intent;
    enemy.hp -= 30;
    enemy.statuses.burn = 2;
    state.battle!.statuses.burn = 2;
    const expected = resolveAction(state, { type: 'endTurn' }, state.revision);
    let calls = 0;
    const throwing = resolveAction(state, { type: 'endTurn' }, state.revision, () => { calls++; throw new Error('音效不可用'); });
    expect(calls).toBeGreaterThan(1);
    expect(throwing).toEqual(expected);
    const mutating = resolveAction(state, { type: 'endTurn' }, state.revision, event => { event.damage = 999; event.amount = 999; event.enemyUid = 'foreign'; });
    expect(mutating).toEqual(expected);
    const direct = structuredClone(state), directExpected = structuredClone(state);
    endTurn(directExpected);
    endTurn(direct, () => { throw new Error('演出不可用'); });
    expect(direct).toEqual(directExpected);
  });
});

describe('逐段攻击、燃烧和非伤害行动的真实数值', () => {
  it('连击逐段报告格挡、破盾、生命损失和过量伤害，下一敌人不会行动', () => {
    const state = ready(), battle = state.battle!;
    battle.hp = 7;
    battle.block = 12;
    battle.statuses = emptyStatuses();
    battle.enemies[0].statuses = emptyStatuses();
    battle.enemies[0].intent = { kind: 'attack', amount: 9, hits: 3, label: '三连击' };
    battle.enemies[1].intent = { kind: 'attack', amount: 99, label: '后续攻击' };
    const { after, events } = collect(state);
    expect(events).toEqual([
      { kind: 'enemy-attack', enemyUid: 'enemy-0', label: '三连击', damage: 0, absorbed: 10, amount: 10, escortDamage: 0, hitIndex: 0, hitCount: 3, defeated: false },
      { kind: 'enemy-attack', enemyUid: 'enemy-0', label: '三连击', damage: 7, absorbed: 2, amount: 10, escortDamage: 0, hitIndex: 1, hitCount: 3, defeated: true },
      { kind: 'enemy-attack', enemyUid: 'enemy-0', label: '三连击', damage: 0, absorbed: 0, amount: 10, escortDamage: 0, hitIndex: 2, hitCount: 3, defeated: false },
    ]);
    expect(after.battle).toMatchObject({ hp: 0, block: 0, damageTaken: 7, result: 'lost', turn: 1 });
  });

  it('行动前燃烧与先施加的易伤按照真实顺序反馈，格挡不吸收燃烧', () => {
    const state = ready(), battle = state.battle!;
    battle.block = 20;
    battle.statuses = { burn: 3, weak: 2, vulnerable: 1 };
    battle.enemies[0].statuses.burn = 2;
    battle.enemies[0].intent = { kind: 'vulnerable', amount: 2, label: '破绽' };
    battle.enemies[1].statuses.weak = 1;
    battle.enemies[1].intent = { kind: 'attack', amount: 10, hits: 3, label: '压制' };
    const { events, after } = collect(state);
    expect(events.map(event => event.kind)).toEqual(['hero-burn', 'enemy-burn', 'enemy-status', 'enemy-attack', 'enemy-attack', 'enemy-attack']);
    expect(events[0]).toMatchObject({ damage: 3, absorbed: 0 });
    expect(events[1]).toMatchObject({ enemyUid: 'enemy-0', damage: 2, absorbed: 0 });
    expect(events[2]).toMatchObject({ amount: 2, status: 'vulnerable' });
    expect(events.slice(3).map(event => [event.amount, event.damage, event.absorbed])).toEqual([[12, 0, 12], [12, 4, 8], [12, 12, 0]]);
    expect(after.battle!.damageTaken).toBe(19);
  });

  it('主角燃烧致死只产生实际1点伤害，所有敌方行动取消', () => {
    const state = ready(), battle = state.battle!;
    battle.hp = 1;
    battle.block = 99;
    battle.statuses.burn = 8;
    const { events, after, cue } = collect(state);
    expect(events).toEqual([{ kind: 'hero-burn', label: '燃烧', damage: 1, absorbed: 0, amount: 1, escortDamage: 0, defeated: true }]);
    expect(after.battle!.block).toBe(99);
    expect(cue!.outcome).toMatchObject({ result: 'lost', reason: '主角失去作战能力' });
  });

  it('敌人被燃烧击倒后跳过意图，仅剩敌人继续行动', () => {
    const state = ready(), battle = state.battle!;
    battle.enemies[0].hp = 1;
    battle.enemies[0].block = 99;
    battle.enemies[0].statuses.burn = 8;
    battle.enemies[0].intent = { kind: 'vulnerable', amount: 6, label: '不应施加' };
    battle.enemies[1].intent = { kind: 'guard', amount: 20, label: '守势' };
    const { events } = collect(state);
    expect(events.map(event => event.kind)).toEqual(['enemy-burn', 'enemy-guard']);
    expect(events[0]).toMatchObject({ enemyUid: 'enemy-0', damage: 1, defeated: true });
    expect(events[1]).toMatchObject({ amount: 21 });
  });

  it.each([false, true])('再生反馈报告恢复上限与最后燃烧的抑制（已研究=$value）', studied => {
    const state = ready('c4-main-9'), enemy = onlyEnemy(state);
    enemy.hp = enemy.maxHp - 3;
    enemy.statuses.burn = studied ? 0 : 1;
    enemy.intent = { kind: 'heal', amount: 20, label: '再生' };
    if (studied) state.flags.push('hydraCounterKnown');
    const { events, after } = collect(state);
    expect(events.at(-1)).toMatchObject({ kind: 'enemy-heal', amount: studied ? 3 : 4 });
    expect(after.battle!.enemies[0].hp).toBe(enemy.maxHp);
  });

  it('满血恢复与无保留手牌的扰乱报告0，不伪造损失', () => {
    const healing = ready();
    onlyEnemy(healing).intent = { kind: 'heal', amount: 20, label: '恢复' };
    expect(collect(healing).events[0]).toMatchObject({ kind: 'enemy-heal', amount: 0 });
    const draining = ready();
    onlyEnemy(draining).intent = { kind: 'drain', amount: 2, label: '扰乱' };
    expect(collect(draining).events[0]).toMatchObject({ kind: 'enemy-drain', amount: 0 });
  });

  it('扰乱只报告实际移除的保留牌数量，非保留牌已在敌方回合前弃掉', () => {
    const state = ready(), battle = state.battle!;
    const retained = { uid: 'retained-feedback', cardId: 'neutral-8', upgraded: false };
    state.collection.push(retained);
    state.deck.push(retained.uid);
    battle.hand.push(retained.uid);
    onlyEnemy(state).intent = { kind: 'drain', amount: 3, label: '扰乱保留' };
    const { events, after } = collect(state);
    expect(events[0]).toMatchObject({ kind: 'enemy-drain', amount: 1 });
    expect(after.battle!.discard).toContain(retained.uid);
  });

  it.each(['burn', 'weak', 'vulnerable'] as const)('异常%s报告新施加数量而不是过期层数的净差', status => {
    const state = ready();
    state.battle!.statuses[status] = 2;
    onlyEnemy(state).intent = { kind: status, amount: 3, label: '施加异常' };
    const { events } = collect(state);
    expect(events.at(-1)).toMatchObject({ kind: 'enemy-status', amount: 3, status });
  });

  it('护送损伤按每一击真实计算并截断于0，守护伤害和主角伤害分开', () => {
    const state = ready('c4-main-6'), battle = state.battle!;
    battle.escortHp = 5;
    battle.block = 99;
    battle.statuses = emptyStatuses();
    onlyEnemy(state).intent = { kind: 'attack', amount: 20, hits: 3, label: '压制护送' };
    const { events, after } = collect(state);
    expect(events.map(event => event.escortDamage)).toEqual([2, 2, 1]);
    expect(events.map(event => event.damage)).toEqual([0, 0, 0]);
    expect(events.map(event => event.absorbed)).toEqual([23, 23, 23]);
    expect(after.battle).toMatchObject({ escortHp: 0, hp: battle.hp, result: 'lost' });
  });
});

describe('胜负反馈遵循真实目标和失败优先级', () => {
  it('出牌击杀先播放最后一击，援助击杀也产生胜利但不伪造敌方行动', () => {
    const state = ready(), action = finishCard(state);
    const { after, cue } = collect(state, action);
    expect(after.scene).toBe('reward');
    expect(cue!.events).toEqual([]);
    expect(cue!.outcome).toMatchObject({ result: 'won', reason: '全部敌人已击退' });
    expect(cue!.outcome!.offsetMs).toBeGreaterThanOrEqual(500);
    const support = ready();
    support.companionId = 'eris';
    finishCard(support);
    const supporting = collect(support, { type: 'support', target: 'enemy-0' });
    expect(supporting.after.scene).toBe('reward');
    expect(supporting.cue!.events).toEqual([]);
    expect(supporting.cue!.outcome).toMatchObject({ result: 'won', reason: '全部敌人已击退', offsetMs: 180 });
  });

  it('最后敌人被燃烧击倒立即结束战斗，结果排在燃烧后且不推进回合', () => {
    const state = ready(), enemy = onlyEnemy(state);
    enemy.hp = 1;
    enemy.statuses.burn = 8;
    enemy.intent = { kind: 'attack', amount: 99, label: '不应行动' };
    const { events, after, cue } = collect(state);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'enemy-burn', damage: 1, defeated: true });
    expect(after.scene).toBe('reward');
    expect(after.battle!.turn).toBe(1);
    expect(cue!.outcome!.offsetMs).toBe(cue!.events[0].offsetMs + cue!.events[0].durationMs);
  });

  it.each([
    { id: 'c3-main-18', reason: '守住撤离窗口' },
    { id: 'c4-main-6', reason: '护送目标安全抵达' },
  ])('$id达到守护回合可胜利，保留仍存活的敌人', ({ id, reason }) => {
    const state = ready(id);
    state.battle!.turn = ENCOUNTER_BY_ID[id].rounds;
    state.battle!.enemies.forEach(enemy => { enemy.intent = { kind: 'guard', amount: 0, label: '守势' }; });
    const { after, cue } = collect(state);
    expect(after.battle!.enemies.some(enemy => enemy.hp > 0)).toBe(true);
    expect(cue!.outcome).toMatchObject({ result: 'won', reason });
  });

  it('仪式压制需真实撑过3回合，击破核心使用另一胜因', () => {
    const state = ready('c7-main-9'), enemy = onlyEnemy(state);
    state.battle!.turn = 3;
    state.battle!.ritual = 0;
    enemy.intent = { kind: 'guard', amount: 0, label: '守势' };
    expect(collect(state).cue!.outcome).toMatchObject({ result: 'won', reason: '仪式已压制' });
    const core = ready('c7-main-9'), action = finishCard(core);
    expect(collect(core, action).cue!.outcome).toMatchObject({ result: 'won', reason: '仪式核心已击破' });
  });

  it('救援最后一回合击杀是完成救援，超过时限即使击杀仍失败', () => {
    const timely = ready('c3-main-13'), late = ready('c3-main-13');
    timely.battle!.turn = ENCOUNTER_BY_ID[timely.battle!.encounterId].rounds;
    late.battle!.turn = timely.battle!.turn + 1;
    expect(collect(timely, finishCard(timely)).cue!.outcome).toMatchObject({ result: 'won', reason: '击退阻截者，救援完成' });
    expect(collect(late, finishCard(late)).cue!.outcome).toMatchObject({ result: 'lost', reason: '救援时限已过' });
  });

  it('救援超时、护送倒下与仪式失控各有真实败因', () => {
    const rescue = ready('c3-main-13');
    rescue.battle!.turn = ENCOUNTER_BY_ID['c3-main-13'].rounds;
    rescue.battle!.enemies.forEach(enemy => { enemy.intent = { kind: 'guard', amount: 0, label: '守势' }; });
    expect(collect(rescue).cue!.outcome).toMatchObject({ result: 'lost', reason: '救援时限已过' });
    const escort = ready('c4-main-6');
    escort.battle!.escortHp = 1;
    onlyEnemy(escort).intent = { kind: 'attack', amount: 1, label: '压制' };
    expect(collect(escort).cue!.outcome).toMatchObject({ result: 'lost', reason: '护送目标被击倒' });
    const ritual = ready('c7-main-9');
    ritual.battle!.ritual = 7;
    onlyEnemy(ritual).intent = { kind: 'ritual', amount: 2, label: '仪式推进' };
    const overload = collect(ritual);
    expect(overload.events[0]).toMatchObject({ kind: 'enemy-ritual', amount: 2 });
    expect(overload.cue!.outcome).toMatchObject({ result: 'lost', reason: '仪式失控' });
  });

  it('主角同时倒下优先于护送目标倒下和仪式目标，普通战败不封存人生', () => {
    const state = ready('c4-main-6');
    state.battle!.hp = 1;
    state.battle!.escortHp = 1;
    onlyEnemy(state).intent = { kind: 'attack', amount: 99, label: '重击' };
    const { after, cue } = collect(state);
    expect(after.status).toBe('active');
    expect(cue!.outcome).toMatchObject({ result: 'lost', reason: '主角失去作战能力' });
  });
});

describe('临时回执的生命周期和序列', () => {
  it('正常连续事件文字不重叠；长连击压缩至3200ms，结果在所有事件后', () => {
    const state = ready('c7-main-1'), battle = state.battle!;
    battle.hp = 1;
    battle.block = 99;
    battle.statuses.burn = 0;
    battle.enemies[0].intent = { kind: 'attack', amount: 2, hits: 60, label: '长连击边界' };
    const { cue } = collect(state);
    expect(cue!.durationMs).toBeLessThanOrEqual(3200);
    expect(cue!.events.length).toBe(60);
    for (const [index, event] of cue!.events.entries()) {
      expect(event.impactMs).toBeLessThanOrEqual(event.durationMs / 2);
      if (index) expect(event.offsetMs).toBeGreaterThanOrEqual(cue!.events[index - 1].offsetMs + cue!.events[index - 1].durationMs);
    }
    expect(cue!.outcome!.offsetMs).toBeGreaterThanOrEqual(cue!.events.at(-1)!.offsetMs + cue!.events.at(-1)!.durationMs);
  });

  it('减少动画将回执降为240ms，保留每一个真实数值且不修改原始回执或战局', () => {
    const state = ready();
    state.battle!.hp = 1;
    onlyEnemy(state).intent = { kind: 'attack', amount: 8, hits: 2, label: '连击' };
    const { cue, after } = collect(state), snapshot = structuredClone(cue), battle = structuredClone(after);
    const reduced = reduceBattleFeedbackCue(cue!);
    expect(reduced.durationMs).toBe(240);
    for (const [index, event] of reduced.events.entries()) expect(event).toEqual({ ...cue!.events[index], offsetMs: 0, impactMs: 0, durationMs: 220 });
    expect(reduced.outcome).toEqual({ ...cue!.outcome, offsetMs: 0, durationMs: 220 });
    expect(cue).toEqual(snapshot);
    expect(after).toEqual(battle);
  });

  it('回执重复构建一致，输入事件与前后存档均不改动', () => {
    const state = ready(), { after, events, cue } = collect(state);
    const snapshots = structuredClone({ state, after, events });
    expect(buildBattleFeedbackCue(state, after, { type: 'endTurn' }, events)).toEqual(cue);
    expect({ state, after, events }).toEqual(snapshots);
    expect(cue!.id.startsWith('feedback:')).toBe(true);
  });

  const invalidSpans: Array<{ name: string; change: (state: RpgState) => void }> = [
    { name: '人生', change: state => { state.id += 'other'; } },
    { name: '人生种子', change: state => { state.seed++; } },
    { name: '遭遇', change: state => { state.battle!.encounterId = 'c2-main-2'; } },
    { name: '战斗种子', change: state => { state.battle!.seed++; } },
    { name: '跨回合', change: state => { state.battle!.turn += 2; } },
    { name: '修订未增', change: state => { state.revision--; } },
    { name: '修订多增', change: state => { state.revision++; } },
    { name: '规则更换', change: state => { state.rulesetVersion = LEGACY_RULESET; } },
    { name: '战局移除', change: state => { state.battle = null; } },
    { name: '返回地区', change: state => { state.scene = 'hub'; } },
  ];
  it.each(invalidSpans)('不同$name不制造回执', ({ change }) => {
    const state = ready(), { after, events } = collect(state);
    change(after);
    expect(buildBattleFeedbackCue(state, after, { type: 'endTurn' }, events)).toBeNull();
  });

  it('重试、治疗、非法动作与已结束战局不复播；非致胜出牌／援助不制造敌方回执', () => {
    const state = ready(), { after, events } = collect(state);
    expect(buildBattleFeedbackCue(state, after, { type: 'potion' }, events)).toBeNull();
    expect(buildBattleFeedbackCue(state, after, { type: 'retryBattle' }, events)).toBeNull();
    const started = ready(), action = finishCard(started);
    started.battle!.enemies[0].hp = 100;
    expect(collect(started, action).cue).toBeNull();
    const support = ready();
    support.companionId = 'eris';
    expect(collect(support, { type: 'support', target: 'enemy-0' }).cue).toBeNull();
    let calls = 0;
    expect(() => resolveAction(state, { type: 'endTurn' }, state.revision + 1, () => { calls++; })).toThrow('动作已结算');
    expect(calls).toBe(0);
    state.battle!.result = 'lost';
    expect(buildBattleFeedbackCue(state, after, { type: 'endTurn' }, events)).toBeNull();
  });
});
