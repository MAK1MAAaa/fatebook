import { PRESETS } from "./characters";
import { STAT_KEYS, type ActorId, type Stats } from "./types";

export type AllocationTemplateId = "balanced" | "magic" | "sword" | "social";

interface AllocationTemplate {
  id: AllocationTemplateId;
  label: string;
  description: string;
  weights: Stats;
}

export const ALLOCATION_TEMPLATES: readonly AllocationTemplate[] = [
  {
    id: "balanced",
    label: "均衡",
    description: "各项兼顾",
    weights: {
      vitality: 1,
      mana: 1,
      strength: 1,
      agility: 1,
      insight: 1,
      charisma: 1,
    },
  },
  {
    id: "magic",
    label: "魔术",
    description: "魔力 · 悟性",
    weights: {
      vitality: 1,
      mana: 4,
      strength: 1,
      agility: 1,
      insight: 3,
      charisma: 1,
    },
  },
  {
    id: "sword",
    label: "剑术",
    description: "力量 · 敏捷",
    weights: {
      vitality: 3,
      mana: 1,
      strength: 4,
      agility: 3,
      insight: 1,
      charisma: 1,
    },
  },
  {
    id: "social",
    label: "交涉",
    description: "交涉 · 悟性",
    weights: {
      vitality: 1,
      mana: 1,
      strength: 1,
      agility: 1,
      insight: 3,
      charisma: 4,
    },
  },
];

export function emptyAllocation(): Stats {
  return {
    vitality: 0,
    mana: 0,
    strength: 0,
    agility: 0,
    insight: 0,
    charisma: 0,
  };
}

function validateBudget(budget: number) {
  if (!Number.isInteger(budget) || budget < 0 || budget > 60) {
    throw new Error("额外属性点必须是 0–60 的整数。");
  }
}

export function parseAllocationBudget(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const budget = Number(trimmed);
  return Number.isInteger(budget) && budget >= 0 && budget <= 60
    ? budget
    : null;
}

export function createTemplateAllocation(
  actor: ActorId,
  budget: number,
  templateId: AllocationTemplateId = "balanced",
): Stats {
  validateBudget(budget);
  if (!Object.hasOwn(PRESETS, actor)) throw new Error("未知的出生角色。");
  const template = ALLOCATION_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new Error("未知的属性分配方案。");
  const allocation = emptyAllocation();
  for (let point = 0; point < budget; point += 1) {
    const available = STAT_KEYS.filter(
      (key) => PRESETS[actor].stats[key] + allocation[key] < 20,
    );
    if (available.length === 0) throw new Error("初始属性已达到上限。");
    // 已接近上限的属性退出分配，剩余点数继续按同一方案分配。
    const key = available.reduce((best, candidate) =>
      template.weights[candidate] / (allocation[candidate] + 1) >
      template.weights[best] / (allocation[best] + 1)
        ? candidate
        : best,
    );
    allocation[key] += 1;
  }
  return allocation;
}

export function resizeAllocation(allocation: Stats, budget: number): Stats {
  validateBudget(budget);
  if (
    STAT_KEYS.some(
      (key) => !Number.isInteger(allocation[key]) || allocation[key] < 0,
    )
  ) {
    throw new Error("属性加点必须是非负整数。");
  }
  const spent = STAT_KEYS.reduce((sum, key) => sum + allocation[key], 0);
  if (spent <= budget) return { ...allocation };
  const resized = emptyAllocation();
  for (const key of STAT_KEYS) {
    resized[key] = Math.floor((allocation[key] * budget) / spent);
  }
  const remaining =
    budget - STAT_KEYS.reduce((sum, key) => sum + resized[key], 0);
  // 按原加点比例归还多余点数，整数余数按固定属性顺序稳定处理。
  const byRemainder = [...STAT_KEYS].sort(
    (a, b) =>
      ((allocation[b] * budget) % spent) - ((allocation[a] * budget) % spent),
  );
  for (let point = 0; point < remaining; point += 1) {
    resized[byRemainder[point]] += 1;
  }
  return resized;
}
