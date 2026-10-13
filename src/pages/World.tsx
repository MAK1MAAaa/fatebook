import { useState } from "react";
import { ExternalLink, Search, BookOpen, Map, ChevronDown } from "lucide-react";
import { WORLD_ENTRIES } from "../content/world";
import WorldMap from "../components/game/WorldMap";
import "./journey-pages.css";

export default function World() {
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const entries = WORLD_ENTRIES.filter(entry => (category === "全部" || entry.category === category) && `${entry.title}${entry.subtitle}${entry.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <main className="page-shell world-page">
    <div className="page-heading"><div><span className="eyebrow">世界手册</span><h1>剑与魔法的世界</h1><p>原著设定与游戏规则，逐项附来源。</p></div><BookOpen className="heading-icon" size={38} /></div>
    <section className="world-controls" aria-label="资料筛选">
      <label className="search-input"><Search size={19} /><input placeholder="搜索地名、种族或规则" aria-label="检索世界资料" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="tabs-row" role="group" aria-label="世界资料分类">{["全部", "地理", "力量", "种族", "社会", "历史", "规则"].map(item => <button className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div>
    </section>
    <details className="atlas-banner surface-panel"><summary><Map size={19} />五大陆旅行示意<ChevronDown size={18} /></summary><div className="atlas-map"><WorldMap large /><p>非精确地理比例；六面世界的远古历史另列于资料中。</p></div></details>
    <p className="world-result-count" aria-live="polite">{entries.length} 条资料 · 部分含小说后期剧透</p>
    <div className="world-entry-grid">{entries.map(entry => <article className="world-entry surface-panel" key={entry.id}>
      <div className="entry-badges"><span>{entry.category}</span><span>{entry.kind}</span>{entry.body.includes("原创 IF") && <span className="if-marker">含原创 IF</span>}<span className={entry.spoiler === "小说后期" ? "spoiler" : ""}>{entry.spoiler}</span></div>
      <h2>{entry.title}</h2><p className="entry-subtitle">{entry.subtitle}</p>
      <details className="world-entry-details"><summary>阅读正文<ChevronDown size={17} /></summary><p>{entry.body}</p></details>
      <a className="text-button" href={entry.source} target="_blank" rel="noopener noreferrer">{entry.kind === "游戏规则" ? "资料来源" : "原著来源"}<ExternalLink size={15} /></a>
    </article>)}</div>
    {entries.length === 0 && <div className="empty-state"><Search size={30} /><h2>未找到相关资料</h2><p>尝试其他关键词，或切换到全部分类。</p></div>}
  </main>;
}
