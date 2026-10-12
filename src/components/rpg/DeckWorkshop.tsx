import { useState } from "react";
import { Check, ChevronDown, Minus, Plus, Layers, BookOpen, ArrowUp } from "lucide-react";
import { CARDS, CARD_BY_ID } from "../../rpg/cards";
import { useRpg } from "../../rpg/context";
import { canLearnCard, safeDeckPreset, validateDeck } from "../../rpg/engine";
import { EMPTY_FILTERS, cardUnlockReason, changeCardQuantity, deckStatistics, groupCards, matchesCard } from "../../rpg/catalog";
import type { RpgState } from "../../rpg/types";
import CardTile from "./CardTile";
import CardDetail from "./CardDetail";
import CatalogFilters from "./CatalogFilters";

export default function DeckWorkshop({ state, onClose }: { state: RpgState; onClose: () => void }) {
  const { dispatch, saving, pending } = useRpg();
  const busy = saving || !!pending;
  const [draft, setDraft] = useState([...state.deck]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [catalogView, setCatalogView] = useState<"owned" | "all">("owned");
  const [mobileView, setMobileView] = useState<"deck" | "catalog">("catalog");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const groups = groupCards(state.collection, draft), groupById = new Map(groups.map(group => [group.card.id, group]));
  const deckGroups = groups.filter(group => group.included.length > 0), statistics = deckStatistics(state, draft);
  const cards = (catalogView === "owned" ? groups.map(group => group.card) : CARDS).filter(card => matchesCard(state, card, filters)).sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const changed = draft.length !== state.deck.length || draft.some(uid => !state.deck.includes(uid));
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
    if (!included && (!canLearnCard(state, CARD_BY_ID[copy.cardId]) || draft.length >= 25 || state.collection.filter(item => item.cardId === copy.cardId && draft.includes(item.uid)).length >= 3)) { setError("已达数量上限，或尚未学会该牌。"); return; }
    setDraft(current => included ? current.filter(id => id !== uid) : [...current, uid]);
    setError("");
  }
  async function apply() {
    try {
      validateDeck(state, draft);
      if (await dispatch(state, { type: "setDeck", deck: draft })) onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "牌组无效");
    }
  }
  function controls(cardId: string) {
    const group = groupById.get(cardId), count = group?.included.length ?? 0, max = Math.min(3, group?.copies.length ?? 0);
    return <div className="card-quantity"><button aria-label={`从牌组取下一张${CARD_BY_ID[cardId].name}`} disabled={busy || count === 0} onClick={() => quantity(cardId, -1)}><Minus size={17} /></button><span aria-label={`编入${count}张`}>{count}</span><button aria-label={`向牌组加入一张${CARD_BY_ID[cardId].name}`} disabled={busy || count >= max || draft.length >= 25 || !canLearnCard(state, CARD_BY_ID[cardId])} onClick={() => quantity(cardId, 1)}><Plus size={17} /></button></div>;
  }
  return <div className="deck-builder">
    <div className="deck-builder-heading"><strong>牌组 {draft.length} / 25</strong><span>15–25张 · 同牌最多3张</span></div>
    <nav className="deck-mobile-tabs" aria-label="组牌视图"><button aria-pressed={mobileView === "deck"} onClick={() => setMobileView("deck")}><Layers size={17} />当前牌组 {draft.length}</button><button aria-pressed={mobileView === "catalog"} onClick={() => setMobileView("catalog")}><BookOpen size={17} />收藏与图鉴</button></nav>
    <div className="deck-builder-layout">
      <section className={`deck-builder-list ${mobileView === "deck" ? "mobile-active" : ""}`} aria-label="当前牌组"><h3>当前牌组</h3><div className="deck-rows">{deckGroups.map(group => <article key={group.card.id}><button className="deck-row-preview" onClick={() => setDetailId(group.card.id)}><span className="deck-row-cost" style={{ background: group.card.color }}>{group.card.cost}</span><span><strong>{group.card.name}</strong>{group.included.some(copy => copy.upgraded) && <span className="deck-row-upgrades"><ArrowUp size={13} />强化 {group.included.filter(copy => copy.upgraded).length}</span>}</span></button>{controls(group.card.id)}</article>)}</div>{deckGroups.length === 0 && <p className="hub-empty">从收藏中加入卡牌。</p>}
        <details className="deck-statistics"><summary>费用分布与构筑预设<ChevronDown size={16} /></summary><div className="deck-cost-curve">{statistics.costs.map((count, cost) => <div key={cost}><span>{count}</span><i style={{ height: `${Math.max(3, count * 4)}px` }} /><strong>{cost}费</strong></div>)}</div><div className="deck-stat-chips"><span>进攻 {statistics.attack}</span><span>防护/治疗 {statistics.defense}</span><span>抽牌 {statistics.draw}</span><span>强化 {statistics.upgraded}</span></div><div className="rpg-preset-row">{(["balanced", "attack", "guard", "magic"] as const).map((style, index) => <button key={style} disabled={busy} onClick={() => { setDraft(safeDeckPreset(state, style)); setError(""); }}>{["均衡", "进攻", "防守", "魔术"][index]}</button>)}</div></details>
      </section>
      <section className={`deck-builder-catalog ${mobileView === "catalog" ? "mobile-active" : ""}`} aria-label="卡牌收藏与图鉴"><nav className="card-catalog-tabs" aria-label="卡牌范围"><button aria-pressed={catalogView === "owned"} onClick={() => setCatalogView("owned")}>我的收藏 {groups.length}</button><button aria-pressed={catalogView === "all"} onClick={() => setCatalogView("all")}>完整图鉴 {CARDS.length}</button></nav><CatalogFilters filters={filters} onChange={setFilters} />
        <div className="rpg-collection card-catalog-grid">{cards.map(card => { const group = groupById.get(card.id), included = group?.included.length ?? 0, copies = group?.copies ?? [], preview = group?.included[0] ?? copies[0]; return <article key={card.id} className={!canLearnCard(state, card) ? "catalog-card-locked" : ""}><CardTile card={card} owned={preview} state={state} selected={included > 0} compact onClick={() => setDetailId(card.id)} /><div className="catalog-card-ownership"><span>拥有 {copies.length}</span>{copies.some(copy => copy.upgraded) && <span><ArrowUp size={13} />{copies.filter(copy => copy.upgraded).length}</span>}</div>{copies.length > 0 && canLearnCard(state, card) ? controls(card.id) : <button className="catalog-card-status" onClick={() => setDetailId(card.id)}>{canLearnCard(state, card) ? "查看获取途径" : cardUnlockReason(state, card)}</button>}</article>; })}</div>
        {cards.length === 0 && <p className="hub-empty">没有符合筛选条件的卡牌。</p>}
      </section>
    </div>
    <footer className="deck-save-bar">{error ? <p role="alert" className="form-error">{error}</p> : <span className={draft.length < 15 ? "form-error" : ""}>{draft.length < 15 ? `还需编入${15 - draft.length}张` : changed ? "牌组有未保存的调整" : "牌组已保存"}</span>}<button className="button primary" disabled={busy || draft.length < 15 || draft.length > 25} onClick={() => void apply()}>保存牌组<Check size={17} /></button></footer>
    {detailId && <CardDetail card={CARD_BY_ID[detailId]} state={state} draft={draft} onToggleCopy={toggle} onClose={() => setDetailId(null)} />}
  </div>;
}
