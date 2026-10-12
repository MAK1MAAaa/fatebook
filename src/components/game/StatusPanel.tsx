import { STAT_KEYS, type GameState } from "../../game/types";
import { STAT_LABELS, SKILL_LABELS, RACE_LABELS } from "../../game/characters";
import { Shield, Coins, Package, Heart, Sparkles } from "lucide-react";
import { FLAG_LABELS, RELATION_LABELS } from "../../game/flag-labels";
const ranks = [
  "未习得",
  "初级",
  "中级",
  "上级",
  "圣级",
  "王级",
  "帝级",
  "神级",
];
export default function StatusPanel({ state }: { state: GameState }) {
  return (
    <div className="status-content">
      <div className="panel-label">此 生 档 案</div>
      <div className={`character-sigil sigil-${state.character.actor}`}>
        <Sparkles size={28} />
      </div>
      <h3>{state.character.name}</h3>
      <p className="status-sub">
        {state.character.actor === "sylphie"
          ? "混血血统"
          : RACE_LABELS[state.character.race]}{" "}
        · {state.age}岁
      </p>
      <div className="stats-list">
        {STAT_KEYS.map((key) => (
          <div className="stat-row" key={key}>
            <span>{STAT_LABELS[key]}</span>
            <div
              className="stat-track"
              role="progressbar"
              aria-label={STAT_LABELS[key]}
              aria-valuenow={state.stats[key]}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i
                style={{
                  width: `${state.stats[key]}%`,
                }}
              />
            </div>
            <b>{state.stats[key]}</b>
          </div>
        ))}
      </div>
      <p className="stats-caption">成长上限 100 · 技艺另行习得</p>
      <div className="resource-grid">
        <span>
          <Coins size={14} />
          旅费<b>{state.money}</b>
        </span>
        <span>
          <Package size={14} />
          补给<b>{state.supplies}</b>
        </span>
        <span>
          <Shield size={14} />
          公会
          <b>
            {state.flags.includes("guildRegistered")
              ? ["F", "E", "D", "C", "B", "A", "S"][state.guild]
              : "未登记"}
          </b>
        </span>
        <span>
          <Heart size={14} />
          伤势
          <b>{state.injury === 0 ? "无" : state.injury < 3 ? "轻" : "重"}</b>
        </span>
      </div>
      <h4>已习得的技艺</h4>
      <div className="skill-list">
        {Object.entries(state.skills)
          .filter(([, rank]) => rank > 0)
          .map(([key, rank]) => (
            <span key={key}>
              {SKILL_LABELS[key as keyof typeof SKILL_LABELS]}
              <b>{ranks[rank]}</b>
            </span>
          ))}
        {Object.values(state.skills).every((rank) => rank === 0) && (
          <p className="muted small">尚在探索自己的天赋。</p>
        )}
      </div>
      <h4>先天特征</h4>
      <div className="trait-list">
        {state.character.traits.map((trait) => (
          <span key={trait}>{trait}</span>
        ))}
      </div>
      {Object.keys(state.relations).length > 0 && (
        <>
          <h4>羁绊</h4>
          <div className="skill-list">
            {Object.entries(state.relations).map(([name, value]) => (
              <span key={name}>
                {RELATION_LABELS[name] ??
                  (/^[A-Za-z]/.test(name) ? "相关人物" : name)}
                <b>{value}</b>
              </span>
            ))}
          </div>
        </>
      )}
      {state.flags.length > 0 && (
        <details className="experience-register">
          <summary>已经留下的经历 · {state.flags.length}</summary>
          <div className="trait-list">
            {state.flags.map((flag) => (
              <span key={flag}>{FLAG_LABELS[flag] ?? "相关经历"}</span>
            ))}
          </div>
        </details>
      )}
      <p className="panel-footnote">
        属性为游戏化数值。技艺阶位与公会履历独立。
      </p>
    </div>
  );
}
