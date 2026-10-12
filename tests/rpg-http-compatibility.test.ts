import { afterEach, describe, expect, it, vi } from "vitest";
import { createCharacter, randomCharacter } from "../src/game/characters";
import { hashSeed } from "../src/rpg/combat";
import { createRpg, resolveAction, validateDeck } from "../src/rpg/engine";
import { validateRpg } from "../src/rpg/storage";

afterEach(() => vi.unstubAllGlobals());

describe("HTTP 与缺少 UUID API 的浏览器开局", () => {
  it.each([
    { name: "crypto 存在但 randomUUID 未提供", crypto: {} },
    { name: "crypto 完全未提供", crypto: undefined },
  ])("$name 时所有角色入口可生成有效人生", ({ crypto }) => {
    vi.stubGlobal("crypto", crypto);
    const characters = [
      ...(["custom", "rudeus", "eris", "sylphie", "roxy"] as const).map(
        (actor) => createCharacter(actor, { budget: 0 }),
      ),
      randomCharacter(),
    ];
    const states = characters.map((character) => createRpg(character));
    expect(new Set(states.map((state) => state.id)).size).toBe(states.length);
    for (const state of states) {
      expect(state.id).toMatch(/^life-/);
      expect(state.seed).toBe(hashSeed(state.id));
      expect(state.collection.every((card) => card.uid.startsWith(`${state.id}:card:`))).toBe(true);
      expect(state.deck).toHaveLength(18);
      expect(() => validateDeck(state, state.deck)).not.toThrow();
      expect(validateRpg(state)).toEqual(state);
      expect(
        resolveAction(state, { type: "event", eventId: "rpg-learning", choiceId: "magic" }, 0).revision,
      ).toBe(1);
    }
  });

  it("支持原生 UUID 时使用同一个 ID 创建人生、战斗种子及卡牌", () => {
    const id = "1443d2ef-619f-49d1-8386-f2b70b50fb94";
    const randomUUID = vi.fn(() => id);
    vi.stubGlobal("crypto", { randomUUID });
    const state = createRpg(createCharacter("roxy", { budget: 0 }));
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(state.id).toBe(id);
    expect(state.seed).toBe(hashSeed(id));
    expect(state.collection[0].uid).toBe(`${id}:card:start:0`);
  });

  it("显式 ID 不依赖任何浏览器 crypto API", () => {
    vi.stubGlobal("crypto", undefined);
    const state = createRpg(createCharacter("custom", { budget: 0 }), "existing-life", "2026-10-09T00:00:00.000Z");
    expect(state.id).toBe("existing-life");
    expect(state.seed).toBe(hashSeed("existing-life"));
    expect(state.collection[0].uid).toBe("existing-life:card:start:0");
  });
});
