import { useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import { Check, Minus, Plus, Layers, BookOpen, ArrowUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { cardFor, cardsFor } from "../../rpg/rulesets";
import { useRpg } from "../../rpg/context";
import { canLearnCard, safeDeckPreset, validateDeck } from "../../rpg/engine";
import { EMPTY_FILTERS, cardUnlockReason, changeCardQuantity, deckStatistics, groupCards, matchesCard } from "../../rpg/catalog";
import type { RpgState } from "../../rpg/types";
import CardTile from "./CardTile";
import CardDetail from "./CardDetail";
import CatalogFilters from "./CatalogFilters";
import SavePauseNotice from "./SavePauseNotice";

export interface DeckWorkshopHandle { requestClose: () => void; }
type PresetStyle = "balanced" | "attack" | "guard" | "magic";
const presetNames: Record<PresetStyle, string> = { balanced: "均衡", attack: "进攻", guard: "防守", magic: "魔术" };

function DeckSummary({ state, deck }: { state: RpgState; deck: string[] }) {
  const statistics = deckStatistics(state, deck);
  return <section className="deck-live-summary" aria-label="费用与功能分布">
    <div className="deck-cost-summary"><strong>平均费用 {statistics.averageCost.toFixed(1)}</strong><div className="deck-cost-curve">{statistics.costs.map((count, cost) => <div key={cost} aria-label={`${cost}费 ${count}张`}><span>{count}</span><i style={{ height: `${Math.max(3, count * 4)}px` }} /><strong>{cost}费</strong></div>)}</div></div>
    <div className="deck-stat-chips"><span>攻击 {statistics.attack}</span><span>格挡 {statistics.block}</span><span>治疗 {statistics.heal}</span><span>功能 {statistics.utility}</span><span>抽牌 {statistics.draw}</span><span>回能 {statistics.energy}</span><span>强化 {statistics.upgraded}</span><small>混合牌可计入多个功能</small></div>
  </section>;
}

export default function DeckWorkshop({ state, onClose, ref }: { state: RpgState; onClose: () => void; ref?: Ref<DeckWorkshopHandle> }) {
  const { dispatch, saving, pending } = useRpg();
  const busy = saving || !!pending;
  const [draft, setDraft] = useState([...state.deck]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [catalogView, setCatalogView] = useState<"owned" | "all">("owned");
  const [mobileView, setMobileView] = useState<"deck" | "catalog">("catalog");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [exitOpen, setExitOpen] = useState(false);
  const [preview, setPreview] = useState<{ style: PresetStyle; deck: string[] } | null>(null);
  const allCards = cardsFor(state);
  const groups = groupCards(state.collection, draft, state), groupById = new Map(groups.map(group => [group.card.id, group]));
  const deckGroups = groups.filter(group => group.included.length > 0);
  const cards = (catalogView === "owned" ? groups.map(group => group.card) : allCards).filter(card => matchesCard(state, card, filters)).sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const changed = draft.length !== state.deck.length || draft.some(uid => !state.deck.includes(uid));
  function requestClose() {
    if (busy) return;
    if (changed) setExitOpen(true);
    else onClose();
  }
  useImperativeHandle(ref, () => ({ requestClose }));
  function quantity(cardId: string, delta: 1 | -1) {
    if (busy) return;
    try { setDraft(changeCardQuantity(state, draft, cardId, delta)); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "无法调整数量"); }
  }
  function toggle(uid: string) {
    if (busy) return;
    const copy = state.collection.find(item => item.uid === uid);
    if (!copy) return;
    const included = draft.includes(uid);
    if (!included && (!canLearnCard(state, cardFor(state, copy.cardId)) || draft.length >= 25 || state.collection.filter(item => item.cardId === copy.cardId && draft.includes(item.uid)).length >= 3)) { setError("已达数量上限，或尚未学会该牌。"); return; }
    setDraft(current => included ? current.filter(id => id !== uid) : [...current, uid]);
    setError("");
  }
  async function apply() {
    if (busy) return;
    try {
      validateDeck(state, draft);
      if (await dispatch(state, { type: "setDeck", deck: draft })) onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "牌组无效");
    }
  }
  function previewPreset(style: PresetStyle) {
    if (busy) return;
    try { setPreview({ style, deck: safeDeckPreset(state, style) }); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "当前收藏无法生成合法预设"); }
  }
  function controls(cardId: string) {
    const card = cardFor(state, cardId), group = groupById.get(cardId), count = group?.included.length ?? 0, max = Math.min(3, group?.copies.length ?? 0);
    return <div className="card-quantity"><button aria-label={`从牌组取下一张${card.name}`} disabled={busy || count === 0} onClick={() => quantity(cardId, -1)}><Minus size={17} /></button><span aria-label={`编入${count}张`}>{count}</span><button aria-label={`向牌组加入一张${card.name}`} disabled={busy || count >= max || draft.length >= 25 || !canLearnCard(state, card)} onClick={() => quantity(cardId, 1)}><Plus size={17} /></button></div>;
  }
  return <div className="deck-builder">
    <div className="deck-builder-heading"><strong>牌组 {draft.length} / 25</strong><span>15–25张 · 同牌最多3张</span></div>
    <DeckSummary state={state} deck={draft} />
    <div className="deck-presets"><strong>构筑预设</strong><div className="rpg-preset-row">{(Object.keys(presetNames) as PresetStyle[]).map(style => <button key={style} disabled={busy} onClick={() => previewPreset(style)}>预览{presetNames[style]}</button>)}</div><p>按当前角色、收藏强化、装备与同伴生成；应用后仍可调整。</p></div>
    <nav className="deck-mobile-tabs" aria-label="组牌视图"><button aria-pressed={mobileView === "deck"} onClick={() => setMobileView("deck")}><Layers size={17} />当前牌组 {draft.length}</button><button aria-pressed={mobileView === "catalog"} onClick={() => setMobileView("catalog")}><BookOpen size={17} />收藏与图鉴</button></nav>
    <div className="deck-builder-layout">
      <section className={`deck-builder-list ${mobileView === "deck" ? "mobile-active" : ""}`} aria-label="当前牌组"><h3>当前牌组</h3><div className="deck-rows">{deckGroups.map(group => <article key={group.card.id}><button className="deck-row-preview" onClick={() => setDetailId(group.card.id)}><span className="deck-row-cost" style={{ background: group.card.color }}>{group.card.cost}</span><span><strong>{group.card.name}</strong>{group.included.some(copy => copy.upgraded) && <span className="deck-row-upgrades"><ArrowUp size={13} />强化 {group.included.filter(copy => copy.upgraded).length}</span>}</span></button>{controls(group.card.id)}</article>)}</div>{deckGroups.length === 0 && <p className="hub-empty">从收藏中加入卡牌。</p>}
      </section>
      <section className={`deck-builder-catalog ${mobileView === "catalog" ? "mobile-active" : ""}`} aria-label="卡牌收藏与图鉴"><nav className="card-catalog-tabs" aria-label="卡牌范围"><button aria-pressed={catalogView === "owned"} onClick={() => setCatalogView("owned")}>我的收藏 {groups.length}</button><button aria-pressed={catalogView === "all"} onClick={() => setCatalogView("all")}>完整图鉴 {allCards.length}</button></nav><CatalogFilters filters={filters} onChange={setFilters} />
        <div className="rpg-collection card-catalog-grid">{cards.map(card => { const group = groupById.get(card.id), included = group?.included.length ?? 0, copies = group?.copies ?? [], ownedPreview = group?.included[0] ?? copies[0]; return <article key={card.id} className={!canLearnCard(state, card) ? "catalog-card-locked" : ""}><CardTile card={card} owned={ownedPreview} state={state} selected={included > 0} compact onClick={() => setDetailId(card.id)} /><div className="catalog-card-ownership"><span>拥有 {copies.length}</span>{copies.some(copy => copy.upgraded) && <span><ArrowUp size={13} />{copies.filter(copy => copy.upgraded).length}</span>}</div>{copies.length > 0 && canLearnCard(state, card) ? controls(card.id) : <button className="catalog-card-status" onClick={() => setDetailId(card.id)}>{canLearnCard(state, card) ? "查看获取途径" : cardUnlockReason(state, card)}</button>}</article>; })}</div>
        {cards.length === 0 && <p className="hub-empty">没有符合筛选条件的卡牌。</p>}
      </section>
    </div>
    <footer className="deck-save-bar">{error ? <p role="alert" className="form-error">{error}</p> : <span className={draft.length < 15 ? "form-error" : ""}>{draft.length < 15 ? `还需编入${15 - draft.length}张` : changed ? "牌组有未保存的调整" : "牌组已保存"}</span>}<div className="deck-save-actions"><button className="button subtle" disabled={busy} onClick={requestClose}>返回地区</button><button className="button primary" disabled={busy || draft.length < 15 || draft.length > 25} onClick={() => void apply()}>保存牌组<Check size={17} /></button></div></footer>
    {detailId && <CardDetail card={cardFor(state, detailId)} state={state} draft={draft} onToggleCopy={toggle} onClose={() => setDetailId(null)} />}
    {preview && <Dialog open onOpenChange={open => { if (!open && !busy) setPreview(null); }}><DialogContent className="workshop-confirm-dialog preset-preview-dialog"><DialogTitle>{presetNames[preview.style]}预设 · {preview.deck.length} 张</DialogTitle><DialogDescription>预览不会修改牌组。应用只调整当前草稿，保存后生效。</DialogDescription><SavePauseNotice /><DeckSummary state={state} deck={preview.deck} /><ul className="preset-preview-list">{groupCards(state.collection, preview.deck, state).filter(group => group.included.length).map(group => <li key={group.card.id}><span>{group.card.name}</span><strong>{group.included.length} 张</strong>{group.included.some(copy => copy.upgraded) && <small>强化 {group.included.filter(copy => copy.upgraded).length}</small>}</li>)}</ul><div className="workshop-confirm-actions"><button className="button subtle" disabled={busy} onClick={() => setPreview(null)}>继续查看当前牌组</button><button className="button primary" disabled={busy} onClick={() => { setDraft([...preview.deck]); setPreview(null); setError(""); }}>应用到草稿</button></div></DialogContent></Dialog>}
    {exitOpen && <Dialog open onOpenChange={open => { if (!open && !busy) setExitOpen(false); }}><DialogContent className="workshop-confirm-dialog"><DialogTitle>保留本次组牌调整？</DialogTitle><DialogDescription>牌组有未保存的调整。购买、强化和已完成的收藏操作已经单独保存，放弃组牌调整不会撤销它们。</DialogDescription><SavePauseNotice />{error && <p role="alert" className="form-error">{error}</p>}<div className="workshop-confirm-actions"><button className="button primary" disabled={busy || draft.length < 15 || draft.length > 25} onClick={() => void apply()}>保存并退出</button><button className="button subtle" disabled={busy} onClick={onClose}>放弃调整</button><button className="button subtle" disabled={busy} onClick={() => setExitOpen(false)}>继续编辑</button></div></DialogContent></Dialog>}
  </div>;
}
