import { Link, useParams } from "react-router";
import { ArrowLeft, Feather, ChevronDown } from "lucide-react";
import { useGame } from "../game/store-context";
import { listSaves } from "../game/storage";
import { STORY_BY_ID, ENDINGS } from "../content";
import { renderBody } from "../game/engine";
export default function LegacyStory() {
  const { id } = useParams(), { envelope } = useGame();
  const row = listSaves(envelope).find(item => item.id === id), state = row?.state;
  if (!state) return <main className="empty-state"><h1>旧版记录无法读取</h1><p>{row?.error ?? "记录不存在"}</p><Link className="button subtle" to="/saves">返回人生档案</Link></main>;
  const node = STORY_BY_ID[state.nodeId];
  return <main className="page-shell legacy-page"><Link className="text-button" to="/saves"><ArrowLeft size={17} />人生档案</Link><div className="page-heading"><div><span className="eyebrow">1.0 文字版 · 只读记录</span><h1>{state.character.name}的一生</h1><p>已经发生的选择原样保留。</p></div></div><section className="legacy-record parchment"><h2>{ENDINGS.find(ending => ending.id === state.endingId)?.title ?? node?.title}</h2><p>{node ? renderBody(node, state) : "没有对应的正文。"}</p><h3>走过的人生</h3>{state.history.map((history, index) => <details key={`${history.nodeId}-${index}`}><summary><span>甲龙历 {history.year} · {history.title}<br />{history.choice}</span><ChevronDown size={17} /></summary><p>{STORY_BY_ID[history.nodeId]?.body.replaceAll("{name}", state.character.name)}</p><p>{history.feedback}</p></details>)}</section><Link className="button primary" to="/create"><Feather size={17} />开启新的卡牌人生</Link></main>;
}
