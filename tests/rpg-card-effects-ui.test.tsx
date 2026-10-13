import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RpgStory from '../src/pages/RpgStory';
import { createCharacter } from '../src/game/characters';
import { buildCardPlayCue, CARD_PLAY_IMPACT_MS } from '../src/rpg/card-play-effects';
import type { CardPlayCue } from '../src/rpg/card-play-effects';
import { buildBattleFeedbackCue, reduceBattleFeedbackCue, type BattleFeedbackCue } from '../src/rpg/battle-feedback';
import { createBattle, emptyStatuses } from '../src/rpg/combat';
import type { CombatEvent } from '../src/rpg/combat-events';
import { ENCOUNTER_BY_ID } from '../src/rpg/content';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { emptyEnvelope } from '../src/rpg/storage';
import type { RpgStore } from '../src/rpg/context';
import type { RpgState } from '../src/rpg/types';

const runtime = vi.hoisted(() => ({ id: '', store: null as RpgStore | null }));

// Render production pages and effect components without a browser or DOM kit.
// Only initial hook values are needed: all transitions come from saved engine
// states and the provider's transient cue queue.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState<T>(initial: T | (() => T)) {
    return [typeof initial === 'function' ? (initial as () => T)() : initial, () => undefined];
  },
}));
vi.mock('../src/rpg/context', () => ({ useRpg: () => runtime.store }));
vi.mock('react-router', () => ({
  useParams: () => ({ id: runtime.id }),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string; className?: string }) => <a {...props} href={to}>{children}</a>,
}));
vi.mock('../src/hooks/use-dialog-open', () => ({ useDialogOpen: () => false }));
vi.mock('../src/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock('../src/components/rpg/Artwork', () => ({ Portrait: ({ name }: { name: string }) => <span data-portrait={name} /> }));

function ready(cardId = 'neutral-1') {
  let before = createRpg(createCharacter('custom', { budget: 0 }), 'card-effects-ui', '2026-10-13T00:00:00.000Z');
  before = resolveAction(before, { type: 'event', eventId: 'rpg-learning', choiceId: 'blade' }, before.revision);
  if (!before.collection.some(owned => owned.cardId === cardId)) before = resolveAction(before, { type: 'buyCard', cardId }, before.revision);
  const owned = before.collection.find(card => card.cardId === cardId)!;
  if (!before.deck.includes(owned.uid)) before = resolveAction(before, { type: 'setDeck', deck: [owned.uid, ...before.deck.slice(1)] }, before.revision);
  before = resolveAction(before, { type: 'acceptQuest', questId: 'q1-1' }, before.revision);
  before = resolveAction(before, { type: 'startBattle', encounterId: 'c1-main-1' }, before.revision);
  const battle = before.battle!;
  if (!battle.hand.includes(owned.uid)) {
    battle.hand.push(owned.uid);
    battle.drawPile = battle.drawPile.filter(uid => uid !== owned.uid);
  }
  battle.statuses = emptyStatuses();
  return { before, owned, action: { type: 'playCard' as const, uid: owned.uid, target: battle.enemies[0].uid } };
}

function submit(fixture: ReturnType<typeof ready>) {
  const after = resolveAction(fixture.before, fixture.action, fixture.before.revision);
  const cue = buildCardPlayCue(fixture.before, after, fixture.action);
  expect(cue).not.toBeNull();
  return { state: after, cue: cue! };
}

function won() {
  const fixture = ready();
  fixture.before.battle!.enemies[0].hp = 1;
  fixture.before.battle!.enemies[0].block = 0;
  const result = submit(fixture);
  expect(result.state.scene).toBe('reward');
  return result;
}

function render(state: RpgState, cues: readonly CardPlayCue[], feedback: readonly BattleFeedbackCue[] = []) {
  runtime.id = state.id;
  runtime.store!.envelope.saves = { [state.id]: state };
  runtime.store!.cardPlays = cues;
  runtime.store!.battleFeedback = feedback;
  return renderToStaticMarkup(<RpgStory />);
}

function enemyArea(markup: string) {
  return markup.split('<div class="enemy-line">')[1]?.split('<div class="battle-center">')[0] ?? '';
}

function heroArea(markup: string) {
  return markup.split('<div class="hero-portrait-wrap">')[1]?.split('<div class="hero-vitals">')[0] ?? '';
}

function feedbackReady(encounterId = 'c1-main-1') {
  const { before } = ready();
  before.chapter = ENCOUNTER_BY_ID[encounterId].chapter;
  before.battle = createBattle(before, encounterId);
  before.battle.enemies = before.battle.enemies.slice(0, 1);
  before.battle.statuses = emptyStatuses();
  before.battle.enemies[0].statuses = emptyStatuses();
  return before;
}

function submitEnemyTurn(before: RpgState) {
  const observations: CombatEvent[] = [], action = { type: 'endTurn' as const };
  const state = resolveAction(before, action, before.revision, event => observations.push(event));
  const cue = buildBattleFeedbackCue(before, state, action, observations);
  expect(cue).not.toBeNull();
  return { state, cue: cue! };
}

beforeEach(() => {
  runtime.id = '';
  runtime.store = { envelope: emptyEnvelope(), error: null, pending: null, saving: false, cardPlays: [],
    start: vi.fn(), dispatch: vi.fn(), remove: vi.fn(), retry: vi.fn(), dismiss: vi.fn(), refresh: vi.fn() };
});

describe('致胜出牌反馈与领奖过渡', () => {
  it('正式致胜cue播放期间保留战场与最后目标，显示已保存而不显示领奖操作', () => {
    const { state, cue } = won(), snapshot = structuredClone(state);
    const markup = render(state, [cue]);
    expect(markup).toContain('data-scene="battle"');
    expect(markup).toContain('class="rpg-battlefield"');
    expect(markup).toContain('战果已保存，正在收束最后一击。');
    expect(markup).toContain('cast-defeating');
    expect(enemyArea(markup)).toContain('<strong>伤害 1</strong>');
    expect(markup).not.toContain('class="rpg-reward parchment"');
    expect(markup).not.toContain('换成额外12旅费并返回地区');
    expect(runtime.store!.dispatch).not.toHaveBeenCalled();
    expect(state).toEqual(snapshot);
  });

  it('相同已保存战局的cue清理后直接显示首胜奖励，不重结算或自动领奖', () => {
    const { state, cue } = won();
    expect(render(state, [cue])).toContain('战果已保存');
    const markup = render(state, []);
    expect(markup).toContain('data-scene="reward"');
    expect(markup).toContain('class="rpg-reward parchment"');
    expect(markup).toContain('换成额外12旅费并返回地区');
    expect(markup).not.toContain('class="rpg-battlefield"');
    expect(markup).not.toContain('战果已保存');
    expect(runtime.store!.dispatch).not.toHaveBeenCalled();
  });

  const unrelated: Array<{ name: string; patch: Partial<CardPlayCue> }> = [
    { name: '其他人生', patch: { lifeId: 'other-life' } },
    { name: '其他遭遇', patch: { encounterId: 'c1-main-2' } },
    { name: '其他回合', patch: { turn: 2 } },
    { name: '其他战斗种子', patch: { battleSeed: 1 } },
  ];
  it.each(unrelated)('$name的过期cue不延迟当前战局领奖', ({ patch }) => {
    const { state, cue } = won();
    if (patch.battleSeed) patch = { battleSeed: cue.battleSeed + 1 };
    const markup = render(state, [{ ...cue, ...patch }]);
    expect(markup).toContain('data-scene="reward"');
    expect(markup).toContain('class="rpg-reward parchment"');
    expect(markup).not.toContain('战果已保存');
    expect(markup).not.toContain('class="card-cast-event');
  });
});

describe('机制特效展示正式有效数值与目标范围', () => {
  it('被完全格挡的普通攻击显示蓝盾吸收，不误报生命命中或零伤害', () => {
    const fixture = ready('neutral-1');
    fixture.before.battle!.enemies[0].block = 999;
    const { state, cue } = submit(fixture);
    expect(cue.targets[0].damage).toBe(0);
    expect(cue.targets[0].absorbed).toBeGreaterThan(0);
    const target = enemyArea(render(state, [cue]));
    expect(target).toContain(' cast-blocked');
    expect(target).toContain('class="cast-absorb-shield"');
    expect(target).toContain(`<strong>格挡吸收 ${cue.targets[0].absorbed}</strong>`);
    expect(target).not.toContain(' cast-hit');
    expect(target).not.toContain('cast-impact-ring');
    expect(target).not.toContain('cast-impact-burst');
    expect(target).not.toContain('<strong>伤害 0</strong>');
  });

  it('纯防护牌只对主角播放增益反馈，不制造敌方命中或格挡吸收', () => {
    const { state, cue } = submit(ready('neutral-2'));
    expect(cue.targets).toEqual([]);
    expect(cue.hero.block).toBeGreaterThan(0);
    const markup = render(state, [cue]);
    expect(markup).toContain(' cast-self-buff');
    expect(markup).toContain(`<strong>格挡 +${cue.hero.block}</strong>`);
    const enemies = enemyArea(markup);
    expect(enemies).not.toContain('unit-cast-event');
    expect(enemies).not.toContain(' cast-hit');
    expect(enemies).not.toContain('cast-impact-burst');
    expect(enemies).not.toContain('cast-absorb-shield');
  });

  it.each([
    { name: '正常动画', durationMs: 1100, impactMs: CARD_PLAY_IMPACT_MS },
    { name: '减少动画', durationMs: 240, impactMs: 0 },
  ])('$name的命中与数字使用共同的反馈时序', ({ durationMs, impactMs }) => {
    const { state, cue } = submit(ready('neutral-1'));
    expect(cue.targets[0].damage).toBeGreaterThan(0);
    const markup = render(state, [{ ...cue, durationMs }]);
    const targetEvent = enemyArea(markup).match(/<div class="unit-cast-event [^"]*" style="([^"]*)"/)?.[1];
    expect(targetEvent).toBeDefined();
    expect(targetEvent).toContain(`--cast-impact-delay:${impactMs}ms`);
    expect(targetEvent).toContain(`--cast-feedback-duration:${durationMs - impactMs}ms`);
    expect(enemyArea(markup)).toContain(' cast-hit');
    expect(enemyArea(markup)).toContain('cast-impact-burst');
    expect(enemyArea(markup)).toContain(`<strong>伤害 ${cue.targets[0].damage}</strong>`);
  });

  it('连续三次正式施放保留三组动画，只显示最新公告和一次最新真实数字', () => {
    let state = ready('neutral-2').before;
    const guards = state.collection.filter(owned => owned.cardId === 'neutral-2');
    expect(guards).toHaveLength(3);
    guards[2].upgraded = true;
    for (const owned of guards) {
      if (!state.battle!.hand.includes(owned.uid)) {
        state.battle!.hand.push(owned.uid);
        state.battle!.drawPile = state.battle!.drawPile.filter(uid => uid !== owned.uid);
      }
    }
    const cues: CardPlayCue[] = [];
    for (const owned of guards) {
      const action = { type: 'playCard' as const, uid: owned.uid };
      const after = resolveAction(state, action, state.revision);
      const cue = buildCardPlayCue(state, after, action);
      expect(cue).not.toBeNull();
      cues.push(cue!);
      state = after;
    }
    expect(cues.map(cue => cue.hero.block)).toEqual([13, 13, 19]);
    const markup = render(state, cues);
    expect(markup.match(/class="unit-cast-event /g)).toHaveLength(3);
    expect(markup.match(/class="cast-hero-aura mechanism-block"/g)).toHaveLength(3);
    expect(markup.match(/class="cast-feedback-list"/g)).toHaveLength(1);
    expect(markup.match(/<strong>格挡 \+19<\/strong>/g)).toHaveLength(1);
    expect(markup).not.toContain('<strong>格挡 +13</strong>');
    expect(markup.match(/class="card-cast-announcement-event /g)).toHaveLength(1);
    expect(markup).toContain('通用技法 · 强化');
  });

  it('敌方伤害与格挡吸收显示实际变化，混合防护效果显示在主角', () => {
    const fixture = ready('neutral-10'), battle = fixture.before.battle!;
    battle.statuses.weak = 1;
    battle.enemies[0].block = 3;
    const { state, cue } = submit(fixture), markup = render(state, [cue]);
    expect(cue.targets[0]).toMatchObject({ damage: 6, absorbed: 3 });
    expect(enemyArea(markup)).toContain('<strong>伤害 6</strong>');
    expect(enemyArea(markup)).toContain('<strong>格挡吸收 3</strong>');
    expect(markup).toContain(`<strong>格挡 +${cue.hero.block}</strong>`);
    expect(enemyArea(markup)).not.toContain('mechanism-block');
  });

  it('满血治疗显示无有效变化，纯治疗不在敌人播放特效', () => {
    const fixture = ready('neutral-4');
    fixture.before.battle!.hp = fixture.before.battle!.maxHp;
    const { state, cue } = submit(fixture), markup = render(state, [cue]);
    expect(cue.hero.heal).toBe(0);
    expect(markup).toContain('<strong>治疗 · 无有效变化</strong>');
    expect(markup).toContain('cast-unchanged');
    expect(enemyArea(markup)).not.toContain('unit-cast-event');
    expect(enemyArea(markup)).not.toContain('receiving-card-effect');
  });

  it.each(['neutral-3', 'neutral-7'])('纯功能牌%s只反馈主角实际抽牌或回能', cardId => {
    const fixture = ready(cardId), { state, cue } = submit(fixture);
    const markup = render(state, [cue]);
    expect(cue.targets).toEqual([]);
    expect(markup).toContain(cardId === 'neutral-3' ? `<strong>抽牌 +${cue.hero.draw}</strong>` : `<strong>回能 +${cue.hero.energy}</strong>`);
    expect(enemyArea(markup)).not.toContain('unit-cast-event');
    expect(enemyArea(markup)).not.toContain('receiving-card-effect');
  });
});

describe('战斗音效设置的可访问状态', () => {
  it.each([
    { enabled: true, volume: 0.55, label: '音效开启', percent: 55, disabled: false },
    { enabled: false, volume: 0.35, label: '音效关闭', percent: 35, disabled: true },
    { enabled: true, volume: 0, label: '音效开启', percent: 0, disabled: false },
  ])('启用$enabled且音量$percent%时正确标记开关、音量与禁用状态', ({ enabled, volume, label, percent, disabled }) => {
    runtime.store!.audio = { preferences: { enabled, volume }, setEnabled: vi.fn(), setVolume: vi.fn() };
    const markup = render(ready().before, []);
    const toggle = markup.match(/<button[^>]*role="switch"[^>]*>/)?.[0];
    expect(toggle).toContain('aria-label="战斗音效"');
    expect(toggle).toContain(`aria-checked="${enabled}"`);
    expect(markup).toContain(label);
    const slider = markup.match(/<input[^>]*type="range"[^>]*>/)?.[0];
    expect(slider).toBeDefined();
    expect(slider).toContain('aria-label="战斗音效音量"');
    expect(slider).toContain(`value="${percent}"`);
    expect(slider).toContain('min="0"');
    expect(slider).toContain('max="100"');
    expect(slider!.includes('disabled=""')).toBe(disabled);
    expect(markup).toContain(`<span>${percent}%</span>`);
    expect(runtime.store!.audio!.setEnabled).not.toHaveBeenCalled();
    expect(runtime.store!.audio!.setVolume).not.toHaveBeenCalled();
  });
});

describe('正式敌方回合、受伤与胜负演出', () => {
  it('敌回合正在播放时暂禁下一操作，清理后原战局继续且不重结算', () => {
    const before = feedbackReady();
    before.battle!.enemies[0].intent = { kind: 'attack', amount: 10, label: '正式进攻' };
    const { state, cue } = submitEnemyTurn(before), snapshot = structuredClone(state);
    expect(state.battle!.result).toBe('playing');
    const markup = render(state, [], [cue]);
    expect(markup).toContain('敌方回合已保存，正在播放行动反馈。');
    expect(markup).toContain('class="enemy-action-effects"');
    expect(markup.match(/<button class="end-turn"[^>]*>/)?.[0]).toContain('disabled=""');
    const cards = markup.match(/<button[^>]*class="[^"]*rpg-card[^"]*"[^>]*>/g) ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(card => card.includes('disabled=""'))).toBe(true);
    const cleared = render(state, []);
    expect(cleared).not.toContain('敌方回合已保存');
    expect(cleared).not.toContain('class="hero-damage-effects"');
    expect(cleared.match(/<button class="end-turn"[^>]*>/)?.[0]).not.toContain('disabled=""');
    expect(runtime.store!.dispatch).not.toHaveBeenCalled();
    expect(state).toEqual(snapshot);
  });

  it('敌方伤害与部分吸收显示在主角，使用实际HP和格挡变化', () => {
    const before = feedbackReady(), battle = before.battle!;
    battle.block = 3;
    battle.enemies[0].intent = { kind: 'attack', amount: 10, label: '破盾进攻' };
    const { state, cue } = submitEnemyTurn(before);
    expect(cue.events[0]).toMatchObject({ damage: 7, absorbed: 3 });
    const hero = heroArea(render(state, [], [cue]));
    expect(hero).toContain('hero-feedback-damaged');
    expect(hero).toContain('class="battle-hero-impact"');
    expect(hero).toContain('battle-hero-damage-ring');
    expect(hero).toContain('battle-shield-partial');
    expect(hero).toContain('受伤 −7');
    expect(hero).toContain('格挡 3');
    expect(state.battle!.hp).toBe(battle.hp - 7);
  });

  it('敌方攻击被完全吸收时只显示蓝盾，主角无受伤冲击或红环', () => {
    const before = feedbackReady(), battle = before.battle!;
    battle.block = 99;
    battle.enemies[0].intent = { kind: 'attack', amount: 12, label: '被格挡的进攻' };
    const { state, cue } = submitEnemyTurn(before);
    expect(cue.events[0]).toMatchObject({ damage: 0, absorbed: 12 });
    const hero = heroArea(render(state, [], [cue]));
    expect(hero).toContain('hero-feedback-protected');
    expect(hero).toContain('class="battle-hero-shield"');
    expect(hero).toContain('格挡 12');
    expect(hero).not.toContain('hero-feedback-damaged');
    expect(hero).not.toContain('battle-hero-impact');
    expect(hero).not.toContain('battle-hero-damage-ring');
    expect(hero).not.toContain('受伤');
    expect(state.battle!.hp).toBe(battle.hp);
  });

  it('主角燃烧独立显示实际损伤，不被格挡吸收', () => {
    const before = feedbackReady(), battle = before.battle!;
    battle.block = 99;
    battle.statuses.burn = 6;
    battle.enemies[0].intent = { kind: 'guard', amount: 12, label: '敌方守势' };
    const { state, cue } = submitEnemyTurn(before);
    expect(cue.events[0]).toMatchObject({ kind: 'hero-burn', damage: 6, absorbed: 0 });
    const hero = heroArea(render(state, [], [cue]));
    expect(hero).toContain('battle-hero-burn-impact');
    expect(hero).toContain('燃烧 −6');
    expect(hero).not.toContain('battle-hero-shield');
    expect(state.battle!.hp).toBe(battle.hp - 6);
  });

  it('完全格挡仍显示独立护送损伤，护送目标数字与实际回执一致', () => {
    const before = feedbackReady('c4-main-6'), battle = before.battle!;
    battle.block = 99;
    battle.enemies[0].intent = { kind: 'attack', amount: 14, label: '压制护送' };
    const { state, cue } = submitEnemyTurn(before), hit = cue.events[0];
    expect(hit).toMatchObject({ damage: 0, absorbed: 17, escortDamage: 2 });
    const markup = render(state, [], [cue]), hero = heroArea(markup);
    expect(hero).toContain('格挡 17');
    expect(hero).toContain('护送 −2');
    expect(hero).not.toContain('battle-hero-impact');
    expect(markup).toContain('护送目标 −2');
    expect(markup).toContain(`aria-label="护送目标生命" aria-valuenow="${state.battle!.escortHp}"`);
    expect(state.battle!.escortHp).toBe(battle.escortHp - hit.escortDamage);
    expect(state.battle!.hp).toBe(battle.hp);
  });

  it.each([false, true])('敌人燃烧致胜（减少动画=$value）只归属敌人，保留胜利后清理进入奖励', reduced => {
    const before = feedbackReady(), enemy = before.battle!.enemies[0];
    enemy.hp = 1;
    enemy.statuses.burn = 8;
    enemy.intent = { kind: 'attack', amount: 99, label: '取消的攻击' };
    const { state, cue: original } = submitEnemyTurn(before), cue = reduced ? reduceBattleFeedbackCue(original) : original;
    expect(cue.events).toHaveLength(1);
    expect(cue.events[0]).toMatchObject({ kind: 'enemy-burn', damage: 1, defeated: true });
    expect(state.scene).toBe('reward');
    const markup = render(state, [], [cue]), hero = heroArea(markup);
    expect(markup).toContain('data-scene="battle"');
    expect(markup).toContain('战果已保存，正在收束最后一击。');
    expect(markup).toContain('战斗胜利');
    expect(markup).toContain('全部敌人已击退');
    expect(enemyArea(markup)).toContain('燃烧 −1 · 退场');
    expect(hero).not.toContain('hero-damage-effects');
    expect(hero).not.toContain('battle-hero-impact');
    expect(hero).not.toContain('battle-hero-damage-ring');
    expect(hero).not.toContain('受伤');
    expect(markup).not.toContain('class="rpg-reward parchment"');
    const cleared = render(state, []);
    expect(cleared).toContain('data-scene="reward"');
    expect(cleared).toContain('class="rpg-reward parchment"');
    expect(cleared).not.toContain('rpg-battlefield');
    expect(runtime.store!.dispatch).not.toHaveBeenCalled();
  });

  it('战败播放期间仅显示已保存提示，清理后显示免费重试且不判人生死亡', () => {
    const before = feedbackReady(), battle = before.battle!;
    battle.hp = 3;
    battle.block = 0;
    battle.enemies[0].intent = { kind: 'attack', amount: 80, label: '致败攻击' };
    const { state, cue } = submitEnemyTurn(before);
    expect(state.status).toBe('active');
    expect(state.battle!.result).toBe('lost');
    const markup = render(state, [], [cue]);
    expect(markup).toContain('战斗失利');
    expect(markup).toContain('主角失去作战能力');
    expect(markup).toContain('战败已保存，正在收束最后一轮。');
    expect(heroArea(markup)).toContain('受伤 −3');
    expect(markup).not.toContain('class="battle-result parchment"');
    expect(markup).not.toContain('免费重试</button>');
    const cleared = render(state, []);
    expect(cleared).toContain('class="battle-result parchment"');
    expect(cleared).toContain('免费重试</button>');
    expect(cleared).toContain('本场失败不会结束人生，可免费重试。');
    expect(cleared).not.toContain('战败已保存');
    expect(cleared).not.toContain('battle-outcome-banner');
    expect(runtime.store!.dispatch).not.toHaveBeenCalled();
  });

  it('重试后同人生、种子、回合的旧revision反馈不会泄漏到新战局', () => {
    const before = feedbackReady(), battle = before.battle!;
    battle.hp = 1;
    battle.enemies[0].intent = { kind: 'attack', amount: 80, label: '旧战败进攻' };
    const { state, cue } = submitEnemyTurn(before);
    const retried = resolveAction(state, { type: 'retryBattle' }, state.revision);
    expect(retried.battle!.result).toBe('playing');
    expect(retried.battle!.turn).toBe(cue.turn);
    expect(retried.battle!.seed).toBe(cue.battleSeed);
    expect(retried.revision).toBeGreaterThan(cue.revision);
    const markup = render(retried, [], [cue]);
    expect(markup).not.toContain('battle-feedback-stage');
    expect(markup).not.toContain('hero-damage-effects');
    expect(markup).not.toContain('旧战败进攻');
    expect(markup).not.toContain('战斗失利');
    expect(markup.match(/<button class="end-turn"[^>]*>/)?.[0]).not.toContain('disabled=""');
  });

  it('其他标签提交的新revision战局不继承上一回合反馈或禁用操作', () => {
    const before = feedbackReady();
    before.battle!.enemies[0].intent = { kind: 'attack', amount: 10, label: '旧标签进攻' };
    const { state, cue } = submitEnemyTurn(before);
    const refreshed = resolveAction(state, { type: 'potion' }, state.revision);
    expect(refreshed.battle!.turn).toBe(cue.turn);
    expect(refreshed.battle!.seed).toBe(cue.battleSeed);
    expect(refreshed.revision).toBeGreaterThan(cue.revision);
    const markup = render(refreshed, [], [cue]);
    expect(markup).not.toContain('battle-feedback-stage');
    expect(markup).not.toContain('hero-damage-effects');
    expect(markup).not.toContain('敌方回合已保存');
    expect(markup.match(/<button class="end-turn"[^>]*>/)?.[0]).not.toContain('disabled=""');
  });

  it('减少动画将多段真实命中汇总在独立静态回执，逐击层标记为隐藏序列', () => {
    const before = feedbackReady(), battle = before.battle!;
    battle.block = 12;
    battle.statuses.burn = 3;
    battle.enemies[0].intent = { kind: 'attack', amount: 10, hits: 3, label: '三连击' };
    const { state, cue: original } = submitEnemyTurn(before), cue = reduceBattleFeedbackCue(original);
    expect(cue.events.map(event => [event.kind, event.damage, event.absorbed])).toEqual([
      ['hero-burn', 3, 0], ['enemy-attack', 0, 10], ['enemy-attack', 8, 2], ['enemy-attack', 10, 0],
    ]);
    const hero = heroArea(render(state, [], [cue]));
    expect(hero).toContain('class="hero-damage-effects battle-feedback-is-reduced"');
    const summary = hero.split('<div class="battle-feedback-summary hero-feedback-damaged">')[1];
    expect(summary).toBeDefined();
    expect(summary).toContain('受伤 −21');
    expect(summary).toContain('格挡 12');
    expect(summary).not.toContain('受伤 −8');
    expect(summary).not.toContain('受伤 −10');
    expect(summary!.match(/class="battle-hero-values"/g)).toHaveLength(1);
    expect(hero.match(/battle-feedback-event feedback-sequential/g)).toHaveLength(4);
    expect(cue.events.every(event => event.offsetMs === 0 && event.impactMs === 0 && event.durationMs === 220)).toBe(true);
  });

  it('练习胜利不宣称存在首胜奖励，结算后直接显示练习完成', () => {
    const before = feedbackReady(), battle = before.battle!, enemy = battle.enemies[0];
    before.victories.push(battle.encounterId);
    before.claimedRewards.push(battle.encounterId);
    enemy.hp = 1;
    enemy.statuses.burn = 8;
    const { state, cue } = submitEnemyTurn(before);
    expect(state.reward).toBeNull();
    expect(state.scene).toBe('battle');
    const markup = render(state, [], [cue]);
    expect(markup).toContain('战斗胜利');
    expect(markup).toContain('战斗目标已完成');
    expect(markup).not.toContain('奖励已就绪');
    expect(markup).not.toContain('class="battle-result parchment"');
    expect(render(state, [])).toContain('练习完成');
  });
});
