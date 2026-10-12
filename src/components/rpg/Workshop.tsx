import { ChevronDown, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { CARDS, COMPANIONS } from "../../rpg/cards";
import { availableCompanions, schoolLabel } from "../../rpg/engine";
import { useRpg } from "../../rpg/context";
import { SKILL_KEYS } from "../../game/engine";
import { STAT_LABELS, SKILL_RANKS } from "../../game/characters";
import { STAT_KEYS } from "../../game/types";
import type { Companion, RpgState } from "../../rpg/types";
import { characterPortraitKey, companionPortraitKey } from "../../rpg/portraits";
import { effectText } from "../../rpg/combat";
import { Portrait } from "./Artwork";
import DeckWorkshop from "./DeckWorkshop";
import ShopWorkshop from "./ShopWorkshop";
import JournalWorkshop from "./JournalWorkshop";
import SavePauseNotice from "./SavePauseNotice";

export type WorkshopTab = "deck" | "training" | "shop" | "companions" | "status" | "journal";
const tabNames: Record<WorkshopTab, string> = { deck: "牌组工坊", training: "导师训练", shop: "地区商店", companions: "同行援助", status: "角色档案", journal: "人生与战绩" };

export default function Workshop({ state, tab, onClose }: { state: RpgState; tab: WorkshopTab; onClose: () => void }) {
  const { dispatch, saving, pending } = useRpg();
  const busy = saving || !!pending;
  const available = availableCompanions(state);
  const eligible = COMPANIONS.filter(companion => companion.actor !== state.character.actor);
  const locked = eligible.filter(companion => !available.some(item => item.id === companion.id));
  function renderCompanion(companion: Companion) {
    const unlocked = available.some(item => item.id === companion.id);
    const selected = state.companionId === companion.id;
    const passive = { health: "最大生命 +20", damage: "攻击牌伤害 +3", block: "防御牌格挡 +3", draw: "开局抽牌 +1" }[companion.passive];
    const condition = companion.requiredFlag === 'superdTrust' ? '建立斯佩路德族信任' : companion.requiredFlag === 'dragonPact' ? '完成龙神盟约' : '';
    return <article key={companion.id} className={unlocked ? "" : "locked"}>
      <Portrait name={companion.name} portraitKey={companionPortraitKey(companion.id, state.year)} className="companion-art" sizes="(max-width: 600px) 140px, 200px" />
      <strong>{companion.name}</strong>
      <p className="companion-passive">{passive}</p>
      <p className="companion-skill"><strong>{companion.skillName} · 冷却 3 回合</strong>{effectText(companion.skill)}</p>
      <details className="copy-maintenance"><summary>人物介绍<ChevronDown size={14} /></summary><p className="companion-introduction">{companion.description}</p></details>
      {!unlocked && <p className="companion-passive">第{companion.chapter}章{condition ? ` · ${condition}` : '结识'}</p>}
      <button disabled={busy || !unlocked || selected} onClick={() => void dispatch(state, { type: "setCompanion", companionId: companion.id })}>{selected ? <><Check size={14} />正在同行</> : unlocked ? "邀请同行" : "尚未结识"}</button>
    </article>;
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="rpg-workshop"><DialogTitle>{tabNames[tab]}</DialogTitle><DialogDescription>旅费 {state.money}</DialogDescription><SavePauseNotice />
    {tab === "deck" && <DeckWorkshop state={state} onClose={onClose} />}
    {tab === "shop" && <ShopWorkshop state={state} />}
    {tab === "training" && <>
      <details className="workshop-fold"><summary><strong>课程说明与阶位限制</strong><ChevronDown size={16} /></summary><p>学习技艺会获得对应阶位的技能牌。当前导师教授至{SKILL_RANKS[Math.min(4, state.chapter)]}。无咏唱、斗气等身份能力不会由属性自动获得。</p></details>
      <div className="training-list">{SKILL_KEYS.map(skill => { const rank = state.skills[skill], price = rank === 0 ? 12 : 25 + rank * 12; return <article key={skill}><div><strong>{schoolLabel(skill)}</strong><span>{SKILL_RANKS[rank]}</span><p>{CARDS.filter(card => card.school === skill && card.rank === rank + 1).map(card => card.name).join("、") || "已完成本版课程"}</p></div><button className="button subtle" disabled={busy || rank >= Math.min(4, state.chapter) || state.money < price} onClick={() => void dispatch(state, { type: "train", skill })}>学习 · {price}</button></article>; })}</div>
    </>}
    {tab === "companions" && <>
      <details className="workshop-fold"><summary><strong>援助规则</strong><ChevronDown size={16} /></summary><p>一名同伴提供被动与主动支援，主动技能冷却3回合。玩家扮演的人物不会同时成为自己的同伴。</p></details>
      <button className="button subtle" disabled={busy || state.companionId === null} onClick={() => void dispatch(state, { type: "setCompanion", companionId: null })}>独自行动</button>
      <div className="companion-grid">{eligible.filter(companion => available.some(item => item.id === companion.id)).map(renderCompanion)}</div>
      {locked.length > 0 && <details className="workshop-fold"><summary><strong>后续可结识的同伴</strong><span>{locked.length} 位</span><ChevronDown size={16} /></summary><div className="companion-grid">{locked.map(renderCompanion)}</div></details>}
    </>}
    {tab === "status" && <>
      <div className="role-profile"><Portrait name={state.character.name} portraitKey={characterPortraitKey(state.character, state.age, state.year)} className="role-art" sizes="(max-width: 600px) 98px, 150px" /><div><h3>{state.character.name}</h3><p>{state.age}岁 · 甲龙历{state.year}</p><details className="copy-maintenance"><summary>身份经历<ChevronDown size={14} /></summary><p>{state.character.traits.join(" · ")}</p></details></div></div>
      <div className="rpg-stat-grid">{STAT_KEYS.map(id => <article key={id}><small>{STAT_LABELS[id]}</small><strong>{state.stats[id]}</strong></article>)}</div>
      <details className="workshop-fold"><summary><strong>技艺阶位</strong><ChevronDown size={16} /></summary><div className="training-list">{SKILL_KEYS.map(id => <article key={id}><strong>{schoolLabel(id)}</strong><span>{SKILL_RANKS[state.skills[id]]}</span></article>)}</div></details>
      <div className="role-record-chips"><span>胜利 {state.victories.length}</span><span>公会 {["F", "E", "D", "C", "B", "A", "S"][state.guild]}</span><span>补给 {state.supplies}</span></div>
    </>}
    {tab === "journal" && <JournalWorkshop state={state} />}
  </DialogContent></Dialog>;
}
