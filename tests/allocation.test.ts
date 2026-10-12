import { describe, expect, it } from "vitest";
import {
  ALLOCATION_TEMPLATES,
  createTemplateAllocation,
  emptyAllocation,
  parseAllocationBudget,
  resizeAllocation,
} from "../src/game/allocation";
import { createCharacter, PRESETS } from "../src/game/characters";
import { STAT_KEYS, type ActorId, type Stats } from "../src/game/types";

const spent = (allocation: Stats) =>
  STAT_KEYS.reduce((sum, key) => sum + allocation[key], 0);

describe("创建角色的快捷分配", () => {
  it("全部身份与0–60点预算均完整分配，并遵守原人物基础值及单项上限", () => {
    for (const actor of Object.keys(PRESETS) as ActorId[]) {
      for (const template of ALLOCATION_TEMPLATES) {
        for (let budget = 0; budget <= 60; budget += 1) {
          const allocation = createTemplateAllocation(
            actor,
            budget,
            template.id,
          );
          expect(spent(allocation)).toBe(budget);
          const character = createCharacter(actor, { budget, allocation });
          for (const key of STAT_KEYS) {
            expect(Number.isInteger(allocation[key])).toBe(true);
            expect(character.stats[key]).toBeGreaterThanOrEqual(
              PRESETS[actor].stats[key],
            );
            expect(character.stats[key]).toBeLessThanOrEqual(20);
          }
        }
      }
    }
  });

  it("三个方向分别优先魔术、剑术和交涉，均衡方案兼顾全部属性", () => {
    const balanced = createTemplateAllocation("custom", 20);
    expect(
      Math.max(...Object.values(balanced)) -
        Math.min(...Object.values(balanced)),
    ).toBe(1);
    const magic = createTemplateAllocation("custom", 20, "magic");
    expect(magic.mana).toBeGreaterThan(magic.strength);
    expect(magic.insight).toBeGreaterThan(magic.vitality);
    const sword = createTemplateAllocation("custom", 20, "sword");
    expect(sword.strength).toBeGreaterThan(sword.mana);
    expect(sword.agility).toBeGreaterThan(sword.charisma);
    const social = createTemplateAllocation("custom", 20, "social");
    expect(social.charisma).toBeGreaterThan(social.strength);
    expect(social.insight).toBeGreaterThan(social.mana);
  });

  it("某项先达到20时将剩余预算分配到其他属性，结果可重复", () => {
    const first = createTemplateAllocation("rudeus", 60, "magic");
    expect(PRESETS.rudeus.stats.mana + first.mana).toBe(20);
    expect(spent(first)).toBe(60);
    expect(createTemplateAllocation("rudeus", 60, "magic")).toEqual(first);
  });

  it("拒绝分数、越界及非数字预算", () => {
    for (const budget of [-1, 61, 0.5, NaN, Infinity]) {
      expect(() => createTemplateAllocation("custom", budget)).toThrow("0–60");
      expect(() => resizeAllocation(emptyAllocation(), budget)).toThrow("0–60");
    }
  });
});

describe("精确预算与手动加点保留", () => {
  it("只接受0–60整数文本，空值或中间输入不会被当作0点", () => {
    expect(parseAllocationBudget("0")).toBe(0);
    expect(parseAllocationBudget(" 23 ")).toBe(23);
    expect(parseAllocationBudget("60")).toBe(60);
    for (const text of ["", " ", "-1", "61", "1.5", "1e1", "文字"]) {
      expect(parseAllocationBudget(text)).toBeNull();
    }
  });

  it("增加预算保留全部手动加点，新预算留下可用点数", () => {
    const allocation = { ...emptyAllocation(), mana: 8, insight: 2 };
    const resized = resizeAllocation(allocation, 20);
    expect(resized).toEqual(allocation);
    expect(resized).not.toBe(allocation);
    expect(20 - spent(resized)).toBe(10);
    expect(resizeAllocation(allocation, 10)).toEqual(allocation);
  });

  it("降低预算按比例归还超出部分，不增加任一属性且不修改原分配", () => {
    const allocation = {
      vitality: 2,
      mana: 4,
      strength: 0,
      agility: 0,
      insight: 3,
      charisma: 1,
    };
    expect(resizeAllocation(allocation, 7)).toEqual({
      vitality: 1,
      mana: 3,
      strength: 0,
      agility: 0,
      insight: 2,
      charisma: 1,
    });
    expect(spent(allocation)).toBe(10);
    for (let budget = 0; budget <= 10; budget += 1) {
      const resized = resizeAllocation(allocation, budget);
      expect(spent(resized)).toBe(budget);
      for (const key of STAT_KEYS)
        expect(resized[key]).toBeLessThanOrEqual(allocation[key]);
    }
    expect(resizeAllocation(allocation, 0)).toEqual(emptyAllocation());
  });
});
