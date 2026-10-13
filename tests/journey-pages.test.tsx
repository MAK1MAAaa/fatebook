import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../src/pages/Home";
import Create from "../src/pages/Create";
import Saves from "../src/pages/Saves";
import Endings from "../src/pages/Endings";
import World from "../src/pages/World";
import { createCharacter } from "../src/game/characters";
import { createRpg } from "../src/rpg/engine";
import { createBattle } from "../src/rpg/combat";
import { emptyEnvelope } from "../src/rpg/storage";
import { ENDINGS } from "../src/content";
import type { RpgStore } from "../src/rpg/context";
import type { GameStore } from "../src/game/store-context";

const runtime = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  rpg: null as RpgStore | null,
  legacy: null as GameStore | null,
}));

// Exercise page handlers with real content and save validation, without a DOM dependency.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState<T>(initial: T | (() => T)) {
    const index = runtime.cursor++;
    if (runtime.slots.length <= index) runtime.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [runtime.slots[index] as T, (value: T | ((previous: T) => T)) => {
      runtime.slots[index] = typeof value === "function" ? (value as (previous: T) => T)(runtime.slots[index] as T) : value;
    }];
  },
}));
vi.mock("../src/rpg/context", () => ({ useRpg: () => runtime.rpg }));
vi.mock("../src/game/store-context", () => ({ useGame: () => runtime.legacy }));
vi.mock("react-router", () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }));
vi.mock("../src/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  DialogContent: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("../src/components/rpg/Artwork", () => ({ Portrait: () => null }));

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (typeof node.type === "function") return elements((node.type as (props: Record<string, unknown>) => ReactNode)(node.props));
  return [node, ...elements(node.props.children as ReactNode)];
}
function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join("");
  if (isValidElement<Record<string, unknown>>(node)) return content(node.props.children as ReactNode);
  return node === null || typeof node === "boolean" || node === undefined ? "" : String(node);
}
function render(page: () => ReactNode): Element[] {
  runtime.cursor = 0;
  return elements(page());
}
function button(tree: Element[], label: string): Element {
  const found = tree.find(node => node.type === "button" && (content(node.props.children as ReactNode) === label || node.props["aria-label"] === label));
  if (!found) throw new Error(`缺少按钮：${label}`);
  return found;
}
async function click(node: Element) { await (node.props.onClick as () => unknown)(); }

beforeEach(() => {
  runtime.slots = [];
  runtime.cursor = 0;
  runtime.rpg = {
    envelope: emptyEnvelope(), error: null, pending: null, saving: false,
    start: vi.fn(), dispatch: vi.fn(), remove: vi.fn(), retry: vi.fn(), dismiss: vi.fn(), refresh: vi.fn(),
  };
  runtime.legacy = {
    envelope: { ...emptyEnvelope(), saves: {} }, error: null, pending: null, saving: false,
    start: vi.fn(), choose: vi.fn(), remove: vi.fn(), retry: vi.fn(), dismiss: vi.fn(), refresh: vi.fn(),
  };
});

describe("非战斗页面的关键交互", () => {
  it("档案将保存的胜利战局显示为待领奖", () => {
    const state = createRpg(createCharacter("custom", { budget: 0 }), "reward");
    state.battle = createBattle(state, "c1-main-1");
    state.battle.result = "won"; state.scene = "reward";
    state.reward = { encounterId: "c1-main-1", choices: [] };
    runtime.rpg!.envelope.saves = { reward: state };
    const tree = render(Saves);
    expect(tree.some(node => node.type === "strong" && content(node.props.children as ReactNode) === "等待领取战果")).toBe(true);
  });
  it("首页继续入口选择最近的活动人生，忽略更晚的封存与不兼容记录", () => {
    const active = createRpg(createCharacter("custom", { budget: 0 }), "continue", "2026-10-11T00:00:00.000Z");
    const older = createRpg(createCharacter("roxy", { budget: 0 }), "older", "2026-10-10T00:00:00.000Z");
    const archived = createRpg(createCharacter("eris", { budget: 0 }), "archived", "2026-10-12T00:00:00.000Z");
    archived.status = "alive";
    archived.endingId = "end-retired";
    runtime.rpg!.envelope.saves = { older, archived, continue: active, future: { ...archived, id: "future", rulesetVersion: "future" } };
    const tree = render(Home);
    const link = tree.find(node => node.type === "a" && content(node.props.children as ReactNode) === "继续旅途")!;
    expect(link.props.href).toBe("/story/continue");
    expect(content(tree.find(node => node.props.className === "continue-summary")!.props.children as ReactNode)).toContain("地区探索");
  });

  it("预设切换立即更新常显六维，保存等待与暂停锁住身份、预算和同意项", async () => {
    await click(button(render(Create), "魔术"));
    let tree = render(Create);
    const preview = tree.find(node => node.props["aria-label"] === "当前初始六项属性")!;
    const stats = elements(preview).filter(node => node.type === "strong").map(node => Number(content(node.props.children as ReactNode)));
    expect(stats).toHaveLength(6);
    expect(stats[1]).toBeGreaterThan(stats[2]);
    const manual = tree.find(node => node.props.className === "creation-fold manual-allocation")!;
    expect(manual.props.open).toBeUndefined();
    expect(elements(manual)).not.toContain(preview);
    for (const mode of ["saving", "pending"] as const) {
      runtime.rpg!.saving = mode === "saving";
      runtime.rpg!.pending = mode === "pending" ? createRpg(createCharacter("custom", { budget: 0 }), "pending") : null;
      tree = render(Create);
      expect(tree.filter(node => node.type === "input" || node.type === "select").every(node => node.props.disabled === true)).toBe(true);
    }
  });

  it("损坏记录可删除，写入失败保留确认与原因，成功后仍在档案管理", async () => {
    const state = createRpg(createCharacter("custom", { budget: 0 }), "active");
    runtime.rpg!.envelope.saves = { active: state, broken: { rulesetVersion: "future" } };
    await click(button(render(Saves), "删除broken的存档"));
    vi.mocked(runtime.rpg!.remove).mockImplementationOnce(async () => {
      runtime.rpg!.error = "保存失败：本地存储不可用或空间已满。";
      return false;
    });
    await click(button(render(Saves), "确认删除"));
    let tree = render(Saves);
    const dialog = tree.find(node => node.props.className === "delete-dialog")!;
    expect(content(dialog.props.children as ReactNode)).toContain("保存失败");
    expect(runtime.rpg!.envelope.saves.broken).toBeDefined();
    vi.mocked(runtime.rpg!.remove).mockImplementationOnce(async id => {
      delete runtime.rpg!.envelope.saves[id];
      runtime.rpg!.error = null;
      return true;
    });
    await click(button(tree, "确认删除"));
    tree = render(Saves);
    expect(tree.some(node => node.props.className === "delete-dialog")).toBe(false);
    expect(button(tree, "删除旅人的存档")).toBeDefined();
    expect(runtime.rpg!.envelope.saves.active).toBeDefined();
  });

  it("18 种结局合并两版图鉴去重，已解锁显示正文、未解锁仅显示线索", async () => {
    runtime.rpg!.envelope.unlocked = [ENDINGS[0].id, "unknown-ending"];
    runtime.legacy!.envelope.unlocked = [ENDINGS[0].id, ENDINGS[1].id];
    let tree = render(Endings);
    expect(tree.filter(node => String(node.props.className ?? "").startsWith("ending-card "))).toHaveLength(18);
    expect(content(tree.find(node => node.props.className === "ending-count")!.props.children as ReactNode)).toContain("2/ 18");
    await click(button(tree, `${ENDINGS[0].title}，已解锁，查看结局`));
    tree = render(Endings);
    expect(content(tree.find(node => node.props.className === "ending-detail ")!.props.children as ReactNode)).toContain(ENDINGS[0].description);
    await click(button(tree, `${ENDINGS[2].title}，未解锁，查看线索`));
    tree = render(Endings);
    const details = tree.find(node => node.props.className === "ending-detail ")!;
    expect(content(details.props.children as ReactNode)).toContain("解锁线索");
    expect(content(details.props.children as ReactNode)).not.toContain(ENDINGS[2].description);
  });

  it("百科搜索涵盖折叠正文，混合 IF 条目仍常显分类、摘要、剧透等级和来源", () => {
    const input = render(World).find(node => node.props["aria-label"] === "检索世界资料")!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "无牺牲" } });
    const tree = render(World);
    const entries = tree.filter(node => node.props.className === "world-entry surface-panel");
    expect(entries).toHaveLength(1);
    expect(content(entries[0].props.children as ReactNode)).toContain("贝加利特与迷宫");
    expect(content(entries[0].props.children as ReactNode)).toContain("含原创 IF");
    expect(content(entries[0].props.children as ReactNode)).toContain("基础世界观");
    expect(elements(entries[0]).find(node => node.type === "a")?.props.href).toMatch(/^https:\/\//);
    expect(elements(entries[0]).find(node => node.type === "details")?.props.open).toBeUndefined();
  });
});
