import { EARLY_NODES } from "./early";
import { LATE_NODES } from "./late";
import { ENDING_NODES } from "./endings";
import type { Chapter, StoryNode } from "../game/types";
export { ENDINGS } from "./endings";
export const CONTENT_VERSION = "1.0.0";
export const START_NODE = "c1-start";
export const STORY_NODES = [...EARLY_NODES, ...LATE_NODES, ...ENDING_NODES];
export const STORY_BY_ID: Record<string, StoryNode> = Object.fromEntries(
  STORY_NODES.map((node) => [node.id, node]),
);
export const CHAPTERS: Chapter[] = [
  { number: 1, title: "根源", subtitle: "每一个故事，都始于微小的选择" },
  { number: 2, title: "学艺", subtitle: "你带走的，比行囊里的东西更多" },
  { number: 3, title: "断裂", subtitle: "当熟悉的世界在一夜间远去" },
  { number: 4, title: "重建", subtitle: "归处，可以由自己的双手建成" },
  { number: 5, title: "真相", subtitle: "听见神的声音，也要保留自己的判断" },
  { number: 6, title: "棋局", subtitle: "无人能独自改变这个世界" },
  { number: 7, title: "传承", subtitle: "你的一生，会留下怎样的回声" },
];
