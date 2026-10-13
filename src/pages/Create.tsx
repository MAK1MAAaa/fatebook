import { useState } from "react";
import {
  ArrowRight,
  Dices,
  Minus,
  Plus,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import {
  PRESETS,
  STAT_LABELS,
  RACE_LABELS,
  ORIGIN_LABELS,
  createCharacter,
  randomCharacter,
} from "../game/characters";
import {
  STAT_KEYS,
  type ActorId,
  type Race,
  type Origin,
  type Stats,
} from "../game/types";
import { useRpg as useGame } from "../rpg/context";
import {
  ALLOCATION_TEMPLATES,
  createTemplateAllocation,
  emptyAllocation,
  parseAllocationBudget,
  resizeAllocation,
  type AllocationTemplateId,
} from "../game/allocation";
import { Portrait } from "../components/rpg/Artwork";
import { characterPortraitKey } from "../rpg/portraits";
import "./journey-pages.css";
export default function Create() {
  const { start, pending, saving } = useGame();
  const [actor, setActor] = useState<ActorId>("custom");
  const [name, setName] = useState("旅人");
  const [race, setRace] = useState<Race>("human");
  const [origin, setOrigin] = useState<Origin>("village");
  const [budget, setBudget] = useState(20);
  const [budgetInput, setBudgetInput] = useState("20");
  const [allocation, setAllocation] = useState<Stats>(() =>
    createTemplateAllocation("custom", 20),
  );
  const [randomized, setRandomized] = useState(false);
  const [formError, setFormError] = useState("");
  const [consent, setConsent] = useState(false);
  const spent = Object.values(allocation).reduce((a, b) => a + b, 0);
  const preset = PRESETS[actor];
  const parsedBudget = parseAllocationBudget(budgetInput);
  const budgetError = parsedBudget === null;
  const budgetEdited = parsedBudget !== null && parsedBudget !== budget;
  const busy = saving || !!pending;
  const templates = ALLOCATION_TEMPLATES.map((template) => ({
    ...template,
    allocation: createTemplateAllocation(actor, budget, template.id),
  }));
  const activeTemplate = templates.find((template) =>
    STAT_KEYS.every((key) => allocation[key] === template.allocation[key]),
  )?.id;
  function select(next: ActorId) {
    if (next === actor) return;
    setActor(next);
    setAllocation(createTemplateAllocation(next, budget));
    setRandomized(false);
    setFormError("");
  }
  function updateBudget(next: number, input = String(next)) {
    setBudgetInput(input);
    if (next === budget) return;
    setBudget(next);
    setAllocation((current) => resizeAllocation(current, next));
    setRandomized(false);
    setFormError("");
  }
  function applyTemplate(template: AllocationTemplateId) {
    const nextBudget = parsedBudget ?? budget;
    setBudget(nextBudget);
    setBudgetInput(String(nextBudget));
    setAllocation(createTemplateAllocation(actor, nextBudget, template));
    setRandomized(false);
    setFormError("");
  }
  function changeAllocation(key: keyof Stats, delta: number) {
    setAllocation((current) => {
      const used = STAT_KEYS.reduce((sum, stat) => sum + current[stat], 0);
      const next = current[key] + delta;
      if (next < 0 || preset.stats[key] + next > 20 || used + delta > budget) {
        return current;
      }
      return { ...current, [key]: next };
    });
    setRandomized(false);
    setFormError("");
  }
  function randomize() {
    const config = randomCharacter(budget);
    setActor(config.actor);
    setName(config.name);
    setRace(config.race);
    setOrigin(config.origin);
    setAllocation(
      Object.fromEntries(
        STAT_KEYS.map((k) => [
          k,
          config.stats[k] - PRESETS[config.actor].stats[k],
        ]),
      ) as Stats,
    );
    setRandomized(true);
    setFormError("");
  }
  function submit() {
    if (saving || pending) return;
    try {
      if (budgetError) throw new Error("额外属性点必须是 0–60 的整数。");
      if (!consent) throw new Error("请先确认战败重试、不可逆剧情与剧透说明。");
      const config = createCharacter(actor, {
        name,
        race,
        origin,
        budget,
        allocation,
      });
      void start({ ...config, randomized });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "请检查角色配置");
    }
  }
  return (
    <main className="page-shell create-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">新的人生</span>
          <h1>选择你的起点</h1>
        </div>
        <button
          className="button subtle"
          onClick={randomize}
          disabled={saving || !!pending}
        >
          <Dices size={17} />
          随机一个人生
        </button>
      </div>
      <div className="create-layout">
        <section className="creation-main">
          <div className="section-title">
            <span>01</span><h2>选择角色</h2>
          </div>
          <div className="actor-grid illustrated-actors" aria-label="角色选择">
            {(Object.keys(PRESETS) as ActorId[]).map((id) => {
              return (
                <button
                  key={id}
                  className={`actor-card ${actor === id ? "selected" : ""}`}
                  onClick={() => select(id)}
                  aria-pressed={actor === id}
                  disabled={saving || !!pending}
                >
                  <Portrait
                    name={id === "custom" ? "原创旅人" : PRESETS[id].name}
                    portraitKey={characterPortraitKey({ actor: id, race: id === "custom" ? race : PRESETS[id].race }, 16)}
                    className="creation-actor-art"
                    sizes="(max-width: 600px) 130px, 170px"
                    eager
                  />
                  <strong>
                    {id === "custom"
                      ? "原创旅人"
                      : PRESETS[id].name.split("·")[0]}
                  </strong>
                  {actor === id && <span className="selected-dot" />}
                </button>
              );
            })}
          </div>
          <div className="identity-description">
            <span className="badge">
              {actor === "custom" ? "原创身份" : "原作人物 · IF 分支"}
            </span>
          </div>
          {actor === "custom" ? (
            <div className="form-grid">
              <label>
                你的名字
                <input
                  maxLength={24}
                  disabled={busy}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setRandomized(false);
                  }}
                  placeholder="为自己取一个名字"
                />
              </label>
              <label>
                出生种族
                <select
                  value={race}
                  disabled={busy}
                  onChange={(e) => {
                    setRace(e.target.value as Race);
                    setRandomized(false);
                  }}
                >
                  {Object.entries(RACE_LABELS).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                家庭出身
                <select
                  value={origin}
                  disabled={busy}
                  onChange={(e) => {
                    setOrigin(e.target.value as Origin);
                    setRandomized(false);
                  }}
                >
                  {Object.entries(ORIGIN_LABELS).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="fixed-identity">
              <strong>{preset.name}</strong>
              <span>
                {actor === "sylphie" ? "混血血统" : RACE_LABELS[preset.race]}
              </span>
              <p className="identity-limit">出生年代、种族与家庭身份固定；加点不会改变身份。</p>
              {actor === "roxy" && <p className="identity-limit">先天限制：无法使用米格路德族念话。</p>}
              <details className="creation-fold identity-fold">
                <summary>身份与先天特征<ChevronDown size={15} /></summary>
                <p>{preset.tagline}</p>
                <div className="trait-list">
                {preset.traits.map((t) => (
                  <span key={t}>{t}</span>
                ))}
                </div>
              </details>
            </div>
          )}
          <div className="section-title attribute-heading">
            <span>02</span><h2>天赋配置</h2>
            <button
              className="text-button"
              disabled={spent === 0 || !!pending || saving}
              onClick={() => {
                setAllocation(emptyAllocation());
                setRandomized(false);
                setFormError("");
              }}
            >
              <RotateCcw size={14} />
              归还全部点数
            </button>
          </div>
          <div className="allocation-budget">
            <div className="allocation-budget-heading">
              <label htmlFor="budget">额外属性点预算</label>
              <span aria-live="polite">
                已分配 <b>{spent}</b> / {budget} · 剩余 <b>{budget - spent}</b>
              </span>
            </div>
            <div className="allocation-budget-controls">
              <input
                id="budget"
                type="range"
                min="0"
                max="60"
                value={budget}
                disabled={busy}
                onChange={(e) => updateBudget(Number(e.target.value))}
              />
              <label className="exact-budget" htmlFor="budget-exact">
                <span className="sr-only">精确输入额外属性点预算</span>
                <input
                  id="budget-exact"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="60"
                  step="1"
                  value={budgetInput}
                  disabled={busy}
                  aria-invalid={budgetError}
                  aria-describedby="allocation-budget-message"
                  onChange={(e) => {
                    setBudgetInput(e.target.value);
                    setFormError("");
                  }}
                  onBlur={() => {
                    if (parsedBudget !== null) updateBudget(parsedBudget);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (parsedBudget !== null) updateBudget(parsedBudget);
                    }
                  }}
                />
                <span>点</span>
              </label>
            </div>
            <p
              id="allocation-budget-message"
              className={`allocation-budget-message ${budgetError ? "invalid" : ""}`}
              aria-live="polite"
            >
              {budgetError
                ? "请输入 0–60 的整数。"
                : budgetEdited
                  ? `按 Enter 应用 ${parsedBudget} 点预算。`
                  : ""}
            </p>
          </div>
          <div
            className="allocation-templates"
            role="group"
            aria-label="快捷天赋分配方案"
          >
            {templates.map((template) => {
              const selected = activeTemplate === template.id;
              return (
                <button
                  key={template.id}
                  className={`allocation-template ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  disabled={budgetError || !!pending || saving}
                  title={template.description}
                  onClick={() => applyTemplate(template.id)}
                >
                  <strong>{template.label}</strong>
                </button>
              );
            })}
          </div>
          <p className="allocation-template-description">{templates.find(template => template.id === activeTemplate)?.description ?? "已手动调整，可展开下方属性逐项分配。"}</p>
          <div className="creation-stat-preview creation-inline-stats" aria-label="当前初始六项属性" aria-live="polite">{STAT_KEYS.map(key => <span key={key}>{STAT_LABELS[key]}<strong>{preset.stats[key] + allocation[key]}</strong></span>)}</div>
          <details className="creation-fold manual-allocation">
          <summary>手动调整六项属性<ChevronDown size={15} /></summary>
          <div className="allocation-list">
            {STAT_KEYS.map((key) => (
              <div className="allocation-row" key={key}>
                <div className="allocation-stat-label">
                  <span>{STAT_LABELS[key]}</span>
                  <small>
                    基础 {preset.stats[key]} + {allocation[key]}
                  </small>
                </div>
                <div
                  className="allocation-track"
                  role="progressbar"
                  aria-label={`${STAT_LABELS[key]}初始值`}
                  aria-valuemin={0}
                  aria-valuemax={20}
                  aria-valuenow={preset.stats[key] + allocation[key]}
                >
                  <i
                    style={{
                      width: `${(preset.stats[key] + allocation[key]) * 5}%`,
                    }}
                  />
                </div>
                <div className="stepper">
                  <button
                    aria-label={`减少${STAT_LABELS[key]}`}
                    disabled={
                      allocation[key] === 0 ||
                      budgetError ||
                      saving ||
                      !!pending
                    }
                    onClick={() => changeAllocation(key, -1)}
                  >
                    <Minus size={14} />
                  </button>
                  <strong>{preset.stats[key] + allocation[key]}</strong>
                  <button
                    aria-label={`增加${STAT_LABELS[key]}`}
                    disabled={
                      spent >= budget ||
                      preset.stats[key] + allocation[key] >= 20 ||
                      budgetError ||
                      saving ||
                      !!pending
                    }
                    onClick={() => changeAllocation(key, 1)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          </details>
          <p className="identity-limit">属性只影响资质；无咏唱、斗气与技艺仍需剧情学习。</p>
          <details className="creation-fold">
            <summary>加点说明<ChevronDown size={15} /></summary>
            <p>
            初始单项上限 20。提高预算保留加点，降低预算按现有比例归还多余点数。
            快捷方案只分配属性，技艺仍需在故事中学习。
            </p>
          </details>
        </section>
        <aside className="creation-summary parchment">
          <div className="section-title birth-heading"><span>03</span><h2>出生确认</h2></div>
          <Portrait name={actor === "custom" ? name : preset.name} portraitKey={characterPortraitKey({ actor, race: actor === "custom" ? race : preset.race }, 0)} className="creation-preview-art" sizes="(max-width: 767px) 140px, 200px" />
          <h2>
            {actor === "custom"
              ? name || "未命名的旅人"
              : preset.name.split("·")[0]}
          </h2>
          <p>
            {actor === "custom"
              ? RACE_LABELS[race]
              : actor === "sylphie"
                ? "混血血统"
                : RACE_LABELS[preset.race]}{" "}
            · {ORIGIN_LABELS[actor === "custom" ? origin : preset.origin]}
          </p>
          <p className="creation-birth-year">甲龙历 {preset.birthYear} 年出生</p>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>包含原作剧透。战败可重试，确认剧情死亡后无法回退。</span>
          </label>
          {(budgetError || budgetEdited || spent !== budget) && (
            <p className="creation-start-hint" role="status">
              {budgetError
                ? "请将预算修正为 0–60 的整数。"
                : budgetEdited
                  ? "先应用新的预算，再确认属性分配。"
                  : `还有 ${budget - spent} 点未分配，分配完成后即可开始。`}
            </p>
          )}
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button
            className="button primary full"
            disabled={
              saving ||
              !!pending ||
              budgetError ||
              budgetEdited ||
              spent !== budget ||
              !consent
            }
            onClick={submit}
          >
            {saving ? "正在保存人生…" : "写下第一章"}
            <ArrowRight size={17} />
          </button>
          {randomized && (
            <p className="random-label">随机角色已就绪</p>
          )}
          <p className="summary-foot">存档仅保存在当前浏览器。</p>
        </aside>
      </div>
    </main>
  );
}
