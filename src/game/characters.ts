import {
  STAT_KEYS,
  type ActorId,
  type CharacterConfig,
  type Origin,
  type Race,
  type SkillId,
  type Stats,
} from "./types";

export const STAT_LABELS: Record<keyof Stats, string> = {
  vitality: "体魄",
  mana: "魔力",
  strength: "力量",
  agility: "敏捷",
  insight: "悟性",
  charisma: "交涉",
};
export const RACE_LABELS: Record<Race, string> = {
  human: "人族",
  elf: "长耳族",
  beast: "兽族",
  migurd: "米格路德族",
};
export const ORIGIN_LABELS: Record<Origin, string> = {
  village: "阿斯拉平民",
  noble: "贵族旁系",
  demon: "魔大陆村落",
  forest: "大森林部落",
};
export const SKILL_LABELS: Record<SkillId, string> = {
  fire: "火魔术",
  water: "水魔术",
  earth: "土魔术",
  wind: "风魔术",
  healing: "治疗魔术",
  sword: "剑神流",
  waterSword: "水神流",
  northSword: "北神流",
};
export const SKILL_RANKS = [
  "未学习",
  "初级",
  "中级",
  "上级",
  "圣级",
  "王级",
  "帝级",
  "神级",
];

interface Preset {
  name: string;
  birthYear: number;
  race: Race;
  origin: Origin;
  stats: Stats;
  traits: string[];
  tagline: string;
  color: string;
}
const stats = (
  vitality: number,
  mana: number,
  strength: number,
  agility: number,
  insight: number,
  charisma: number,
): Stats => ({ vitality, mana, strength, agility, insight, charisma });

export const PRESETS: Record<ActorId, Preset> = {
  custom: {
    name: "旅人",
    birthYear: 407,
    race: "human",
    origin: "village",
    stats: stats(3, 3, 3, 3, 3, 3),
    traits: ["原创 IF 人物"],
    tagline: "以自己的名字，走入六面世界。",
    color: "#a87b42",
  },
  rudeus: {
    name: "鲁迪乌斯·格雷拉特",
    birthYear: 407,
    race: "human",
    origin: "village",
    stats: stats(2, 8, 2, 3, 5, 3),
    traits: ["异世界转生者", "保罗与塞妮丝之子", "拉普拉斯因子"],
    tagline: "重获的人生，能否不再留下遗憾？",
    color: "#80a986",
  },
  eris: {
    name: "艾莉丝·伯雷亚斯·格雷拉特",
    birthYear: 405,
    race: "human",
    origin: "noble",
    stats: stats(6, 1, 7, 5, 2, 2),
    traits: ["伯雷亚斯家族", "剑术资质"],
    tagline: "将不肯低头的意志，磨成保护他人的剑。",
    color: "#c86c60",
  },
  sylphie: {
    name: "希露菲",
    birthYear: 407,
    race: "elf",
    origin: "village",
    stats: stats(3, 5, 2, 5, 4, 4),
    traits: ["混血血统", "拉普拉斯因子", "绿发的童年"],
    tagline: "从孤独的孩子，成长为可信赖的守护者。",
    color: "#88b1a2",
  },
  roxy: {
    name: "洛琪希·米格路迪亚",
    birthYear: 373,
    race: "migurd",
    origin: "demon",
    stats: stats(3, 6, 2, 3, 6, 3),
    traits: ["无法使用米格路德族念话", "长寿魔族"],
    tagline: "听不见族人的心声，仍能寻找自己的归处。",
    color: "#809fc7",
  },
};

export interface CharacterOptions {
  name?: string;
  race?: Race;
  origin?: Origin;
  budget?: number;
  allocation?: Partial<Stats>;
}

export function createCharacter(
  actor: ActorId,
  options: CharacterOptions = {},
): CharacterConfig {
  if (!Object.hasOwn(PRESETS, actor)) throw new Error("未知的出生角色。");
  const preset = PRESETS[actor];
  const budget = options.budget ?? 20;
  if (!Number.isInteger(budget) || budget < 0 || budget > 60)
    throw new Error("额外属性点必须是 0–60 的整数。");
  const allocation = options.allocation ?? {};
  if (
    Object.keys(allocation).some(
      (key) => !STAT_KEYS.includes(key as keyof Stats),
    )
  )
    throw new Error("存在未知属性。");
  const finalStats = { ...preset.stats };
  let spent = 0;
  for (const key of STAT_KEYS) {
    const value = allocation[key] ?? 0;
    if (!Number.isInteger(value) || value < 0)
      throw new Error("属性加点必须是非负整数。");
    finalStats[key] += value;
    if (finalStats[key] > 20)
      throw new Error(`${STAT_LABELS[key]}的初始值不能超过 20。`);
    spent += value;
  }
  if (spent !== budget)
    throw new Error(
      spent < budget
        ? `尚有 ${budget - spent} 点属性未分配。`
        : "已分配属性点超过预算。",
    );
  const name =
    actor === "custom" ? (options.name ?? preset.name).trim() : preset.name;
  if (name.length < 1 || name.length > 24)
    throw new Error("姓名须为 1–24 个字符。");
  const race = actor === "custom" ? (options.race ?? preset.race) : preset.race;
  const origin =
    actor === "custom" ? (options.origin ?? preset.origin) : preset.origin;
  if (
    !Object.hasOwn(RACE_LABELS, race) ||
    !Object.hasOwn(ORIGIN_LABELS, origin)
  )
    throw new Error("未知种族或出身。");
  const traits = [...preset.traits];
  if (actor === "custom" && race === "migurd") traits.push("米格路德族血统");
  if (actor === "custom" && race === "beast") traits.push("兽族血统");
  if (actor === "custom" && race === "elf") traits.push("长耳族血统");
  return {
    actor,
    name,
    race,
    origin,
    birthYear: preset.birthYear,
    stats: finalStats,
    budget,
    traits,
  };
}

export function randomCharacter(budget = 20): CharacterConfig {
  if (!Number.isInteger(budget) || budget < 0 || budget > 60)
    throw new Error("额外属性点必须是 0–60 的整数。");
  const races: Race[] = ["human", "elf", "beast", "migurd"];
  const origins: Origin[] = ["village", "noble", "demon", "forest"];
  const names = [
    "艾诺",
    "莉亚",
    "诺亚",
    "菲尔",
    "塞拉",
    "尤恩",
    "米拉",
    "莱恩",
  ];
  const pick = <T>(items: T[]): T =>
    items[Math.floor(Math.random() * items.length)];
  const allocation: Partial<Stats> = {};
  for (let point = 0; point < budget; point += 1) {
    const available = STAT_KEYS.filter(
      (key) => PRESETS.custom.stats[key] + (allocation[key] ?? 0) < 20,
    );
    const key = pick([...available]);
    allocation[key] = (allocation[key] ?? 0) + 1;
  }
  return {
    ...createCharacter("custom", {
      name: pick(names),
      race: pick(races),
      origin: pick(origins),
      budget,
      allocation,
    }),
    randomized: true,
  };
}
