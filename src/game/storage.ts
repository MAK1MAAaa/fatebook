import { z } from "zod";
import { CONTENT_VERSION, ENDINGS, STORY_BY_ID } from "../content";
import { PRESETS } from "./characters";
import { resolveChoice } from "./engine";
import { STAT_KEYS, type GameState, type SaveEnvelope } from "./types";

export const STORAGE_KEY = "six-faced-world:lives:v1";
export const SCHEMA_VERSION = 1;
const integer = (max: number) => z.number().int().min(0).max(max);
const statsSchema = z.object({
  vitality: integer(100),
  mana: integer(100),
  strength: integer(100),
  agility: integer(100),
  insight: integer(100),
  charisma: integer(100),
});
const skillsSchema = z.object({
  fire: integer(7),
  water: integer(7),
  earth: integer(7),
  wind: integer(7),
  healing: integer(7),
  sword: integer(7),
  waterSword: integer(7),
  northSword: integer(7),
});
const actorSchema = z.enum(["custom", "rudeus", "eris", "sylphie", "roxy"]);
const dateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "时间格式无效");
const gameSchema = z.object({
  id: z.string().min(1),
  character: z.object({
    actor: actorSchema,
    name: z.string().trim().min(1).max(24),
    race: z.enum(["human", "elf", "beast", "migurd"]),
    origin: z.enum(["village", "noble", "demon", "forest"]),
    birthYear: z.number().int().min(0),
    stats: statsSchema,
    budget: integer(60),
    traits: z.array(z.string()),
    randomized: z.boolean().optional(),
  }),
  stats: statsSchema,
  skills: skillsSchema,
  relations: z.record(z.string(), integer(100)),
  flags: z.array(z.string()),
  money: z.number().finite().min(0),
  supplies: z.number().finite().min(0),
  injury: integer(100),
  guild: integer(6),
  year: z.number().int().min(0),
  age: z.number().int().min(0),
  nodeId: z.string(),
  step: z.number().int().min(0),
  status: z.enum(["active", "alive", "dead"]),
  endingId: z.string().optional(),
  history: z.array(
    z.object({
      nodeId: z.string(),
      title: z.string(),
      choiceId: z.string(),
      choice: z.string(),
      feedback: z.string(),
      year: z.number().int(),
      age: z.number().int().min(0),
    }),
  ),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});
const envelopeSchema = z
  .object({
    schemaVersion: z.number().int().min(1),
    contentVersion: z.string(),
    revision: z.number().int().min(0),
    saves: z.record(z.string(), z.unknown()),
    unlocked: z.array(z.string()),
  })
  .passthrough();

function storageOrThrow(storage?: Storage): Storage {
  if (storage) return storage;
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    throw new Error("浏览器禁止访问本地存储，请允许站点存储后重试。");
  }
  throw new Error("当前环境无法使用本地存储。");
}

export function loadEnvelope(storage?: Storage): SaveEnvelope {
  const store = storageOrThrow(storage);
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    throw new Error("读取本地存档失败，请检查浏览器存储设置。");
  }
  if (raw === null)
    return {
      schemaVersion: SCHEMA_VERSION,
      contentVersion: CONTENT_VERSION,
      revision: 0,
      saves: {},
      unlocked: [],
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("存档容器已损坏：JSON 无法读取。原数据已保留，未被覆盖。");
  }
  const result = envelopeSchema.safeParse(parsed);
  if (!result.success)
    throw new Error("存档容器格式损坏，原数据已保留，未被覆盖。");
  return result.data;
}

export function validateGame(value: unknown, expectedId?: string): GameState {
  const result = gameSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      `存档资料损坏：${result.error.issues[0]?.path.join(".") || "未知字段"}。`,
    );
  const state = result.data;
  if (expectedId && state.id !== expectedId)
    throw new Error("存档编号与槽位不一致。");
  const node = STORY_BY_ID[state.nodeId];
  if (!node) throw new Error("存档引用的章节不存在。");
  if (node.actors && !node.actors.includes(state.character.actor))
    throw new Error("存档人物与章节不匹配。");
  if (state.character.birthYear !== PRESETS[state.character.actor].birthYear)
    throw new Error("出生年份与人物身份不一致。");
  if (
    state.age !== state.year - state.character.birthYear ||
    state.history.length !== state.step
  )
    throw new Error("存档年龄或人生履历不一致。");
  const base = PRESETS[state.character.actor].stats;
  if (
    STAT_KEYS.some(
      (key) =>
        state.character.stats[key] < base[key] ||
        state.character.stats[key] > 20,
    )
  )
    throw new Error("存档的初始属性不合法。");
  if (
    STAT_KEYS.reduce(
      (total, key) => total + state.character.stats[key] - base[key],
      0,
    ) !== state.character.budget
  )
    throw new Error("初始属性点与预算不一致。");
  if (state.character.actor !== "custom") {
    const preset = PRESETS[state.character.actor];
    if (
      state.character.name !== preset.name ||
      state.character.race !== preset.race ||
      state.character.origin !== preset.origin
    )
      throw new Error("固定人物的身份资料不一致。");
  }
  const ending = ENDINGS.find((item) => item.id === state.endingId);
  if (state.status === "active" && (node.kind === "ending" || state.endingId))
    throw new Error("存档人生状态与章节不一致。");
  if (
    state.status !== "active" &&
    (!ending || ending.kind !== state.status || node.endingId !== ending.id)
  )
    throw new Error("存档结局与封存状态不一致。");
  let previousYear = state.character.birthYear;
  for (const entry of state.history) {
    const historyNode = STORY_BY_ID[entry.nodeId];
    if (
      !historyNode ||
      !historyNode.choices.some((choice) => choice.id === entry.choiceId)
    )
      throw new Error("存档履历包含未知章节或选择。");
    if (
      entry.year < previousYear ||
      entry.age !== entry.year - state.character.birthYear
    )
      throw new Error("存档履历的时间顺序不合法。");
    previousYear = entry.year;
  }
  if (state.year < previousYear) throw new Error("存档的世界时间发生倒退。");
  return state;
}

export interface SaveItem {
  id: string;
  state?: GameState;
  error?: string;
}
export function listSaves(envelope: SaveEnvelope): SaveItem[] {
  return Object.entries(envelope.saves)
    .map(([id, raw]) => {
      if (envelope.schemaVersion !== SCHEMA_VERSION)
        return {
          id,
          error: `存档格式 ${envelope.schemaVersion} 暂不兼容，原数据已保留。`,
        };
      if (envelope.contentVersion !== CONTENT_VERSION)
        return {
          id,
          error: `剧情版本 ${envelope.contentVersion} 暂不兼容，可删除此存档。`,
        };
      try {
        return { id, state: validateGame(raw, id) };
      } catch (error) {
        return {
          id,
          error: error instanceof Error ? error.message : "存档资料损坏。",
        };
      }
    })
    .sort((a, b) =>
      (b.state?.updatedAt ?? "").localeCompare(a.state?.updatedAt ?? ""),
    );
}

function writeEnvelope(envelope: SaveEnvelope, storage: Storage): SaveEnvelope {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    throw new Error(
      "保存失败：本地存储不可用或空间已满。进度尚未写入，请重试保存。",
    );
  }
  return envelope;
}

export function persistGame(value: GameState, storage?: Storage): SaveEnvelope {
  const store = storageOrThrow(storage);
  const envelope = loadEnvelope(store);
  if (
    envelope.schemaVersion !== SCHEMA_VERSION ||
    envelope.contentVersion !== CONTENT_VERSION
  )
    throw new Error("现有存档版本不兼容，无法写入。原数据已保留。");
  const state = validateGame(value, value.id);
  const previousRaw = envelope.saves[state.id];
  if (previousRaw !== undefined) {
    const previous = validateGame(previousRaw, state.id);
    if (previous.status !== "active")
      throw new Error("这段人生已永久封存，不能覆盖。");
    if (state.step !== previous.step + 1)
      throw new Error("存档已被其他页面更新，请重新载入；不能回退或重复保存。");
    if (
      state.createdAt !== previous.createdAt ||
      JSON.stringify(state.character) !== JSON.stringify(previous.character)
    )
      throw new Error("人生创建资料不能改变。");
    if (
      JSON.stringify(state.history.slice(0, previous.step)) !==
      JSON.stringify(previous.history)
    )
      throw new Error("不能改写已经发生的人生。");
    const last = state.history.at(-1);
    if (!last) throw new Error("缺少本次选择履历。");
    const resolved = resolveChoice(
      previous,
      last.choiceId,
      previous.step,
    ).state;
    // Parse both states to use schema key order, including an endingId newly added by resolution.
    const comparable = (game: GameState) =>
      JSON.stringify({ ...gameSchema.parse(game), updatedAt: "" });
    if (comparable(resolved) !== comparable(state))
      throw new Error("进度与选择结算不一致，无法写入。");
  } else if (state.step !== 0 || state.status !== "active") {
    throw new Error("新存档必须从出生开始，不能创建回退快照。");
  }
  const saved = { ...state, updatedAt: new Date().toISOString() };
  const unlocked = state.endingId
    ? [...new Set([...envelope.unlocked, state.endingId])]
    : [...envelope.unlocked];
  return writeEnvelope(
    {
      ...envelope,
      revision: envelope.revision + 1,
      saves: { ...envelope.saves, [state.id]: saved },
      unlocked,
    },
    store,
  );
}

export function removeSave(id: string, storage?: Storage): SaveEnvelope {
  const store = storageOrThrow(storage);
  const envelope = loadEnvelope(store);
  if (envelope.schemaVersion !== SCHEMA_VERSION)
    throw new Error("此存档容器来自更新版本，不能修改。原数据已保留。");
  const saves = { ...envelope.saves };
  delete saves[id];
  return writeEnvelope(
    {
      ...envelope,
      contentVersion:
        Object.keys(saves).length === 0
          ? CONTENT_VERSION
          : envelope.contentVersion,
      revision: envelope.revision + 1,
      saves,
    },
    store,
  );
}
