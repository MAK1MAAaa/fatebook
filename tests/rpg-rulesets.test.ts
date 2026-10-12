import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { CARD_BY_ID, EQUIPMENT } from '../src/rpg/cards';
import { cardEffect, createBattle } from '../src/rpg/combat';
import { createRpg, firstVictoryRewards, resolveAction, safeDeckPreset, validateDeck } from '../src/rpg/engine';
import { cardFor, cardsFor, CURRENT_RULESET, equipmentListFor, LEGACY_RULESET, rulesetVersion } from '../src/rpg/rulesets';
import { loadRpgEnvelope, listRpgSaves, persistRpg, SCHEMA_VERSION, STORAGE_KEY, validateRpg } from '../src/rpg/storage';
import { CONTENT_VERSION } from '../src/rpg/content';
import type { ActorId } from '../src/game/types';
import type { RpgState, RulesetVersion } from '../src/rpg/types';

const now = '2026-10-12T00:00:00.000Z';
const born = (version: RulesetVersion = CURRENT_RULESET, actor: ActorId = 'custom') => createRpg(createCharacter(actor, { budget: 0 }), `rules-${actor}`, now, version);
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  fail = false;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw new Error('full'); this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('2.1规则收益与legacy隔离', () => {
  it('出生默认优化规则，缺失字段明确使用legacy，未知版本禁止执行', () => {
    const state = born(); expect(state.rulesetVersion).toBe(CURRENT_RULESET);
    delete state.rulesetVersion; expect(rulesetVersion(state)).toBe(LEGACY_RULESET);
    expect(cardFor(state, 'wind-4')).toEqual(CARD_BY_ID['wind-4']);
    state.rulesetVersion = 'future' as RulesetVersion;
    expect(() => validateRpg(state)).toThrow('规则版本不兼容');
    expect(() => resolveAction(state, { type: 'acceptQuest', questId: 'q1-1' }, 0)).toThrow('规则版本不兼容');
  });

  it('剑术身份使用力量、魔术身份使用魔力、原创协作使用较高值', () => {
    const eris = born(CURRENT_RULESET, 'eris'); eris.stats.strength = 36; eris.stats.mana = 0;
    const own = { uid: 'sample', cardId: 'identity-eris-1', upgraded: false };
    expect(cardEffect(eris, own).damage).toBe(35);
    eris.rulesetVersion = LEGACY_RULESET; expect(cardEffect(eris, own).damage).toBe(23);
    const roxy = born(CURRENT_RULESET, 'roxy'); roxy.stats.strength = 36; roxy.stats.mana = 0;
    expect(cardEffect(roxy, { ...own, cardId: 'identity-roxy-2' }).damage).toBe(20);
    roxy.stats.mana = 36; expect(cardEffect(roxy, { ...own, cardId: 'identity-roxy-2' }).damage).toBe(32);
    const custom = born(); custom.stats.strength = 36; custom.stats.mana = 0;
    expect(cardEffect(custom, { ...own, cardId: 'identity-custom-3' }).damage).toBe(38);
    expect(cardEffect(custom, { ...own, cardId: 'identity-alliance' }).damage).toBe(38);
  });

  it('全部强化都有明确增量，纯功能不同时增加抽牌和回能', () => {
    const state = born();
    for (const card of cardsFor(state)) {
      expect(card.damageScaling, card.id).toBeDefined();
      expect(Object.keys(card.upgradeEffect ?? {}).length, card.id).toBeGreaterThan(0);
      expect(!!card.upgradeEffect?.draw && !!card.upgradeEffect?.energy, card.id).toBe(false);
      const normal = cardEffect(state, { uid: card.id, cardId: card.id, upgraded: false });
      const upgraded = cardEffect(state, { uid: card.id, cardId: card.id, upgraded: true });
      expect(upgraded, card.id).not.toEqual(normal);
      if (card.effect.energy && !card.exhaust) expect(card.effect.energy).toBeLessThan(card.cost);
      if (card.cost === 0 && card.effect.draw) expect(card.exhaust).toBe(true);
    }
    expect(cardFor(state, 'wind-4')).toMatchObject({ cost: 1, exhaust: true, effect: { energy: 2, draw: 1 }, upgradeEffect: { draw: 1 } });
    expect(cardFor(state, 'identity-custom-2')).toMatchObject({ exhaust: true, upgradeEffect: { draw: 1 } });
    const legacy = born(LEGACY_RULESET);
    expect(cardEffect(legacy, { uid: 'observe', cardId: 'neutral-3', upgraded: true })).toEqual({ draw: 2 });
    expect(cardFor(legacy, 'wind-4')).toMatchObject({ cost: 2, effect: { energy: 2 } });
    expect(equipmentListFor(state).filter(e => e.slot === 'charm').map(e => e.price)).toEqual(Array(7).fill(35));
    expect(equipmentListFor(legacy)).toEqual(EQUIPMENT);
  });

  it('四个预设使用真实UID、每牌至多三张且18张通过正式校验', () => {
    for (const actor of ['custom', 'rudeus', 'eris', 'sylphie', 'roxy'] as ActorId[]) {
      const state = born(CURRENT_RULESET, actor); state.chapter = 7;
      for (const key of Object.keys(state.skills)) state.skills[key as keyof typeof state.skills] = 4;
      state.flags.push('superdTrust');
      for (const card of cardsFor(state).filter(c => !c.actor || c.actor === actor)) {
        if (state.collection.some(c => c.cardId === card.id)) continue;
        for (let copy = 0; copy < 3; copy++) state.collection.push({ uid: `${card.id}-${copy}`, cardId: card.id, upgraded: copy === 0 });
      }
      for (const style of ['balanced', 'attack', 'guard', 'magic'] as const) {
        const original = structuredClone(state), deck = safeDeckPreset(state, style);
        expect(deck).toHaveLength(18); expect(() => validateDeck(state, deck)).not.toThrow();
        expect(state).toEqual(original); expect(safeDeckPreset(state, style)).toEqual(deck);
      }
    }
  });

  it('奖励按三类补缺、全池合法且不消耗或改写战局随机数', () => {
    const state = born(); state.skills.wind = 2; state.skills.fire = 2;
    state.battle = createBattle(state, 'c1-main-1'); const original = structuredClone(state);
    const choices = firstVictoryRewards(state, 'c1-main-1');
    expect(choices).toHaveLength(3); expect(new Set(choices).size).toBe(3); expect(state).toEqual(original);
    expect(firstVictoryRewards(structuredClone(state), 'c1-main-1')).toEqual(choices);
    const cards = choices.map(id => cardFor(state, id));
    expect(cards.some(c => c.effect.damage || c.effect.burn)).toBe(true);
    expect(cards.some(c => !(c.effect.damage || c.effect.burn) && (c.effect.block || c.effect.heal))).toBe(true);
    expect(cards.some(c => !(c.effect.damage || c.effect.burn || c.effect.block || c.effect.heal))).toBe(true);
  });
});

describe('规则切换与存档格式事务', () => {
  it('仅明确确认、活动地区且无战局或奖励时可切换，保持经历与资源', () => {
    const legacy = born(LEGACY_RULESET), original = structuredClone(legacy);
    const action = { type: 'migrateRuleset' as const, confirmed: true as const };
    const migrated = resolveAction(legacy, action, legacy.revision);
    expect(migrated).toEqual({ ...original, rulesetVersion: CURRENT_RULESET, revision: 1 });
    expect(legacy).toEqual(original); expect(() => resolveAction(migrated, action, 1)).toThrow('已经使用');
    for (const scene of ['battle', 'reward'] as const) expect(() => resolveAction({ ...legacy, scene }, action, 0)).toThrow('回到地区');
    expect(() => resolveAction({ ...legacy, battle: createBattle(legacy, 'c1-main-1') }, action, 0)).toThrow('回到地区');
    expect(() => resolveAction({ ...legacy, reward: { encounterId: 'c1-main-1', choices: [] } }, action, 0)).toThrow('回到地区');
    expect(() => resolveAction(legacy, { ...action, confirmed: false } as unknown as typeof action, 0)).toThrow('明确确认');
  });

  it('读schema2不改原字节；有效写schema3逐槽保留正常、坏档、图鉴与额外元数据', () => {
    const storage = new MemoryStorage(), legacy = born(LEGACY_RULESET); delete legacy.rulesetVersion;
    const other = { broken: true }, keep = born(LEGACY_RULESET, 'roxy');
    const initial = { schemaVersion: 2, contentVersion: CONTENT_VERSION, revision: 8, saves: { [legacy.id]: legacy, bad: other, [keep.id]: keep }, unlocked: ['end-family'], metadata: { preserved: true } };
    const bytes = JSON.stringify(initial); storage.setItem(STORAGE_KEY, bytes);
    expect(listRpgSaves(loadRpgEnvelope(storage)).filter(row => row.state)).toHaveLength(2);
    expect(storage.getItem(STORAGE_KEY)).toBe(bytes);
    const action = { type: 'migrateRuleset' as const, confirmed: true as const }, next = resolveAction(legacy, action, 0);
    storage.fail = true; expect(() => persistRpg(next, action, 0, storage)).toThrow('保存失败'); expect(storage.getItem(STORAGE_KEY)).toBe(bytes);
    storage.fail = false; persistRpg(next, action, 0, storage);
    const written = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(written.schemaVersion).toBe(SCHEMA_VERSION); expect(written.revision).toBe(9);
    expect(written.saves.bad).toEqual(other); expect(written.saves[keep.id]).toEqual(keep);
    expect(written.unlocked).toEqual(initial.unlocked); expect(written.metadata).toEqual(initial.metadata);
    // The previously shipped schema-2 compatibility gate rejects schema-3.
    const legacyClientCompatible = written.schemaVersion === 2 && written.contentVersion === CONTENT_VERSION;
    expect(legacyClientCompatible).toBe(false);
    expect(() => persistRpg(next, action, 0, storage)).toThrow('动作已结算');
  });

  it('未知规则只隔离其人生，正常人生可继续写入而不覆盖未来槽位', () => {
    const storage = new MemoryStorage(), state = born(), future = { ...born(LEGACY_RULESET, 'roxy'), rulesetVersion: '9.0.0' };
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 3, contentVersion: CONTENT_VERSION, revision: 0, saves: { future }, unlocked: [] }));
    expect(listRpgSaves(loadRpgEnvelope(storage))[0].error).toContain('规则版本不兼容');
    persistRpg(state, null, 0, storage);
    expect(loadRpgEnvelope(storage).saves.future).toEqual(future);
  });

  it('旧战局刷新与相同牌组重试保持原始费用、牌堆和rng', () => {
    let state = born(LEGACY_RULESET); delete state.rulesetVersion;
    state.skills.wind = 2; state.resolvedEvents = ['rpg-learning']; state.acceptedQuests = ['q1-1'];
    const initial = resolveAction(state, { type: 'startBattle', encounterId: 'c1-main-1' }, 0);
    state = validateRpg(JSON.parse(JSON.stringify(initial))) as RpgState;
    expect(state).toEqual(initial); expect(cardFor(state, 'wind-4').cost).toBe(2);
    state.battle!.result = 'lost'; state.battle!.hp = 0;
    const retry = resolveAction(state, { type: 'retryBattle' }, state.revision);
    expect(retry.battle).toEqual(initial.battle); expect(retry.money).toBe(initial.money);
  });
});
