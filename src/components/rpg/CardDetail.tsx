import { useState } from "react";
import { ChevronDown, Check, Plus, Trash2, ArrowUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { cardSources, cardUnlockReason, sortedCopies } from "../../rpg/catalog";
import { cardEffect, effectText } from "../../rpg/combat";
import { useRpg } from "../../rpg/context";
import { canLearnCard } from "../../rpg/engine";
import type { CardDefinition, RpgState } from "../../rpg/types";
import CardTile from "./CardTile";
import SavePauseNotice from "./SavePauseNotice";

export default function CardDetail({ card, state, draft, onToggleCopy, onClose, readOnly = false }: { card: CardDefinition; state: RpgState; draft?: string[]; onToggleCopy?: (uid: string) => void; onClose: () => void; readOnly?: boolean }) {
  const { dispatch, saving, pending } = useRpg();
  const [variant, setVariant] = useState<"normal" | "upgraded">("normal");
  const [expandedSources, setExpandedSources] = useState(false);
  const busy = saving || !!pending, copies = sortedCopies(state.collection.filter(copy => copy.cardId === card.id)), price = 25 + state.chapter * 5;
  const selectedDeck = draft ?? state.deck;
  const conciseSources = cardSources(card), fullSources = cardSources(card, true);
  const hasMoreSources = conciseSources.some((source, index) => source !== fullSources[index]);
  const normal = { uid: "preview-normal", cardId: card.id, upgraded: false }, upgraded = { ...normal, uid: "preview-upgraded", upgraded: true };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="card-detail-dialog"><DialogTitle>{card.name}</DialogTitle><DialogDescription className="card-detail-unlock">{cardUnlockReason(state, card)} · 拥有{copies.length}张 · 已编入{copies.filter(copy => selectedDeck.includes(copy.uid)).length}张</DialogDescription><SavePauseNotice />
    <div className="card-detail-content"><section className="card-detail-variants" aria-label="普通版和强化版对照"><nav className="card-detail-variant-tabs" aria-label="查看卡牌版本"><button aria-pressed={variant === "normal"} onClick={() => setVariant("normal")}>普通版</button><button aria-pressed={variant === "upgraded"} onClick={() => setVariant("upgraded")}>强化版</button></nav><div className={`card-detail-variant ${variant === "normal" ? "variant-active" : ""}`}><h3>普通版</h3><CardTile card={card} owned={normal} state={state} compact /></div><div className={`card-detail-variant ${variant === "upgraded" ? "variant-active" : ""}`}><h3>强化版</h3><CardTile card={card} owned={upgraded} state={state} compact /></div></section>
      <section className="card-detail-information"><p>{card.text}</p><p className="card-detail-effect-note">以上为当前角色、装备与同伴加成后的牌效。</p>
        <details className="card-detail-fold"><summary>机制说明<ChevronDown size={16} /></summary><ul>{card.effect.damage && <li>攻击固定命中，受虚弱、易伤和敌方格挡影响。</li>}{card.effect.block && <li>格挡：吸收伤害，本回合可叠加，下回合开始时重置。</li>}{card.effect.heal && <li>治疗：恢复主角生命，最多恢复至生命上限。</li>}{card.effect.draw && <li>抽牌：手牌上限10张；抽牌堆空时洗入弃牌堆，达到上限后停止抽牌。</li>}{card.effect.energy && <li>行动力：本回合补充，最多9点；下回合重置为3点。</li>}{card.retain && <li>保留：结束回合时留在手牌中，仍可能受到敌方扰乱。</li>}{card.exhaust && <li>消耗：打出后本场战斗不再抽到。</li>}{card.effect.burn && <li>燃烧：回合结束时按当前层数扣除生命并减少1层；该回合敌方治疗减半。</li>}{card.effect.weak && <li>虚弱：使敌方攻击伤害减少25%，每次该敌人完成意图后减少1层。</li>}{card.effect.vulnerable && <li>易伤：使该敌人受到后续攻击伤害增加50%，每次该敌人完成意图后减少1层。</li>}{card.effect.cleanse && <li>净化：清除主角的燃烧、虚弱和易伤。</li>}{card.effect.all && <li>全体：攻击和敌方负面效果作用于所有存活敌人；格挡、治疗仍给予主角。</li>}</ul></details>
        <details className="card-detail-fold"><summary>获取途径<ChevronDown size={16} /></summary><ul>{(expandedSources ? fullSources : conciseSources).map(source => <li key={source}>{source}</li>)}</ul>{hasMoreSources && <button className="card-source-expand" aria-expanded={expandedSources} onClick={() => setExpandedSources(current => !current)}>{expandedSources ? "收起完整来源" : "查看完整来源"}</button>}</details>
      </section>
    </div>
    {copies.length > 0 && !readOnly && <section className="card-detail-copies"><h3>管理副本</h3>{copies.map((copy, index) => { const included = selectedDeck.includes(copy.uid), removable = !included && !state.deck.includes(copy.uid), capped = selectedDeck.length >= 25 || copies.filter(item => selectedDeck.includes(item.uid)).length >= 3; return <article key={copy.uid}><div><strong>{copy.upgraded ? "强化" : "普通"}副本 {index + 1}{included && <span>已编入</span>}</strong><p>{effectText(cardEffect(state, copy))}</p></div><div className="card-copy-actions">{onToggleCopy && <button disabled={busy || (!included && (capped || !canLearnCard(state, card)))} aria-pressed={included} onClick={() => onToggleCopy(copy.uid)}>{included ? <Check size={15} /> : <Plus size={15} />}{included ? "取下" : "编入"}</button>}<button disabled={busy || copy.upgraded || state.money < price} onClick={() => void dispatch(state, { type: "upgradeCard", uid: copy.uid })}><ArrowUp size={15} />{copy.upgraded ? "已强化" : `强化 ${price}`}</button><button disabled={busy || !removable} title={!removable ? "先从草稿及已保存牌组取下，再保存牌组" : "永久移除这张收藏卡牌"} aria-label={`永久移除${card.name}${copy.upgraded ? "强化" : "普通"}副本${index + 1}`} onClick={() => void dispatch(state, { type: "removeCard", uid: copy.uid })}><Trash2 size={15} />移除</button></div></article>; })}<p className="card-maintenance-note">移除收藏前，先将该副本取下并保存牌组。</p></section>}
  </DialogContent></Dialog>;
}
