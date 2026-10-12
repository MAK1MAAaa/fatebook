import { describe, expect, it } from "vitest";
import {
  createCharacter,
  PRESETS,
  randomCharacter,
} from "../src/game/characters";
import { STAT_KEYS, type ActorId } from "../src/game/types";

describe("出生角色与属性预算", () => {
  it("固定角色保持出生年代、身份和先天限制", () => {
    const actors: ActorId[] = ["rudeus", "eris", "sylphie", "roxy"];
    for (const actor of actors) {
      const character = createCharacter(actor, {
        budget: 0,
        name: "篡改姓名",
        race: "beast",
        origin: "forest",
      });
      expect(character.birthYear).toBe(PRESETS[actor].birthYear);
      expect(character.name).toBe(PRESETS[actor].name);
      expect(character.race).toBe(PRESETS[actor].race);
    }
    expect(createCharacter("roxy", { budget: 0 }).traits).toContain(
      "无法使用米格路德族念话",
    );
  });

  it("支持0至60点预算并拒绝未用完、超额和单项越界", () => {
    expect(createCharacter("custom", { budget: 0 }).stats.mana).toBe(3);
    expect(
      createCharacter("custom", {
        budget: 60,
        allocation: {
          vitality: 10,
          mana: 10,
          strength: 10,
          agility: 10,
          insight: 10,
          charisma: 10,
        },
      }).stats.mana,
    ).toBe(13);
    expect(() => createCharacter("custom")).toThrow("未分配");
    expect(() =>
      createCharacter("custom", { budget: 1, allocation: { mana: 2 } }),
    ).toThrow("超过预算");
    expect(() =>
      createCharacter("custom", { budget: 20, allocation: { mana: 20 } }),
    ).toThrow("不能超过 20");
    expect(() =>
      createCharacter("custom", { budget: 0, allocation: { mana: -1 } }),
    ).toThrow("非负整数");
    expect(() => createCharacter("custom", { budget: 1.5 })).toThrow("整数");
    expect(() => createCharacter("custom", { budget: 61 })).toThrow("0–60");
  });

  it("自建姓名和种族合法，随机结果加点完整且不超过初始上限", () => {
    expect(
      createCharacter("custom", {
        budget: 0,
        name: "  艾诺  ",
        race: "beast",
        origin: "forest",
      }).name,
    ).toBe("艾诺");
    expect(() => createCharacter("custom", { budget: 0, name: " " })).toThrow(
      "姓名",
    );
    expect(() =>
      createCharacter("custom", { budget: 0, name: "长".repeat(25) }),
    ).toThrow("姓名");
    for (const budget of [0, 20, 60]) {
      for (let run = 0; run < 12; run += 1) {
        const character = randomCharacter(budget);
        expect(character.randomized).toBe(true);
        expect(
          STAT_KEYS.reduce((sum, key) => sum + character.stats[key] - 3, 0),
        ).toBe(budget);
        expect(
          STAT_KEYS.every(
            (key) => character.stats[key] >= 3 && character.stats[key] <= 20,
          ),
        ).toBe(true);
      }
    }
  });
});
