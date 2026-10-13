import { useState } from "react";
import {
  LockKeyhole,
  Feather,
  Skull,
  Sparkles,
  Shield,
  BookOpen,
  Home,
  Compass,
  Sprout,
  Landmark,
  FlaskConical,
} from "lucide-react";
import { ENDINGS } from "../content";
import { useGame } from "../game/store-context";
import { useRpg } from "../rpg/context";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../components/ui/dialog";
import "./journey-pages.css";
const hints: Record<string,string> = {
  'end-family':'共同住所与家庭关系修复。',
  'end-dragon':'知情盟约与联盟取胜。',
  'end-teacher':'课程、独立毕业者，至少一种初级魔术。',
  'end-sword':'师承考验、后继者训练，至少一种初级剑术。',
  'end-research':'完成原型并独立验证。',
  'end-rebuild':'居民安置、重建资金与商道。',
  'end-politics':'继承交接、和平条款与平民保护。',
  'end-traveler':'旅行记录与商道联系。',
  'end-retired':'完成七章后始终可选。',
  'end-defiant':'阴谋证据、后继者保护、盟约与联盟取胜。',
};
const icons = [
  Home,
  Shield,
  BookOpen,
  Shield,
  FlaskConical,
  Sprout,
  Landmark,
  Compass,
  Feather,
  Sparkles,
];
export default function Endings() {
  const { envelope: legacyEnvelope } = useGame();
  const { envelope } = useRpg();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ENDINGS.find(ending => ending.id === selectedId);
  const [filter, setFilter] = useState<"all" | "alive" | "dead">("all");
  const unlocked = [...new Set([...envelope.unlocked,...legacyEnvelope.unlocked])].filter((id) =>
    ENDINGS.some((ending) => ending.id === id),
  );
  return (
    <main className="page-shell endings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">命运图鉴</span>
          <h1>十八种命运</h1>
          <p>选择一枚印记，查看结局或解锁线索。</p>
        </div>
        <div className="ending-count">
          <strong>{unlocked.length}</strong>
          <span>
            / 18
            <br />
            已解锁终局
          </span>
        </div>
      </div>
      <div className="tabs-row" role="group" aria-label="筛选结局">
        {(
          [
            ["all", "全部命运"],
            ["alive", "人生收束"],
            ["dead", "提前死亡"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ending-grid">
        {ENDINGS.filter((e) => filter === "all" || e.kind === filter).map(
          (ending) => {
            const known = unlocked.includes(ending.id);
            const index = ENDINGS.findIndex((e) => e.id === ending.id);
            const Icon = ending.kind === "dead" ? Skull : icons[index % 10];
            return (
              <button
                type="button"
                onClick={() => setSelectedId(ending.id)}
                aria-label={`${ending.title}，${known ? "已解锁，查看结局" : "未解锁，查看线索"}`}
                key={ending.id}
                className={`ending-card ${known ? "unlocked" : "unseen"} ${ending.kind === "dead" ? "dead-card" : ""}`}
              >
                <div className="ending-card-top">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {known ? (
                    <span>
                      <Sparkles size={12} />
                      已记录
                    </span>
                  ) : (
                    <LockKeyhole size={15} />
                  )}
                </div>
                <Icon size={31} />
                <h2>{ending.title}</h2>
                <p className="ending-subtitle">{ending.subtitle}</p>
                <span className="ending-type">
                  {ending.kind === "dead" ? "死亡封存" : "人生收束"} · 原创 IF
                </span>
              </button>
            );
          },
        )}
      </div>
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selected && <DialogContent className={`ending-detail ${selected.kind === "dead" ? "ending-detail-dead" : ""}`}>
          <span className="badge">{selected.kind === "dead" ? "死亡封存" : "人生收束"} · 原创 IF</span>
          <DialogTitle>{selected.title}</DialogTitle>
          <DialogDescription>{selected.subtitle}</DialogDescription>
          {unlocked.includes(selected.id) ? <p>{selected.description}</p> : <><h3>解锁线索</h3><p>{hints[selected.id] ?? `${selected.condition}；主动选择并二次确认。`}</p></>}
        </DialogContent>}
      </Dialog>
    </main>
  );
}
