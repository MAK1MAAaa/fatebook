import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CHAPTER_INFO, ENCOUNTER_BY_ID, EVENT_BY_ID } from "../../rpg/content";
import type { RpgState } from "../../rpg/types";

export default function JournalWorkshop({ state }: { state: RpgState }) {
  const [chapter, setChapter] = useState(state.chapter);
  const [view, setView] = useState<"choices" | "battles">("choices");
  const [expanded, setExpanded] = useState<string | null>(null);
  const choices = state.history.filter(item => {
    const transition = /^chapter-(\d+)$/.exec(item.nodeId);
    return (EVENT_BY_ID[item.nodeId]?.chapter ?? (transition ? Number(transition[1]) : state.chapter)) === chapter;
  });
  const battles = state.receipts.filter(item => ENCOUNTER_BY_ID[item.encounterId]?.chapter === chapter);

  return <div className="chapter-journal compact-journal">
    <div className="journal-overview"><article><small>已完成战斗</small><strong>{battles.length}</strong></article><article><small>记录回合</small><strong>{battles.reduce((total, battle) => total + battle.turns, 0)}</strong></article><article><small>人生选择</small><strong>{choices.length}</strong></article></div>
    <label className="journal-chapter-select">
      <span className="sr-only">查看章节</span>
      <select value={chapter} onChange={event => { setChapter(Number(event.target.value)); setExpanded(null); }}>
        {CHAPTER_INFO.slice(0, state.chapter).map((item, index) => <option key={item.title} value={index + 1}>第 {index + 1} 章 · {item.title}</option>)}
      </select>
    </label>
    <nav className="journal-view-tabs" aria-label="经历分类">
      <button aria-pressed={view === "choices"} onClick={() => { setView("choices"); setExpanded(null); }}>人生选择 <span>{choices.length}</span></button>
      <button aria-pressed={view === "battles"} onClick={() => { setView("battles"); setExpanded(null); }}>战斗记录 <span>{battles.length}</span></button>
    </nav>
    {view === "choices" ? <ol className="journal-entry-list">
      {choices.map((item, index) => {
        const key = `choice-${item.nodeId}-${index}`;
        const open = expanded === key;
        return <li key={key}>
          <button className="journal-entry-toggle" aria-expanded={open} aria-controls={`${key}-detail`} onClick={() => setExpanded(open ? null : key)}>
            <span><strong>{item.title}</strong><span>{item.choice}</span></span><ChevronDown size={18} />
          </button>
          {open && <div id={`${key}-detail`} className="journal-entry-detail"><span className="journal-date">甲龙历 {item.year} 年 · {item.age} 岁</span><p>{item.feedback}</p></div>}
        </li>;
      })}
      {choices.length === 0 && <li className="journal-empty">本章尚未作出选择。</li>}
    </ol> : <ol className="journal-entry-list">
      {battles.map(item => {
        const key = `battle-${item.encounterId}`;
        const open = expanded === key;
        return <li key={key}>
          <button className="journal-entry-toggle" aria-expanded={open} aria-controls={`${key}-detail`} onClick={() => setExpanded(open ? null : key)}>
            <span><strong>{ENCOUNTER_BY_ID[item.encounterId]?.title ?? item.encounterId}</strong><span>{item.turns} 回合</span></span><ChevronDown size={18} />
          </button>
          {open && <div id={`${key}-detail`} className="journal-entry-detail"><p>{item.goal}</p><div className="journal-battle-stats"><span>出牌 {item.played} 次</span><span>承受伤害 {item.damageTaken}</span></div></div>}
        </li>;
      })}
      {battles.length === 0 && <li className="journal-empty">本章还没有战斗记录。</li>}
    </ol>}
  </div>;
}
