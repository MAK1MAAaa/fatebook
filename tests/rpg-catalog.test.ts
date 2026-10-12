import { describe, expect, it } from "vitest";
import { createCharacter, PRESETS } from "../src/game/characters";
import { CARDS, CARD_BY_ID } from "../src/rpg/cards";
import { createRpg, resolveAction } from "../src/rpg/engine";
import { ENCOUNTERS, EVENTS } from "../src/rpg/content";
import { createBattle } from "../src/rpg/combat";
import { EMPTY_FILTERS, cardSources, cardUnlockReason, changeCardQuantity, groupCards, matchesCard } from "../src/rpg/catalog";

const born = () => createRpg(createCharacter("custom", { budget: 0 }), "catalog", "2026-10-10T00:00:00.000Z");

describe("收藏图鉴与按数量组牌", () => {
  it("普通与强化版合为同一基础卡，所有实体 UID 与编入状态保持", () => {
    const state = born(), original = structuredClone(state);
    const copy = state.collection.find(card => card.cardId === "neutral-1")!;
    copy.upgraded = true;
    const group = groupCards(state.collection, state.deck).find(item => item.card.id === "neutral-1")!;
    expect(group.copies).toHaveLength(3);
    expect(group.included).toHaveLength(3);
    expect(group.copies[0].uid).toBe(copy.uid);
    expect(state.collection.map(card => card.uid)).toEqual(original.collection.map(card => card.uid));
    expect(state.deck).toEqual(original.deck);
  });

  it("增加优先选未编入强化卡，减少优先取下普通卡，选择顺序与收藏排列无关", () => {
    const state = born();
    state.collection = [
      { uid: "z-normal", cardId: "neutral-1", upgraded: false },
      { uid: "b-upgraded", cardId: "neutral-1", upgraded: true },
      { uid: "a-upgraded", cardId: "neutral-1", upgraded: true },
    ];
    const initial = ["z-normal"];
    const added = changeCardQuantity(state, initial, "neutral-1", 1);
    expect(added).toEqual(["z-normal", "a-upgraded"]);
    expect(changeCardQuantity(state, added, "neutral-1", -1)).toEqual(["a-upgraded"]);
    state.collection.reverse();
    expect(changeCardQuantity(state, initial, "neutral-1", 1)).toEqual(added);
    expect(initial).toEqual(["z-normal"]);
  });

  it("普通与强化的同牌合计上限3张，牌组上限25张", () => {
    const state = born();
    state.collection.push({ uid: "fourth", cardId: "neutral-1", upgraded: true });
    const originals = state.collection.filter(copy => copy.cardId === "neutral-1").slice(0, 3).map(copy => copy.uid);
    expect(() => changeCardQuantity(state, originals, "neutral-1", 1)).toThrow("合计最多3张");
    expect(() => changeCardQuantity(state, Array.from({ length: 25 }, (_, index) => `other-${index}`), "neutral-1", 1)).toThrow("最多25张");
    expect(changeCardQuantity(state, [], "neutral-1", -1)).toEqual([]);
  });

  it("分组和详情不修改牌组、收藏或同一牌组的战斗随机结果", () => {
    const state = born(), before = structuredClone(state), battle = createBattle(state, "c1-main-1");
    groupCards(state.collection, state.deck);
    cardSources(CARD_BY_ID["neutral-1"]);
    expect(state).toEqual(before);
    expect(createBattle(state, "c1-main-1")).toEqual(battle);
  });

  it("机制名称参与检索，费用、流派及拥有状态可组合筛选", () => {
    const state = born();
    expect(matchesCard(state, CARD_BY_ID["neutral-3"], { ...EMPTY_FILTERS, query: "抽牌", cost: "0", ownership: "owned" })).toBe(true);
    expect(matchesCard(state, CARD_BY_ID["neutral-5"], { ...EMPTY_FILTERS, query: "易伤", ownership: "unowned" })).toBe(true);
    expect(matchesCard(state, CARD_BY_ID["neutral-3"], { ...EMPTY_FILTERS, mechanism: "retain" })).toBe(false);
    expect(matchesCard(state, CARD_BY_ID["neutral-3"], { ...EMPTY_FILTERS, mechanism: "exhaust" })).toBe(true);
    expect(matchesCard(state, CARD_BY_ID["water-1"], { ...EMPTY_FILTERS, ownership: "learned" })).toBe(false);
    expect(CARDS.filter(card => matchesCard(state, card, EMPTY_FILTERS))).toHaveLength(96);
  });

  it("其他身份只能预览，显示确切身份、技艺和联盟解锁条件", () => {
    const state = born();
    expect(cardUnlockReason(state, CARD_BY_ID["identity-roxy-1"])).toContain(`${PRESETS.roxy.name}专属`);
    expect(() => changeCardQuantity(state, [], "identity-roxy-1", 1)).toThrow("尚未学会");
    expect(cardUnlockReason(state, CARD_BY_ID["water-3"])).toContain("水魔术达到中级");
    expect(cardUnlockReason(state, CARD_BY_ID["identity-alliance"])).toContain("为被排斥者作证");
    state.chapter = 3; state.flags.push("superdTrust");
    expect(cardUnlockReason(state, CARD_BY_ID["identity-alliance"])).toBe("已学会");
    expect(cardSources(CARD_BY_ID["identity-alliance"]).join(" ")).toContain("营地里的陌生人");
  });

  it("人物经历确实通过正式引擎赠送身份牌，来源默认只列3个例子", () => {
    const card = CARD_BY_ID["identity-roxy-2"];
    const state = createRpg(createCharacter("roxy", { budget: 0 }), "catalog-roxy", "2026-10-10T00:00:00.000Z");
    const event = EVENTS.find(item => item.actor === "roxy" && item.chapter >= card.rank)!;
    state.chapter = event.chapter;
    const next = resolveAction(state, { type: "event", eventId: event.id, choiceId: event.choices[0].id }, state.revision);
    expect(next.collection.some(copy => copy.cardId === card.id)).toBe(true);
    const rewardCard = CARD_BY_ID["neutral-1"], encounters = ENCOUNTERS.filter(encounter => encounter.cardRewards.includes(rewardCard.id));
    expect(encounters.length).toBeGreaterThan(3);
    const summary = cardSources(rewardCard).find(source => source.startsWith("首胜奖励优先候选"))!;
    const complete = cardSources(rewardCard, true).find(source => source.startsWith("首胜奖励优先候选"))!;
    expect(summary).toContain(`另有${encounters.length - 3}项`);
    expect((summary.match(/「/g) ?? []).length).toBe(3);
    expect((complete.match(/「/g) ?? []).length).toBe(encounters.length);
    expect(summary).toContain("并非保证获得");
    expect(cardSources(CARD_BY_ID["water-7"]).join(" ")).toContain("本版导师只教授至圣级");
  });
});
