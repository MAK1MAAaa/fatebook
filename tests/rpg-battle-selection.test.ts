import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { useBattleSelection } from '../src/hooks/use-battle-selection';
import type { GameAction } from '../src/rpg/types';

const host = vi.hoisted(() => ({ slots: [] as unknown[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState<T>(initial: T) {
    const index = 0;
    if (host.slots.length <= index) host.slots[index] = initial;
    return [host.slots[index] as T, (next: T) => { host.slots[index] = next; }];
  },
}));

const ready = () => {
  let state = createRpg(createCharacter('custom', { budget: 0 }), 'selection');
  for (const action of [{ type: 'event', eventId: 'rpg-learning', choiceId: 'magic' }, { type: 'acceptQuest', questId: 'q1-1' }, { type: 'startBattle', encounterId: 'c1-main-1' }] as GameAction[]) state = resolveAction(state, action, state.revision);
  return state;
};
beforeEach(() => { host.slots = []; });

describe('战斗选牌保存事务', () => {
  it('等待与失败保留选牌，成功保存才清除', async () => {
    const state = ready(), uid = state.battle!.hand[0];
    let finish: (saved: boolean) => void = () => {};
    const dispatch = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const Render = () => { return useBattleSelection(state, dispatch); };
    Render().setSelected(uid);
    const first = Render().commitSelection({ type: 'playCard', uid, target: 'enemy-0' });
    expect(Render().selected).toBe(uid);
    finish(false); expect(await first).toBe(false); expect(Render().selected).toBe(uid);
    const second = Render().commitSelection({ type: 'playCard', uid, target: 'enemy-0' });
    finish(true); expect(await second).toBe(true); expect(Render().selected).toBeNull();
  });

  it('结束回合失败保留，重试保存后的新回合使保留牌选中失效', async () => {
    const state = ready(), uid = state.battle!.hand[0];
    const dispatch = vi.fn(async () => false);
    const Render = (current = state) => { return useBattleSelection(current, dispatch); };
    Render().setSelected(uid);
    await Render().commitSelection({ type: 'endTurn' });
    expect(Render().selected).toBe(uid);
    const saved = structuredClone(state); saved.revision++; saved.battle!.turn++;
    expect(saved.battle!.hand).toContain(uid);
    expect(Render(saved).selected).toBeNull();
  });

  it('行动力不足仍可选牌查看，换人生或领奖后不保留旧选择', () => {
    const state = ready(); state.battle!.energy = 0;
    const uid = state.battle!.hand[0], dispatch = vi.fn(async () => false);
    const Render = (current = state) => { return useBattleSelection(current, dispatch); };
    Render().setSelected(uid); expect(Render().selected).toBe(uid);
    expect(Render({ ...state, id: 'other-life' }).selected).toBeNull();
    expect(Render({ ...state, scene: 'reward' }).selected).toBeNull();
  });
});
