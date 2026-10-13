import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { createRpg, resolveAction, safeDeckPreset } from '../src/rpg/engine';
import { CARD_BY_ID } from '../src/rpg/cards';
import { cardFor, CURRENT_RULESET, LEGACY_RULESET } from '../src/rpg/rulesets';
import DeckWorkshop from '../src/components/rpg/DeckWorkshop';
import type { DeckWorkshopHandle } from '../src/components/rpg/DeckWorkshop';
import CardDetail from '../src/components/rpg/CardDetail';
import CardTile from '../src/components/rpg/CardTile';
import ShopWorkshop from '../src/components/rpg/ShopWorkshop';
import type { RpgState } from '../src/rpg/types';

const runtime = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, dispatch: vi.fn(), saving: false, pending: null as RpgState | null }));
// The project already uses a lightweight hook host for async provider tests.
// Here it drives real event handlers and inspects React elements without a DOM.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual,
    useState<T>(initial: T | (() => T)) {
      const index = runtime.cursor++;
      if (runtime.slots.length <= index) runtime.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [runtime.slots[index] as T, (value: T | ((previous: T) => T)) => { runtime.slots[index] = typeof value === 'function' ? (value as (previous: T) => T)(runtime.slots[index] as T) : value; }];
    },
    useImperativeHandle(ref: { current: unknown } | undefined, create: () => unknown) { if (ref) ref.current = create(); },
  };
});
vi.mock('../src/rpg/context', () => ({ useRpg: () => ({ dispatch: runtime.dispatch, saving: runtime.saving, pending: runtime.pending }) }));

type Props = { children?: ReactNode; className?: string; onClick?: () => unknown; onChange?: (event: { target: { value: string } }) => void; disabled?: boolean; 'aria-label'?: string; [key: string]: unknown };
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function words(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(words).join('');
  if (isValidElement<Props>(node)) return words(node.props.children);
  return String(node);
}
function button(tree: ReactNode, label: string): Element {
  const found = elements(tree).find(element => element.type === 'button' && (words(element.props.children) === label || element.props['aria-label'] === label));
  if (!found) throw new Error(`找不到按钮：${label}`);
  return found;
}
function hasText(tree: ReactNode, text: string) { return words(tree).includes(text); }
const born = (version = CURRENT_RULESET) => { const state = createRpg(createCharacter('custom', { budget: 0 }), 'workshop-ui', '2026-10-12T00:00:00Z', version); state.money = 1000; return state; };
const drain = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  runtime.slots = []; runtime.cursor = 0; runtime.saving = false; runtime.pending = null;
  runtime.dispatch.mockReset().mockResolvedValue(true);
});

describe('工坊交互与规则卡面', () => {
  it('预设先预览，取消保持草稿，明确应用后才交给保存动作', async () => {
    const state = born(), onClose = vi.fn(), ref = { current: null as DeckWorkshopHandle | null };
    const render = () => { runtime.cursor = 0; return DeckWorkshop({ state, onClose, ref }); };
    let tree = render();
    button(tree, '从牌组取下一张直击').props.onClick?.();
    tree = render(); expect(hasText(tree, '牌组 17 / 25')).toBe(true);
    button(tree, '预览进攻').props.onClick?.();
    tree = render(); expect(hasText(tree, '预览不会修改牌组')).toBe(true); expect(hasText(tree, '牌组 17 / 25')).toBe(true);
    expect(runtime.dispatch).not.toHaveBeenCalled();
    button(tree, '继续查看当前牌组').props.onClick?.();
    tree = render(); expect(hasText(tree, '预览不会修改牌组')).toBe(false); expect(hasText(tree, '牌组 17 / 25')).toBe(true);
    button(tree, '预览进攻').props.onClick?.(); tree = render();
    button(tree, '应用到草稿').props.onClick?.(); tree = render();
    expect(hasText(tree, '牌组 18 / 25')).toBe(true); expect(runtime.dispatch).not.toHaveBeenCalled();
    button(tree, '保存牌组').props.onClick?.(); await drain();
    expect(runtime.dispatch).toHaveBeenLastCalledWith(state, { type: 'setDeck', deck: safeDeckPreset(state, 'attack') }); expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('外层关闭与返回地区都提供三选项，继续编辑保留草稿，保存失败保留弹层', async () => {
    const state = born(), onClose = vi.fn(), ref = { current: null as DeckWorkshopHandle | null };
    const render = () => { runtime.cursor = 0; return DeckWorkshop({ state, onClose, ref }); };
    let tree = render(); button(tree, '从牌组取下一张直击').props.onClick?.(); render();
    ref.current!.requestClose(); tree = render();
    expect(button(tree, '保存并退出')).toBeDefined(); expect(button(tree, '放弃调整')).toBeDefined(); expect(onClose).not.toHaveBeenCalled();
    button(tree, '继续编辑').props.onClick?.(); tree = render(); expect(hasText(tree, '保留本次组牌调整')).toBe(false); expect(hasText(tree, '牌组 17 / 25')).toBe(true);
    button(tree, '返回地区').props.onClick?.(); tree = render();
    runtime.dispatch.mockResolvedValueOnce(false); button(tree, '保存并退出').props.onClick?.(); await drain(); tree = render();
    expect(onClose).not.toHaveBeenCalled(); expect(hasText(tree, '保留本次组牌调整')).toBe(true);
    button(tree, '保存并退出').props.onClick?.(); await drain(); expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('放弃仅丢弃组牌草稿，已经保存的购买和强化继续保留', () => {
    let state = born(); const onClose = vi.fn();
    const render = () => { runtime.cursor = 0; return DeckWorkshop({ state, onClose }); };
    let tree = render(); button(tree, '从牌组取下一张直击').props.onClick?.();
    state = resolveAction(state, { type: 'upgradeCard', uid: state.collection[0].uid }, state.revision);
    state = resolveAction(state, { type: 'buyCard', cardId: 'neutral-5' }, state.revision);
    const saved = structuredClone(state); tree = render(); button(tree, '返回地区').props.onClick?.(); tree = render();
    expect(hasText(tree, '放弃组牌调整不会撤销它们')).toBe(true); button(tree, '放弃调整').props.onClick?.();
    expect(runtime.dispatch).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledOnce(); expect(state).toEqual(saved);
    expect(state.collection[0].upgraded).toBe(true); expect(state.collection.some(copy => copy.cardId === 'neutral-5')).toBe(true);
  });

  it('永久删除必须明确确认，取消和保存失败都保留收藏', async () => {
    const state = born(), copy = state.collection[0]; state.deck = state.deck.filter(uid => uid !== copy.uid);
    const render = () => { runtime.cursor = 0; return CardDetail({ card: cardFor(state, copy.cardId), state, onClose: vi.fn() }); };
    let tree = render(); button(tree, '永久移除直击普通副本1').props.onClick?.(); tree = render();
    expect(runtime.dispatch).not.toHaveBeenCalled(); expect(hasText(tree, '不能撤销')).toBe(true);
    button(tree, '保留副本').props.onClick?.(); tree = render(); expect(hasText(tree, '永久移除收藏副本')).toBe(false);
    button(tree, '永久移除直击普通副本1').props.onClick?.(); tree = render(); runtime.dispatch.mockResolvedValueOnce(false);
    button(tree, '确认永久移除').props.onClick?.(); await drain(); tree = render(); expect(hasText(tree, '永久移除收藏副本')).toBe(true);
    expect(runtime.dispatch).toHaveBeenLastCalledWith(state, { type: 'removeCard', uid: copy.uid });
    button(tree, '确认永久移除').props.onClick?.(); await drain(); tree = render(); expect(hasText(tree, '永久移除收藏副本')).toBe(false);
  });

  it('保存暂停时三选项均停用，不能放弃待写入动作', () => {
    const state = born(), onClose = vi.fn();
    const render = () => { runtime.cursor = 0; return DeckWorkshop({ state, onClose }); };
    let tree = render(); button(tree, '从牌组取下一张直击').props.onClick?.(); tree = render(); button(tree, '返回地区').props.onClick?.();
    runtime.pending = structuredClone(state); tree = render();
    for (const label of ['保存并退出', '放弃调整', '继续编辑']) expect(button(tree, label).props.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('卡面费用、消耗关键词和强化效果跟随当前规则，旧规则保留原值', () => {
    const state = born();
    const current = CardTile({ card: CARD_BY_ID['wind-4'], owned: { uid: 'preview', cardId: 'wind-4', upgraded: true }, state, onClick: vi.fn() });
    expect(current.props['aria-label']).toContain('1行动力'); expect(current.props['aria-label']).toContain('抽牌 2'); expect(current.props['aria-label']).toContain('消耗');
    const legacy = CardTile({ card: cardFor(state, 'wind-4'), state: { ...state, rulesetVersion: LEGACY_RULESET }, onClick: vi.fn() });
    expect(legacy.props['aria-label']).toContain('2行动力'); expect(legacy.props['aria-label']).not.toContain('消耗'); expect(legacy.props['aria-label']).not.toContain('抽');
  });

  it('新规则饰品合为同价款式，显示同效装备与零净变化，购买选中款式', () => {
    const state = born(); state.chapter = 7; state.equipment.charm = 'gear-1-2'; state.ownedEquipment = ['gear-1-2'];
    const render = () => { runtime.cursor = 0; return ShopWorkshop({ state }); };
    let tree = render();
    const selects = elements(tree).filter(element => element.type === 'select' && element.props['aria-label'] === '选择同效饰品款式');
    expect(selects).toHaveLength(1); expect(hasText(tree, '同效款式 7 / 7')).toBe(true); expect(hasText(tree, '基础价格 35')).toBe(true); expect(hasText(tree, '已装备同效饰品')).toBe(true);
    selects[0].props.onChange?.({ target: { value: 'gear-7-2' } }); tree = render();
    const charm = elements(tree).find(element => element.type === 'article' && hasText(element, '后继者信物'))!;
    expect(hasText(charm, '替换净变化：战斗效果无变化')).toBe(true);
    elements(charm).find(element => element.type === 'button')!.props.onClick?.();
    expect(runtime.dispatch).toHaveBeenCalledWith(state, { type: 'buyEquipment', equipmentId: 'gear-7-2' });
  });

  it('旧规则饰品价格不合并为35，武器替换展示真实差值', () => {
    const state = born(LEGACY_RULESET); state.chapter = 2; state.equipment.weapon = 'gear-1-0'; state.ownedEquipment = ['gear-1-0'];
    runtime.cursor = 0; const tree = ShopWorkshop({ state });
    expect(elements(tree).filter(element => element.type === 'article' && element.props.className === 'shop-equipment-item')).toHaveLength(6);
    const nextWeapon = elements(tree).find(element => element.type === 'article' && hasText(element, '旅用长剑'))!;
    expect(hasText(nextWeapon, '替换净变化：攻击牌伤害 +1')).toBe(true);
    const nextCharm = elements(tree).find(element => element.type === 'article' && hasText(element, '导师徽章'))!;
    expect(hasText(nextCharm, '基础价格 53')).toBe(true);
  });
});
