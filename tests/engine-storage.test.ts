import { describe, expect, it, vi } from "vitest";
import type { Origin, Requirement, StoryNode } from "../src/game/types";

vi.mock("../src/content", () => {
  const start: StoryNode = {
    id: "c1-start",
    chapter: 1,
    title: "出生",
    location: "村庄",
    year: "childhood",
    body: "{name}在{age}岁时翻开书。",
    actorBodies: { roxy: "你听不见族人的念话。" },
    choices: [
      {
        id: "learn",
        label: "学习",
        detail: "学习语言",
        target: "travel",
        effects: {
          stats: { insight: 2 },
          flags: ["demonLanguage"],
          supplies: -2,
        },
        feedback: "你学会了语言。",
      },
      {
        id: "magic",
        label: "钻研",
        detail: "测试成长边界",
        target: "travel",
        effects: {
          stats: { mana: 200 },
          skills: { water: 20 },
          relations: { family: 110 },
          money: -100,
          supplies: -100,
          injury: 200,
          guild: 99,
        },
        feedback: "训练结束。",
      },
      {
        id: "unavailable",
        label: "越级",
        detail: "需要语言和能力",
        target: "travel",
        requirements: [{ stat: "insight", min: 80 }, { flag: "demonLanguage" }],
        feedback: "不可用。",
      },
    ],
  };
  const travel: StoryNode = {
    id: "travel",
    chapter: 2,
    title: "旅途",
    location: "大陆",
    year: 417,
    body: "旅费与语言决定去路。",
    choices: [
      {
        id: "settle",
        label: "定居",
        detail: "",
        target: "end",
        feedback: "安定下来。",
      },
      {
        id: "danger",
        label: "冲进荒野",
        detail: "危险已预警",
        target: "death",
        risk: "fatal",
        feedback: "你倒在荒野。",
      },
      {
        id: "later",
        label: "等待",
        detail: "",
        target: "future",
        feedback: "很多年过去。",
      },
    ],
  };
  const future: StoryNode = {
    id: "future",
    chapter: 3,
    title: "未来",
    location: "大陆",
    year: "youth",
    body: "时间不能倒退。",
    choices: [
      {
        id: "finish",
        label: "结束",
        detail: "",
        target: "end",
        feedback: "完结。",
      },
    ],
  };
  const end: StoryNode = {
    id: "end",
    chapter: 7,
    title: "隐退",
    location: "家",
    year: 450,
    body: "余生。",
    choices: [],
    kind: "ending",
    endingId: "end-retired",
  };
  const death: StoryNode = {
    id: "death",
    chapter: 2,
    title: "绝境",
    location: "荒野",
    year: 417,
    body: "终止。",
    choices: [],
    kind: "ending",
    endingId: "dead-road",
  };
  return {
    CONTENT_VERSION: "1.0.0",
    START_NODE: "c1-start",
    STORY_BY_ID: { "c1-start": start, travel, future, end, death },
    ENDINGS: [
      { id: "end-retired", kind: "alive", title: "隐退" },
      { id: "dead-road", kind: "dead", title: "绝境" },
    ],
  };
});

import { createCharacter } from "../src/game/characters";
import {
  checkRequirements,
  createGame,
  getAvailableChoices,
  renderBody,
  resolveChoice,
} from "../src/game/engine";
import {
  listSaves,
  loadEnvelope,
  persistGame,
  removeSave,
  STORAGE_KEY,
} from "../src/game/storage";
import { STORY_BY_ID } from "../src/content";

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  fail = false;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("QuotaExceededError");
    this.data.set(key, value);
  }
}
const born = (id = "life-1") =>
  createGame(
    createCharacter("custom", { budget: 0 }),
    id,
    "2026-10-02T00:00:00.000Z",
  );

describe("确定性故事引擎", () => {
  it("出身影响旅费、补给和家乡语言，种族不会自动获得魔术", () => {
    const origins: Origin[] = ["village", "noble", "demon", "forest"];
    const expected = [
      { money: 30, supplies: 6 },
      { money: 50, supplies: 5 },
      { money: 18, supplies: 8 },
      { money: 22, supplies: 8 },
    ];
    origins.forEach((origin, index) => {
      const state = createGame(
        createCharacter("custom", { budget: 0, origin }),
      );
      expect({ money: state.money, supplies: state.supplies }).toEqual(
        expected[index],
      );
      expect(state.flags.includes("languageDemon")).toBe(origin === "demon");
      expect(state.flags.includes("languageBeast")).toBe(origin === "forest");
      expect(Object.values(state.skills).every((level) => level === 0)).toBe(
        true,
      );
    });
    const migurd = createGame(
      createCharacter("custom", { budget: 0, race: "migurd" }),
    );
    expect(migurd.flags).toContain("languageDemon");
    const sylphie = createGame(createCharacter("sylphie", { budget: 0 }));
    const template = {
      ...STORY_BY_ID["c1-start"],
      body: "{origin}长大的{race}。",
      actorBodies: {},
    };
    expect(renderBody(template, sylphie)).toBe(
      "阿斯拉平民长大的人族、长耳族与兽族的混血。",
    );
  });

  it("同样选择产生同样结果，不修改输入状态，也不会自动学习技能", () => {
    const state = born();
    const before = structuredClone(state);
    expect(resolveChoice(state, "learn")).toEqual(
      resolveChoice(state, "learn"),
    );
    expect(state).toEqual(before);
    expect(state.skills.water).toBe(0);
    const next = resolveChoice(state, "learn").state;
    expect(checkRequirements([{ absent: "demonLanguage" }], next).ok).toBe(
      false,
    );
    expect(next.flags).toContain("demonLanguage");
    expect(next.stats.insight).toBe(5);
    expect(next.supplies).toBe(4);
  });

  it("组合条件明确列出缺失项，非法选择和重复提交均被拒绝", () => {
    const state = born();
    const check = checkRequirements(
      [
        { stat: "mana", min: 4 },
        { flag: "demonLanguage" },
        { relation: "伙伴", min: 10 },
        { skill: "water", min: 2 },
        { resource: "money", min: 31 },
        { actor: "roxy" },
      ],
      state,
    );
    expect(check.ok).toBe(false);
    expect(check.missing).toHaveLength(6);
    expect(check.missing.join("")).not.toContain("demonLanguage");
    expect(
      getAvailableChoices(STORY_BY_ID["c1-start"], state).find(
        (item) => item.choice.id === "unavailable",
      )?.ok,
    ).toBe(false);
    expect(() => resolveChoice(state, "unavailable")).toThrow("悟性");
    const next = resolveChoice(state, "learn").state;
    expect(() => resolveChoice(next, "learn")).toThrow("当前章节");
    expect(() => resolveChoice(next, "settle", 0)).toThrow("已经结算");
  });

  it("限制成长范围，资源不会为负且时间不会倒退", () => {
    const next = resolveChoice(born(), "magic").state;
    expect(next.stats.mana).toBe(100);
    expect(next.skills.water).toBe(7);
    expect(next.relations.family).toBe(100);
    expect(next.money).toBe(0);
    expect(next.supplies).toBe(0);
    expect(next.injury).toBe(100);
    expect(next.guild).toBe(6);
    expect(resolveChoice(next, "later").state.year).toBe(417);
  });

  it("终局立即封存，洛琪希童年采用正确出生年并显示专属追加段", () => {
    const state = createGame(
      createCharacter("roxy", { budget: 0 }),
      "roxy",
      "2026-10-02T00:00:00.000Z",
    );
    expect(state.year).toBe(378);
    expect(state.age).toBe(5);
    expect(renderBody(STORY_BY_ID["c1-start"], state)).toContain(
      "洛琪希·米格路迪亚在5岁",
    );
    expect(renderBody(STORY_BY_ID["c1-start"], state)).toContain(
      "你听不见族人的念话",
    );
    const death = resolveChoice(
      resolveChoice(state, "learn").state,
      "danger",
    ).state;
    expect(death.status).toBe("dead");
    expect(death.endingId).toBe("dead-road");
    expect(() => resolveChoice(death, "settle")).toThrow("已封存");
  });

  it("任一技艺门槛接受不同魔术或剑术流派，组合条件仍全部需要满足", () => {
    const state = born();
    const requirements: Requirement[] = [
      { anySkill: ["fire", "water", "earth"], min: 1 },
    ];
    expect(checkRequirements(requirements, state).ok).toBe(false);
    expect(checkRequirements(requirements, state).missing[0]).toContain(
      "火魔术、水魔术、土魔术",
    );
    const magician = resolveChoice(state, "magic").state;
    expect(checkRequirements(requirements, magician).ok).toBe(true);
    expect(
      checkRequirements(
        [{ anySkill: ["sword", "waterSword", "northSword"], min: 1 }],
        magician,
      ).ok,
    ).toBe(false);
    const northSwordsman = {
      ...state,
      skills: { ...state.skills, northSword: 1 },
    };
    expect(
      checkRequirements(
        [{ anySkill: ["sword", "waterSword", "northSword"], min: 1 }],
        northSwordsman,
      ).ok,
    ).toBe(true);
    expect(
      checkRequirements(
        [{ anySkill: ["sword", "waterSword", "northSword"], min: 2 }],
        northSwordsman,
      ).ok,
    ).toBe(false);
    expect(
      checkRequirements([...requirements, { flag: "notLearned" }], magician).ok,
    ).toBe(false);
    expect(checkRequirements([{ anySkill: [], min: 1 }], magician).ok).toBe(
      false,
    );
  });
});

describe("存档和永久死亡", () => {
  it("保存、刷新、逐档删除，封存不能被旧状态覆盖，图鉴不因删除而丢失", () => {
    const storage = new MemoryStorage();
    let state = born();
    expect(persistGame(state, storage).revision).toBe(1);
    state = resolveChoice(state, "learn").state;
    persistGame(state, storage);
    state = resolveChoice(state, "danger").state;
    persistGame(state, storage);
    persistGame(born("life-2"), storage);
    const envelope = loadEnvelope(storage);
    expect(envelope.unlocked).toEqual(["dead-road"]);
    expect(
      listSaves(envelope).find((item) => item.id === "life-1")?.state?.status,
    ).toBe("dead");
    expect(() => persistGame(born(), storage)).toThrow("永久封存");
    const removed = removeSave("life-1", storage);
    expect(removed.saves["life-1"]).toBeUndefined();
    expect(removed.saves["life-2"]).toBeDefined();
    expect(removed.unlocked).toEqual(["dead-road"]);
  });

  it("空间不足不改变已写入进度，可以在解除故障后重试", () => {
    const storage = new MemoryStorage();
    const state = born();
    persistGame(state, storage);
    const next = resolveChoice(state, "learn").state;
    storage.fail = true;
    expect(() => persistGame(next, storage)).toThrow("保存失败");
    expect(listSaves(loadEnvelope(storage))[0].state?.step).toBe(0);
    storage.fail = false;
    expect(listSaves(persistGame(next, storage))[0].state?.step).toBe(1);
  });

  it("隔离单个坏档，损坏JSON和未知版本不会被覆盖", () => {
    const storage = new MemoryStorage();
    const envelope = persistGame(born(), storage);
    envelope.saves.broken = { id: "broken" };
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    const list = listSaves(loadEnvelope(storage));
    expect(list.find((item) => item.id === "life-1")?.state).toBeDefined();
    expect(list.find((item) => item.id === "broken")?.error).toContain("损坏");
    removeSave("broken", storage);
    storage.setItem(STORAGE_KEY, "{not-json");
    expect(() => persistGame(born("new"), storage)).toThrow("JSON");
    expect(storage.getItem(STORAGE_KEY)).toBe("{not-json");
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...envelope, schemaVersion: 99 }),
    );
    expect(listSaves(loadEnvelope(storage)).every((item) => item.error)).toBe(
      true,
    );
    expect(() => removeSave("life-1", storage)).toThrow("更新版本");
    expect(() => persistGame(born("new"), storage)).toThrow("不兼容");
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...envelope, contentVersion: "2.0.0" }),
    );
    expect(listSaves(loadEnvelope(storage)).every((item) => item.error)).toBe(
      true,
    );
    expect(removeSave("broken", storage).contentVersion).toBe("2.0.0");
    expect(removeSave("life-1", storage).contentVersion).toBe("1.0.0");
  });

  it("多页面的过期进度和跳步保存被拒绝", () => {
    const storage = new MemoryStorage();
    const state = born();
    persistGame(state, storage);
    const next = resolveChoice(state, "learn").state;
    persistGame(next, storage);
    expect(() => persistGame(next, storage)).toThrow("其他页面更新");
    expect(() => persistGame(state, storage)).toThrow("其他页面更新");
    const forged = { ...resolveChoice(next, "settle").state, money: 900 };
    expect(() => persistGame(forged, storage)).toThrow("结算不一致");
  });

  it("坏档可以删除，正常槽位仍可独立推进", () => {
    const storage = new MemoryStorage();
    const initial = born();
    const envelope = persistGame(initial, storage);
    envelope.saves.broken = { status: "active" };
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    const updated = persistGame(resolveChoice(initial, "learn").state, storage);
    expect(
      listSaves(updated).find((item) => item.id === initial.id)?.state?.step,
    ).toBe(1);
    expect(
      listSaves(updated).find((item) => item.id === "broken")?.error,
    ).toBeDefined();
    expect(removeSave("broken", storage).saves.broken).toBeUndefined();
  });
});
