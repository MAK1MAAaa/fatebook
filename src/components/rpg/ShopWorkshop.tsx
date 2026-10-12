import { useState } from "react";
import { Check, ChevronDown, Layers, Shield } from "lucide-react";
import { CARDS, CARD_BY_ID, EQUIPMENT } from "../../rpg/cards";
import { useRpg } from "../../rpg/context";
import { canLearnCard, shopPrice } from "../../rpg/engine";
import { EMPTY_FILTERS, cardUnlockReason, matchesCard } from "../../rpg/catalog";
import type { CardDefinition, Equipment, RpgState } from "../../rpg/types";
import CardTile from "./CardTile";
import CardDetail from "./CardDetail";
import CatalogFilters from "./CatalogFilters";

export default function ShopWorkshop({ state }: { state: RpgState }) {
  const { dispatch, saving, pending } = useRpg();
  const busy = saving || !!pending;
  const [view, setView] = useState<"equipment" | "cards">("equipment");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const cards = CARDS.filter(card => matchesCard(state, card, filters)).sort((a, b) => Number(canLearnCard(state, b)) - Number(canLearnCard(state, a)) || a.cost - b.cost || a.id.localeCompare(b.id));
  const equipment = EQUIPMENT.filter(item => item.chapter <= state.chapter);
  const owned = equipment.filter(item => state.ownedEquipment.includes(item.id));
  function renderEquipment(item: Equipment) {
    const equipped = state.equipment[item.slot] === item.id;
    const collected = state.ownedEquipment.includes(item.id);
    const price = shopPrice(state, item.price);
    return <article key={item.id}><small>{item.slot === "weapon" ? "武器" : item.slot === "armor" ? "护甲" : "饰物"}</small><strong>{item.name}</strong><p>{item.description}</p><button disabled={busy || (!collected && state.money < price) || equipped} onClick={() => void dispatch(state, { type: collected ? "equip" : "buyEquipment", equipmentId: item.id })}>{equipped ? <><Check size={14} />已佩戴</> : collected ? "重新佩戴" : `购买 · ${price}`}</button></article>;
  }
  function renderCard(card: CardDefinition) {
    const count = state.collection.filter(copy => copy.cardId === card.id).length;
    const available = canLearnCard(state, card);
    const price = shopPrice(state, 18 + card.rank * 8);
    return <article key={card.id} className={!available ? "catalog-card-locked" : ""}><CardTile card={card} state={state} compact onClick={() => setDetailId(card.id)} /><div className="catalog-card-ownership"><span>拥有 {count} / 3</span></div>{available ? <button disabled={busy || count >= 3 || state.money < price} onClick={() => void dispatch(state, { type: "buyCard", cardId: card.id })}>{count >= 3 ? "收藏已满" : state.money < price ? `旅费不足 · ${price}` : `购买 · ${price}`}</button> : <button className="catalog-card-status" onClick={() => setDetailId(card.id)}>{cardUnlockReason(state, card)}</button>}</article>;
  }
  return <>
    <nav className="workshop-view-nav" aria-label="商店分类"><button aria-pressed={view === "equipment"} onClick={() => setView("equipment")}><Shield size={16} />装备</button><button aria-pressed={view === "cards"} onClick={() => setView("cards")}><Layers size={16} />卡牌</button></nav>
    <details className="workshop-fold"><summary><strong>价格与购买说明</strong><ChevronDown size={16} /></summary><p>交涉资质优惠最多10%；第三章起魔神语额外优惠15%。价格已包含优惠。购买装备后自动佩戴，新牌需在组牌工坊编入牌组。</p></details>
    {view === "equipment" ? <>
      <div className="gear-grid">{equipment.filter(item => !state.ownedEquipment.includes(item.id)).map(renderEquipment)}</div>
      {owned.length > 0 && <details className="workshop-fold"><summary><Check size={16} /><strong>已购装备</strong><span>{owned.length} 件</span><ChevronDown size={16} /></summary><div className="gear-grid">{owned.map(renderEquipment)}</div></details>}
    </> : <>
      <CatalogFilters filters={filters} onChange={setFilters} />
      <div className="rpg-collection card-catalog-grid shop-card-catalog">{cards.map(renderCard)}</div>
      {cards.length === 0 && <p className="hub-empty">没有符合筛选条件的卡牌。</p>}
    </>}
    {detailId && <CardDetail card={CARD_BY_ID[detailId]} state={state} onClose={() => setDetailId(null)} />}
  </>;
}
