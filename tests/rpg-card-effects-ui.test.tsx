import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RpgStory from '../src/pages/RpgStory';
import { createCharacter } from '../src/game/characters';
import { buildCardPlayCue } from '../src/rpg/card-play-effects';
import type { CardPlayCue } from '../src/rpg/card-play-effects';
import { emptyStatuses } from '../src/rpg/combat';
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

function render(state: RpgState, cues: readonly CardPlayCue[]) {
  runtime.id = state.id;
  runtime.store!.envelope.saves = { [state.id]: state };
  runtime.store!.cardPlays = cues;
  return renderToStaticMarkup(<RpgStory />);
}

function enemyArea(markup: string) {
  return markup.split('<div class="enemy-line">')[1]?.split('<div class="battle-center">')[0] ?? '';
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
