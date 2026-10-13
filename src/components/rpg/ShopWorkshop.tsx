import { useState } from "react";
import { Check, ChevronDown, Layers, Shield } from "lucide-react";
import { cardFor, cardsFor, equipmentFor, equipmentListFor } from "../../rpg/rulesets";
import { useRpg } from "../../rpg/context";
import { canLearnCard, shopPrice } from "../../rpg/engine";
import { EMPTY_FILTERS, cardUnlockReason, matchesCard } from "../../rpg/catalog";
import type { CardDefinition, Equipment, RpgState } from "../../rpg/types";
import CardTile from "./CardTile";
import CardDetail from "./CardDetail";
import CatalogFilters from "./CatalogFilters";

const gearLabels = { damage: "攻击牌伤害", block: "防御牌格挡", health: "最大生命", draw: "开局抽牌" };
const gearKeys = Object.keys(gearLabels) as (keyof Equipment["effect"])[];
function gearEffect(item: Equipment): string {
  return gearKeys.filter(key => item.effect[key]).map(key => `${gearLabels[key]} +${item.effect[key]}`).join(" · ");
}
function sameEffect(a: Equipment, b: Equipment): boolean {
  return a.slot === b.slot && gearKeys.every(key => (a.effect[key] ?? 0) === (b.effect[key] ?? 0));
}
function replacementEffect(item: Equipment, current?: Equipment): string {
  const changes = gearKeys.map(key => ({ key, delta: (item.effect[key] ?? 0) - (current?.effect[key] ?? 0) })).filter(change => change.delta);
  return changes.length ? changes.map(({ key, delta }) => `${gearLabels[key]} ${delta > 0 ? "+" : ""}${delta}`).join(" · ") : "战斗效果无变化";
}

export default function ShopWorkshop({ state }: { state: RpgState }) {
  const { dispatch, saving, pending } = useRpg();
  const busy = saving || !!pending;
  const [view, setView] = useState<"equipment" | "cards">("equipment");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const cards = cardsFor(state).filter(card => matchesCard(state, card, filters)).sort((a, b) => Number(canLearnCard(state, b)) - Number(canLearnCard(state, a)) || a.cost - b.cost || a.id.localeCompare(b.id));
  const allEquipment = equipmentListFor(state);
  const equipment = allEquipment.filter(item => item.chapter <= state.chapter);
  // Equal effects and prices share one shelf entry. The price remains part of
  // the identity so legacy saves keep their original chapter-based prices.
  const gearGroups = equipment.reduce<Equipment[][]>((groups, item) => {
    const group = groups.find(items => sameEffect(items[0], item) && items[0].price === item.price);
    if (group) group.push(item);
    else groups.push([item]);
    return groups;
  }, []);
  function renderEquipment(items: Equipment[]) {
    const key = items[0].id;
    const item = items.find(candidate => candidate.id === variants[key]) ?? items.find(candidate => candidate.id === state.equipment[candidate.slot]) ?? items.find(candidate => state.ownedEquipment.includes(candidate.id)) ?? items[items.length - 1];
    const equipped = state.equipment[item.slot] === item.id;
    const collected = state.ownedEquipment.includes(item.id);
    const currentId = state.equipment[item.slot], current = currentId ? equipmentFor(state, currentId) : undefined;
    const equivalent = !!current && sameEffect(item, current);
    const styles = allEquipment.filter(candidate => sameEffect(candidate, item) && candidate.price === item.price);
    const price = shopPrice(state, item.price);
    return <article key={key} className="shop-equipment-item"><small>{item.slot === "weapon" ? "武器" : item.slot === "armor" ? "护甲" : "饰品"}{styles.length > 1 && ` · 同效款式 ${items.length} / ${styles.length}`}</small><strong>{item.name}</strong><p className="shop-gear-effect">{gearEffect(item)}</p>
      {styles.length > 1 && <label className="shop-gear-variant"><span>款式</span><select aria-label="选择同效饰品款式" value={item.id} disabled={busy} onChange={event => setVariants(previous => ({ ...previous, [key]: event.target.value }))}>{styles.map(style => <option key={style.id} value={style.id} disabled={style.chapter > state.chapter}>{style.name}{style.chapter > state.chapter ? ` · 第${style.chapter}章出售` : state.ownedEquipment.includes(style.id) ? " · 已拥有" : ""}</option>)}</select></label>}
      <p className="shop-gear-current">当前：{current ? current.name : "未装备"}</p><p className="shop-gear-delta">{current ? "替换净变化" : "装备净变化"}：{replacementEffect(item, current)}</p>
      {equivalent && <p className="shop-equivalent-note">已装备同效{item.slot === "charm" ? "饰品" : "装备"}，更换只改变款式。</p>}
      <small>基础价格 {item.price} · 优惠后 {price}</small><button disabled={busy || (!collected && state.money < price) || equipped} onClick={() => void dispatch(state, { type: collected ? "equip" : "buyEquipment", equipmentId: item.id })}>{equipped ? <><Check size={14} />已佩戴</> : collected ? "重新佩戴" : state.money < price ? `旅费不足 · ${price}` : `购买并佩戴 · ${price}`}</button></article>;
  }
  function renderCard(card: CardDefinition) {
    const count = state.collection.filter(copy => copy.cardId === card.id).length;
    const available = canLearnCard(state, card);
    const price = shopPrice(state, 18 + card.rank * 8);
    return <article key={card.id} className={!available ? "catalog-card-locked" : ""}><CardTile card={card} state={state} compact onClick={() => setDetailId(card.id)} /><div className="catalog-card-ownership"><span>拥有 {count} / 3</span></div>{available ? <button disabled={busy || count >= 3 || state.money < price} onClick={() => void dispatch(state, { type: "buyCard", cardId: card.id })}>{count >= 3 ? "收藏已满" : state.money < price ? `旅费不足 · ${price}` : `购买 · ${price}`}</button> : <button className="catalog-card-status" onClick={() => setDetailId(card.id)}>{cardUnlockReason(state, card)}</button>}</article>;
  }
  return <div className="shop-workshop">
    <nav className="workshop-view-nav" aria-label="商店分类"><button aria-pressed={view === "equipment"} onClick={() => setView("equipment")}><Shield size={16} />装备</button><button aria-pressed={view === "cards"} onClick={() => setView("cards")}><Layers size={16} />卡牌</button></nav>
    <p className="shop-purchase-note">购买装备后自动佩戴；新卡需在工坊编入牌组。购买会立即保存。</p>
    <details className="workshop-fold"><summary><strong>价格与购买说明</strong><ChevronDown size={16} /></summary><p>交涉资质优惠最多10%；第三章起魔神语额外优惠15%。价格已包含优惠。</p></details>
    {view === "equipment" ? <div className="gear-grid">{gearGroups.map(renderEquipment)}</div> : <>
      <CatalogFilters filters={filters} onChange={setFilters} />
      <div className="rpg-collection card-catalog-grid shop-card-catalog">{cards.map(renderCard)}</div>
      {cards.length === 0 && <p className="hub-empty">没有符合筛选条件的卡牌。</p>}
    </>}
    {detailId && <CardDetail card={cardFor(state, detailId)} state={state} onClose={() => setDetailId(null)} />}
  </div>;
}
