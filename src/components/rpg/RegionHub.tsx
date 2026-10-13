import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Flag, MapPin, ScrollText, Skull, Swords } from "lucide-react";
import { ENDINGS } from "../../content";
import { DEATH_CHAPTER, ENCOUNTER_BY_ID, QUESTS } from "../../rpg/content";
import { availableEncounters, chapterEvents, chapterProgress, endingOptions, regionInfo } from "../../rpg/engine";
import type { EncounterDefinition, GameAction, QuestDefinition, RpgEvent, RpgState } from "../../rpg/types";
import { RegionArtwork } from "./Artwork";

type HubView = "quests" | "events" | "map";
type QuestView = "main" | "challenge" | "completed";
type Send = (action: GameAction) => void;

function briefContext(text: string): string {
  const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) ?? [text];
  return sentences.slice(0, 2).join("");
}

const FIELD_EFFECTS: Record<EncounterDefinition["modifier"], string> = {
  none: "",
  ambush: "伏击：开场易伤 2 层",
  fog: "浓雾：首回合少抽 1 张牌",
  supplies: "补给：额外一次应急治疗",
  fire: "火场：开场燃烧 4 层",
  ward: "屏障：每回合格挡 8，敌方初始格挡 12",
  duel: "对练：无法使用应急药剂",
  reinforce: "掩护：敌方初始格挡 6",
};

function QuestCard({ quest, state, next, busy, send, onLearning, onPrerequisite }: {
  quest: QuestDefinition;
  state: RpgState;
  next?: EncounterDefinition;
  busy: boolean;
  send: Send;
  onLearning: () => void;
  onPrerequisite: (encounterId: string) => void;
}) {
  const accepted = state.acceptedQuests.includes(quest.id);
  const done = quest.encounters.filter(id => state.victories.includes(id)).length;
  const completed = done === quest.encounters.length;
  const learned = state.resolvedEvents.includes("rpg-learning");
  const pending = quest.encounters.map(id => ENCOUNTER_BY_ID[id]).find(encounter => !state.victories.includes(encounter.id));
  const missing = pending?.requires.filter(id => !state.victories.includes(id)) ?? [];
  if (completed) return <article className="quest-card compact-quest done">
    <div className="quest-top"><span><MapPin size={12} />{quest.location}</span><span><Check size={14} />已完成</span></div>
    <h3>{quest.title}</h3>
  </article>;
  return <article className="quest-card compact-quest" id={`quest-${quest.id}`} tabIndex={-1}>
    <div className="quest-top"><span><MapPin size={12} />{quest.location}</span><strong>{done}/{quest.encounters.length}</strong></div>
    <h3>{quest.title}</h3>
    {!accepted && <p className="quest-context">{briefContext(quest.description)}</p>}
    {accepted && next && <div className="quest-objective">
      {next.boss ? <Swords size={16} /> : <Flag size={16} />}
      <div>{next.title !== quest.title && <strong>{next.title}</strong>}<span>{next.objectiveText}</span></div>
      {next.boss && <span className="quest-boss-tag">关键对决</span>}
    </div>}
    {accepted && next && next.modifier !== "none" && <p className="quest-field-effect">{FIELD_EFFECTS[next.modifier]}</p>}
    {accepted && next?.goal === "rescue" && <p className="quest-field-effect">救援限时：须在 {next.rounds} 回合内完成。出发前检查攻击与抽牌比例，防守构筑可能来不及完成。</p>}
    <div className="quest-card-actions">
      <details className="quest-notes"><summary>任务说明<ChevronDown size={14} /></summary><p>{quest.description}</p>{next && <p>{next.summary}</p>}</details>
      {!accepted ? <button className="button subtle" disabled={busy} onClick={() => send({ type: "acceptQuest", questId: quest.id })}>接受委托<ArrowRight size={15} /></button>
          : !learned ? <button className="button subtle" onClick={onLearning}>先学习基础技艺<ArrowRight size={15} /></button>
            : next ? <button className="button primary" disabled={busy} onClick={() => send({ type: "startBattle", encounterId: next.id })}>{next.boss ? "进入关键对决" : "进入遭遇"}<ArrowRight size={15} /></button>
              : missing.length ? <div className="quest-prerequisites"><span>先完成</span>{missing.map(id => <button key={id} onClick={() => onPrerequisite(id)}>{ENCOUNTER_BY_ID[id].title}<ArrowRight size={14} /></button>)}</div> : <span className="muted">完成前置遭遇后开放</span>}
    </div>
  </article>;
}

function EventCard({ event, busy, send }: { event: RpgEvent; busy: boolean; send: Send }) {
  const context = briefContext(event.summary);
  const hasMore = !!event.detail || context !== event.summary;
  return <article className="event-card focused-event">
    <h3>{event.title}</h3>
    <p className="event-context">{context}</p>
    {hasMore && <details className="event-background"><summary>完整经历<ChevronDown size={14} /></summary>{context !== event.summary && <p>{event.summary}</p>}{event.detail && <p>{event.detail}</p>}</details>}
    <div>{event.choices.map(choice => <button key={choice.id} disabled={busy} onClick={() => send({ type: "event", eventId: event.id, choiceId: choice.id })}><strong>{choice.label}</strong><small>{choice.detail}</small><ArrowRight size={15} /></button>)}</div>
  </article>;
}

export default function RegionHub({ state, busy, send, onAdvance, onFatal }: {
  state: RpgState;
  busy: boolean;
  send: Send;
  onAdvance: () => void;
  onFatal: (id: string) => void;
}) {
  const learned = state.resolvedEvents.includes("rpg-learning");
  const [view, setView] = useState<HubView>(learned ? "quests" : "events");
  const [questView, setQuestView] = useState<QuestView>("main");
  const [place, setPlace] = useState("all");
  const [focusedEventId, setFocusedEventId] = useState<string | null>(learned ? null : "rpg-learning");
  const [focusedQuestId, setFocusedQuestId] = useState<string | null>(null);
  const region = regionInfo(state);
  const progress = chapterProgress(state);
  const events = chapterEvents(state);
  const pendingEvents = events.filter(event => !state.resolvedEvents.includes(event.id));
  const completedEvents = events.filter(event => state.resolvedEvents.includes(event.id));
  const currentEvent = pendingEvents.find(event => event.id === focusedEventId) ?? pendingEvents[0];
  const quests = QUESTS.filter(quest => quest.chapter === state.chapter && (place === "all" || quest.location === place));
  const completed = (quest: QuestDefinition) => quest.encounters.every(id => state.victories.includes(id));
  const mainQuests = quests.filter(quest => !quest.optional && !completed(quest));
  const sideQuests = quests.filter(quest => quest.optional && !completed(quest));
  const completedQuests = quests.filter(completed);
  const visibleQuests = questView === "main" ? mainQuests : questView === "challenge" ? sideQuests : completedQuests;
  const encounters = availableEncounters(state);
  const ready = progress.done === progress.total && progress.events === 0;
  const endings = endingOptions(state);
  const deaths = ENDINGS.filter(ending => ending.kind === "dead" && DEATH_CHAPTER[ending.id] === state.chapter && (ending.id !== "dead-illness" || state.character.actor === "roxy"));
  const openLearning = () => { setFocusedEventId("rpg-learning"); setView("events"); };
  const openPrerequisite = (id: string) => {
    const encounter = ENCOUNTER_BY_ID[id];
    setPlace("all"); setQuestView(encounter.optional ? "challenge" : "main"); setView("quests"); setFocusedQuestId(encounter.questId);
    requestAnimationFrame(() => document.getElementById(`quest-${encounter.questId}`)?.focus());
  };
  const renderQuest = (quest: QuestDefinition) => <QuestCard key={quest.id} quest={quest} state={state} next={encounters.find(encounter => encounter.questId === quest.id)} busy={busy} send={send} onLearning={openLearning} onPrerequisite={openPrerequisite} />;
  const featured = visibleQuests.find(quest => quest.id === focusedQuestId) ?? visibleQuests.find(quest => encounters.some(encounter => encounter.questId === quest.id)) ?? visibleQuests[0];
  const later = visibleQuests.filter(quest => quest !== featured);
  const selectPlace = (next: string) => { setPlace(next); setQuestView("main"); setView("quests"); };

  return <div className="rpg-hub">
    <nav className="hub-view-nav" aria-label="地区内容">
      <button aria-pressed={view === "quests"} aria-controls="hub-content" onClick={() => setView("quests")}><ScrollText size={17} />委托<span>{progress.done}/{progress.total}</span></button>
      <button aria-pressed={view === "events"} aria-controls="hub-content" onClick={() => setView("events")}><BookOpen size={17} />人生选择{pendingEvents.length > 0 && <span className="pending-count">{pendingEvents.length}</span>}</button>
      <button aria-pressed={view === "map"} aria-controls="hub-content" onClick={() => setView("map")}><MapPin size={17} />地图</button>
    </nav>
    <div className="rpg-hub-layout">
      <section className="hub-content parchment" id="hub-content" aria-label={view === "quests" ? "地区委托" : view === "events" ? "人生选择" : "地区地图"}>
        {view === "quests" && <>
          <div className="hub-section-heading"><h2>{questView === "completed" ? "完成记录" : questView === "challenge" ? "可选挑战" : "下一步行动"}</h2></div>
          <nav className="quest-list-tabs" aria-label="委托分类">
            <button aria-pressed={questView === "main"} onClick={() => setQuestView("main")}>主线 <span>{mainQuests.length}</span></button>
            <button aria-pressed={questView === "challenge"} onClick={() => setQuestView("challenge")}>挑战 <span>{sideQuests.length}</span></button>
            <button aria-pressed={questView === "completed"} onClick={() => setQuestView("completed")}>已完成 <span>{completedQuests.length}</span></button>
          </nav>
          {!learned && questView !== "completed" && <button className="hub-learning-link" onClick={openLearning}><BookOpen size={17} />先向第一位导师学习，再进入战斗<ArrowRight size={16} /></button>}
          {place !== "all" && <div className="hub-place-filter"><span><MapPin size={14} />{place}</span><button onClick={() => setPlace("all")}>显示全部地点</button></div>}
          <div className="quest-board compact-board featured-quest">{questView === "completed" ? visibleQuests.map(renderQuest) : featured && renderQuest(featured)}{visibleQuests.length === 0 && <p className="hub-empty">{questView === "challenge" ? "这里没有待完成的挑战。" : questView === "completed" ? "这里还没有完成的委托。" : place === "all" ? "主线已完成，处理人生选择后可前往下一章。" : "这里的主线已完成，可切换地点继续探索。"}</p>}</div>
          {questView !== "completed" && later.length > 0 && <details className="hub-fold later-quests"><summary><strong>其他委托</strong><span>{later.length}</span><ChevronDown size={16} /></summary><div className="quest-board compact-board">{later.map(renderQuest)}</div></details>}
        </>}
        {view === "events" && <>
          <div className="hub-section-heading"><h2>人生选择</h2></div>
          {pendingEvents.length > 1 && <label className="event-selector"><span className="sr-only">选择待处理的人生事件</span><select value={currentEvent?.id ?? ""} onChange={event => setFocusedEventId(event.target.value)}>{pendingEvents.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}
          {currentEvent ? <EventCard key={currentEvent.id} event={currentEvent} busy={busy} send={send} /> : <div className="hub-event-done"><Check size={30} /><h3>本章选择已经写入人生</h3><button className="button primary" onClick={() => setView("quests")}>返回委托<ArrowRight size={16} /></button></div>}
          {completedEvents.length > 0 && <details className="hub-fold"><summary><Check size={16} /><strong>已作出的选择</strong><span>{completedEvents.length}</span><ChevronDown size={16} /></summary><ul className="completed-event-list">{completedEvents.map(event => { const record = state.history.find(item => item.nodeId === event.id); return <li key={event.id}><strong>{event.title}</strong><span>{record?.choice}</span><p>{record?.feedback}</p></li>; })}</ul></details>}
        </>}
        {view === "map" && <>
          <div className="hub-section-heading"><h2>{region.region}</h2><MapPin size={22} /></div>
          <p className="map-caption">{region.subtitle}</p>
          <RegionArtwork chapter={state.chapter} places={region.places} selected={place} onPlace={selectPlace} />
          <div className="region-filter"><button className={place === "all" ? "active" : ""} onClick={() => selectPlace("all")}>全部地点</button>{region.places.map(location => <button className={place === location ? "active" : ""} key={location} onClick={() => selectPlace(location)}>{location}</button>)}</div>
        </>}
      </section>
      <aside className="hub-sidebar">
        <section className="chapter-depart parchment compact-depart">
          <div className="hub-section-heading"><h2>第 {state.chapter} 章 · {region.title}</h2><Flag size={18} /></div>
          <progress value={progress.done} max={progress.total} aria-label="本章主线进度" />
          <div className="chapter-todo"><span><Swords size={15} />{progress.total - progress.done} 场主线</span><button onClick={() => setView("events")}><BookOpen size={15} />{progress.events} 个选择<ArrowRight size={13} /></button></div>
          {state.chapter < 7 ? <button className="button primary" disabled={busy || !ready} onClick={onAdvance}>前往第 {state.chapter + 1} 章<ArrowRight size={16} /></button> : <>
            {!ready && <span className="fold-caption">完成本章主线与选择后，决定人生收束。</span>}
            {ready && endings.filter(option => option.ok).map(({ ending }) => <button className="ending-option" key={ending.id} disabled={busy} onClick={() => send({ type: "finish", endingId: ending.id })}><strong>{ending.title}</strong><ArrowRight size={15} /></button>)}
            <details className="hub-fold"><summary><strong>其他事业方向</strong><ChevronDown size={16} /></summary>{endings.filter(option => !option.ok).map(({ ending, missing }) => <div className="ending-locked" key={ending.id}><strong>{ending.title}</strong><small>{missing.join("；")}</small></div>)}</details>
          </>}
          {state.chapter < 7 && !ready && <span className="depart-hint">还需完成 {progress.total - progress.done} 场主线、{progress.events} 个选择</span>}
        </section>
        <details className="rpg-help parchment compact-help"><summary><CircleHelp size={17} /><strong>战术手册</strong><ChevronDown size={16} /></summary><p>每回合恢复3点行动力、抽5张。回合结束弃掉普通手牌，保留牌留在手里，消耗牌本场不再抽到。</p><p>格挡先吸收伤害，下回合清零。燃烧持续伤害；虚弱使伤害降至75%，易伤使承受伤害升至150%。</p><p>战败免费重试；相同牌组保持相同洗牌。强化、组牌、同伴和出牌顺序都能改变战术。</p><Link to="/world">世界资料与来源<ArrowRight size={14} /></Link></details>
        {deaths.length > 0 && <section className="rpg-danger compact-danger"><h3><Skull size={16} />不可逆剧情分支</h3><p>确认后会永久结束人生。普通战斗可以免费重试。</p>{deaths.map(ending => <button key={ending.id} disabled={busy} onClick={() => onFatal(ending.id)}>{ending.condition}<Skull size={14} /></button>)}</section>}
      </aside>
    </div>
  </div>;
}
