import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Feather, Trash2, ArrowRight, Archive, AlertTriangle, ChevronDown } from "lucide-react";
import { useRpg } from "../rpg/context";
import { useGame } from "../game/store-context";
import { listRpgSaves } from "../rpg/storage";
import { listSaves } from "../game/storage";
import { ENDINGS, STORY_BY_ID } from "../content";
import { CHAPTER_INFO } from "../rpg/content";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Portrait } from "../components/rpg/Artwork";
import { characterPortraitKey } from "../rpg/portraits";

type RpgSaveRow = ReturnType<typeof listRpgSaves>[number];
type DeletingSave = { id: string; legacy: boolean; name: string };

function RpgSaveCard({ row, busy, onDelete }: { row: RpgSaveRow; busy: boolean; onDelete: (save: DeletingSave) => void }) {
  const { id, state, error } = row;
  return <article className={`save-card ${error ? "broken-save" : ""} ${state?.status === "active" ? "active-save" : ""}`}>
    <div className="save-card-top"><span className="badge">{error ? "无法读取" : state?.status === "active" ? "旅途进行中" : "人生已封存"}</span><button className="icon-button" aria-label={`删除${state?.character.name ?? id}的存档`} disabled={busy} onClick={() => onDelete({ id, legacy: false, name: state?.character.name ?? id })}><Trash2 size={18} /></button></div>
    {state ? <>
      <div className="save-profile"><Portrait name={state.character.name} portraitKey={characterPortraitKey(state.character, state.age, state.year)} className="save-portrait" sizes="100px" /><div><h3>{state.character.name}</h3><p>甲龙历 {state.year} · {state.age} 岁</p></div></div>
      <div className="save-chapter"><span>第 {state.chapter} 章 · {CHAPTER_INFO[state.chapter - 1].title}</span><strong>{state.status === "active" ? state.battle ? state.battle.result === "lost" ? "战败，可调整构筑重试" : `战斗第 ${state.battle.turn} 回合` : state.scene === "reward" ? "等待领取战果" : "地区探索" : ENDINGS.find(ending => ending.id === state.endingId)?.title ?? "人生收束"}</strong></div>
      <div className="save-card-bottom"><span>{state.victories.length} 场胜利 · {state.collection.length} 张收藏</span><Link className={state.status === "active" ? "button primary" : "button subtle"} to={`/story/${id}`}>{state.status === "active" ? "继续旅途" : "查阅此生"}<ArrowRight size={17} /></Link></div>
      <details className="save-record-details"><summary>记录信息<ChevronDown size={16} /></summary><p>更新于 {new Date(state.updatedAt).toLocaleString("zh-CN")}<br />卡牌 RPG · 剧情 2.0.0</p></details>
    </> : <><h3>损坏或不兼容的记录</h3><p className="form-error" role="alert"><AlertTriangle size={17} />{error}</p></>}
  </article>;
}

export default function Saves() {
  const rpg = useRpg(), legacy = useGame(), navigate = useNavigate();
  const [deleting, setDeleting] = useState<DeletingSave | null>(null);
  const rows = listRpgSaves(rpg.envelope), oldRows = listSaves(legacy.envelope);
  const busy = rpg.saving || !!rpg.pending || legacy.saving || !!legacy.pending;
  const groups = [
    { title: "继续旅途", rows: rows.filter(row => row.state?.status === "active") },
    { title: "封存的人生", rows: rows.filter(row => row.state && row.state.status !== "active") },
    { title: "需要处理的记录", rows: rows.filter(row => !row.state) },
  ];
  return <main className="page-shell saves-page">
    <div className="page-heading"><div><span className="eyebrow">人生档案</span><h1>下一页，仍在这里</h1><p>继续当前回合，或查阅走过的人生。</p></div><Link className="button primary" to="/create"><Feather size={18} />新的人生</Link></div>
    <details className="storage-note surface-panel"><summary><Archive size={19} />本地存档说明<ChevronDown size={17} /></summary><p>存档只属于当前浏览器和访问地址，手机与电脑不会共享。删除单局会保留结局图鉴；清理浏览器数据会删除本地记录。</p></details>
    {legacy.error && <p role="alert" className="form-error">旧版存档：{legacy.error}</p>}
    {!rows.length && !oldRows.length && <section className="empty-state"><Archive size={32} /><h2>还没有记录</h2><Link className="button primary" to="/create">创建角色<ArrowRight size={18} /></Link></section>}
    {groups.filter(group => group.rows.length > 0).map(group => <section className="save-group" key={group.title}><div className="section-title"><h2>{group.title}</h2><span className="group-count">{group.rows.length}</span></div><div className="save-grid">{group.rows.map(row => <RpgSaveCard key={row.id} row={row} busy={busy} onDelete={setDeleting} />)}</div></section>)}
    {oldRows.length > 0 && <section className="save-group"><div className="section-title"><h2>旧文字版记录</h2><span className="badge">只读</span></div><div className="save-grid">{oldRows.map(({ id, state, error }) => <article key={id} className={`save-card ${error ? "broken-save" : ""}`}><div className="save-card-top"><span className="badge">1.0 文字版</span><button className="icon-button" aria-label={`删除旧版${state?.character.name ?? id}的存档`} disabled={busy} onClick={() => setDeleting({ id, legacy: true, name: state?.character.name ?? id })}><Trash2 size={18} /></button></div>{state ? <><div className="save-profile"><Portrait name={state.character.name} portraitKey={characterPortraitKey(state.character, state.age, state.year)} className="save-portrait" sizes="100px" /><div><h3>{state.character.name}</h3><p>甲龙历 {state.year} · {state.age} 岁</p></div></div><div className="save-chapter"><strong>{STORY_BY_ID[state.nodeId]?.title}</strong><span>{state.step} 次已发生的选择</span></div><Link className="button subtle" to={`/legacy/${id}`}>只读查阅<ArrowRight size={17} /></Link></> : <><h3>旧版损坏记录</h3><p className="form-error">{error}</p></>}</article>)}</div></section>}
    {deleting && <Dialog open onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent className="delete-dialog"><DialogTitle>删除「{deleting.name}」？</DialogTitle><DialogDescription>删除这段本地人生，无法撤销。已解锁结局图鉴仍会保留。</DialogDescription><div className="dialog-actions"><button className="button subtle" disabled={busy} onClick={() => setDeleting(null)}>保留记录</button><button className="button danger fatal-confirm" disabled={busy} onClick={async () => { const success = await (deleting.legacy ? legacy : rpg).remove(deleting.id); if (success) { setDeleting(null); navigate("/"); } }}>{busy ? "正在删除…" : "确认删除"}</button></div></DialogContent></Dialog>}
  </main>;
}
