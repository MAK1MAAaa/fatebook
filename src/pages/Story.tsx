import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Feather,
  MapPin,
  Save,
  ScrollText,
  Settings2,
  Sprout,
  UserRound,
} from "lucide-react";
import { CHAPTERS, ENDINGS, STORY_BY_ID } from "../content";
import { listSaves } from "../game/storage";
import { getAvailableChoices, renderBody } from "../game/engine";
import {
  getChoiceChanges,
  getLastChoiceChanges,
  getRequirementStatuses,
} from "../game/insights";
import { useGame } from "../game/store-context";
import { useReadingPreferences } from "../hooks/use-reading-preferences";
import StatusPanel from "../components/game/StatusPanel";
import WorldMap, { Compass } from "../components/game/WorldMap";
import LifeDirections from "../components/game/LifeDirections";
import LifeJournal from "../components/game/LifeJournal";
import WorldNotebook from "../components/game/WorldNotebook";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "../components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogFooter,
} from "../components/ui/alert-dialog";
import type { Choice } from "../game/types";

const riskLabels = {
  safe: "稳妥",
  caution: "需谨慎",
  danger: "高风险",
  fatal: "致命风险",
};
type Panel = "status" | "directions" | "world" | "reading" | "journal";
const panelTitles: Record<Panel, string> = {
  status: "角色档案",
  directions: "人生方向",
  world: "随身世界手册",
  reading: "阅读设置",
  journal: "人生年表",
};
const panelDescriptions: Record<Panel, string> = {
  status: "查看当前能力、技艺、羁绊与已获得的经历。",
  directions: "查看各个人生方向已具备的条件，以及仍需积累的经历。",
  world: "在故事中查阅世界资料，关闭后继续当前段落。",
  reading: "调整正文大小、字体与布局，设置会记在当前浏览器。",
  journal: "重读已发生的故事与选择，不会改变当前进度。",
};

export default function Story() {
  const { id } = useParams();
  const { envelope, choose, pending, saving } = useGame();
  const state = useMemo(
    () => listSaves(envelope).find((item) => item.id === id),
    [envelope, id],
  );
  const game = state?.state;
  const node = game ? STORY_BY_ID[game.nodeId] : undefined;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [fatalChoice, setFatalChoice] = useState<Choice | null>(null);
  const { preferences, update, remembered } = useReadingPreferences();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<HTMLButtonElement | null>(null);
  const lastChanges = useMemo(
    () => (game ? getLastChoiceChanges(game) : []),
    [game],
  );
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    titleRef.current?.focus({ preventScroll: true });
  }, [id, game?.step]);

  if (!game || !node)
    return (
      <main className="page-shell empty-state">
        <ScrollText size={40} />
        <h1>这一页暂时无法打开</h1>
        <p>{state?.error ?? "记录不存在，或已被删除。"}</p>
        <Link to="/saves" className="button primary">
          返回人生档案
        </Link>
      </main>
    );
  const chapter = CHAPTERS[node.chapter - 1] ?? CHAPTERS[6];
  const ending = ENDINGS.find((item) => item.id === game.endingId);
  const last = game.history.at(-1);
  const choices = getAvailableChoices(node, game);
  const story = renderBody(node, game);
  function openPanel(event: MouseEvent<HTMLButtonElement>, next: Panel) {
    toolRef.current = event.currentTarget;
    setPanel(next);
  }
  function jumpToChoices() {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "instant"
      : "smooth";
    choicesRef.current?.scrollIntoView({ block: "start", behavior });
    choicesRef.current?.focus({ preventScroll: true });
  }
  const tools = [
    { key: "status" as const, label: "角色", Icon: UserRound },
    { key: "directions" as const, label: "方向", Icon: Sprout },
    { key: "world" as const, label: "手册", Icon: BookOpen },
    { key: "reading" as const, label: "阅读", Icon: Settings2 },
  ];

  return (
    <main
      className={`story-layout story-enhanced ${preferences.focus ? "reading-focus" : ""}`}
    >
      <div className="story-overview">
        <Link to="/saves">
          <ArrowLeft size={14} />
          人生档案
        </Link>
        <div
          aria-label={`第${node.chapter}章，共七章`}
          className="chapter-progress"
        >
          {CHAPTERS.map((item) => (
            <i
              key={item.number}
              className={item.number <= node.chapter ? "reached" : ""}
            />
          ))}
          <span>
            {chapter.title} · {node.chapter} / 7
          </span>
        </div>
        <span className="overview-save">
          <Save size={12} />
          {pending ? "等待保存" : saving ? "正在保存" : "进度已保存"}
        </span>
      </div>
      <aside className="story-left">
        <div className="panel-label">人 生 的 七 个 篇 章</div>
        <ol className="chapter-list">
          {CHAPTERS.map((item) => (
            <li
              key={item.number}
              className={`${item.number === node.chapter ? "current" : ""} ${item.number < node.chapter ? "passed" : ""}`}
            >
              <span>
                {item.number < node.chapter ? (
                  <Check size={13} />
                ) : (
                  String(item.number).padStart(2, "0")
                )}
              </span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
            </li>
          ))}
        </ol>
        <div className="mini-map">
          <WorldMap />
          <button onClick={(event) => openPanel(event, "world")}>
            展开世界资料
            <ArrowRight size={13} />
          </button>
        </div>
        <div className="archive-note">
          <Save size={14} />
          <span>
            选择后自动记录
            <br />
            这一生没有回退
          </span>
        </div>
      </aside>
      <section
        className={`story-paper parchment ${game.status === "dead" ? "death-paper" : ""}`}
      >
        <div className="story-toolbar">
          <span>
            <MapPin size={13} />
            {node.location}
          </span>
          <span>
            <Clock size={13} />
            甲龙历 {game.year} · {game.age}岁
          </span>
        </div>
        <div className="reading-toolbar" aria-label="故事工具">
          {tools.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={(event) => openPanel(event, key)}
              aria-haspopup="dialog"
            >
              <Icon size={14} />
              {label === "方向"
                ? "人生方向"
                : label === "手册"
                  ? "世界手册"
                  : label === "阅读"
                    ? "阅读设置"
                    : "角色档案"}
            </button>
          ))}
        </div>
        <div className="story-chapter-eyebrow">
          第{["一", "二", "三", "四", "五", "六", "七"][node.chapter - 1]}章 ·{" "}
          {chapter.title}
          <span>{node.tag === "身份" ? "身份专属" : "原创 IF"}</span>
        </div>
        <h1 ref={titleRef} tabIndex={-1}>
          {node.title}
        </h1>
        <div className="ornament">── ✦ ──</div>
        {last && (
          <section className="choice-receipt" aria-label="上次选择的结果">
            <div className="receipt-heading">
              <Feather size={14} />
              <span>上一次抉择</span>
              <strong>{last.choice}</strong>
            </div>
            <p>{last.feedback}</p>
            {lastChanges.length > 0 && (
              <ul className="change-chips">
                {lastChanges.map((change, index) => (
                  <li className={`change-${change.tone}`} key={index}>
                    {change.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <article
          className={`story-prose reader-${preferences.font}`}
          style={{ fontSize: preferences.size }}
        >
          {story.split(/\n+/).map((paragraph, index) => (
            <p key={`${node.id}-${index}`}>{paragraph}</p>
          ))}
        </article>
        {game.status === "active" ? (
          <div
            className="choice-section"
            id="story-choices"
            ref={choicesRef}
            tabIndex={-1}
          >
            <div className="choice-heading">
              <span>下一笔，你将如何落下？</span>
              <small>第 {game.step + 1} 次抉择</small>
            </div>
            <p className="choice-rule">
              每次选择都会自动保存。先确认条件与风险，再落下这一笔。
            </p>
            {choices.map(({ choice, ok, missing }, index) => {
              const requirements = getRequirementStatuses(
                choice.requirements,
                game,
              );
              const changes = ok ? getChoiceChanges(game, choice.id) : [];
              return (
                <button
                  key={choice.id}
                  className={`story-choice ${!ok ? "locked" : ""} ${choice.risk === "fatal" ? "fatal" : ""}`}
                  disabled={!ok || !!pending || saving}
                  onClick={() =>
                    choice.risk === "fatal"
                      ? setFatalChoice(choice)
                      : choose(game, choice.id)
                  }
                >
                  <span className="choice-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="choice-content">
                    <span className="choice-label">
                      {choice.label}
                      <span className={`risk risk-${choice.risk ?? "safe"}`}>
                        {riskLabels[choice.risk ?? "safe"]}
                      </span>
                    </span>
                    <span className="choice-description">{choice.detail}</span>
                    {requirements.length > 0 && (
                      <span className="requirement-chips">
                        {requirements.map((requirement, position) => (
                          <span
                            key={position}
                            className={
                              requirement.met
                                ? "requirement-met"
                                : "requirement-missing"
                            }
                          >
                            {requirement.met ? (
                              <Check size={12} />
                            ) : (
                              <CircleAlert size={12} />
                            )}
                            {requirement.label}
                          </span>
                        ))}
                      </span>
                    )}
                    {!ok && requirements.length === 0 && (
                      <span className="missing-condition">
                        {missing.join("；")}
                      </span>
                    )}
                    {changes.length > 0 && (
                      <span className="choice-effects">
                        {changes.slice(0, 3).map((change, position) => (
                          <span
                            key={position}
                            className={`change-${change.tone}`}
                          >
                            {change.label}
                          </span>
                        ))}
                        {changes.length > 3 && (
                          <span>另有 {changes.length - 3} 项变化</span>
                        )}
                      </span>
                    )}
                  </span>
                  <ArrowRight size={17} />
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className={`ending-banner ${ending?.kind === "dead" ? "ending-dead" : ""}`}
          >
            <Compass className="ending-compass" />
            <span className="eyebrow">
              {ending?.kind === "dead" ? "THE FINAL PAGE" : "A LIFE REMEMBERED"}
            </span>
            <h2>{ending?.title}</h2>
            <p>{ending?.subtitle}</p>
            <div className="ending-permadeath">
              {ending?.kind === "dead"
                ? "此生已封存。死亡无法回退，故事留在年表之中。"
                : "此生的篇章已收束，记录与结局永久封存。"}
            </div>
            <div className="ending-actions">
              <button
                className="button primary"
                onClick={(event) => openPanel(event, "journal")}
              >
                <ScrollText size={16} />
                重读这一生
              </button>
              <Link to="/create" className="button subtle">
                开启新的人生
                <ArrowRight size={16} />
              </Link>
              <Link to="/endings" className="button subtle">
                查看命运图鉴
              </Link>
            </div>
          </div>
        )}
        <div className="story-footer">
          <span>
            <Check size={13} />
            {pending ? "结果待保存" : saving ? "正在保存" : "已自动保存"} ·{" "}
            {game.step} 次抉择
          </span>
          <button
            className="text-button"
            onClick={(event) => openPanel(event, "journal")}
          >
            <ScrollText size={14} />
            查看人生年表
          </button>
        </div>
      </section>
      <aside className="story-right">
        <StatusPanel state={game} />
        <LifeDirections
          state={game}
          compact
          onExpand={(event) => openPanel(event, "directions")}
        />
      </aside>
      <nav className="story-dock" aria-label="随身故事工具">
        {tools.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={(event) => openPanel(event, key)}
            aria-haspopup="dialog"
            aria-label={panelTitles[key]}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
        {game.status === "active" ? (
          <button
            onClick={jumpToChoices}
            className="dock-primary"
            aria-controls="story-choices"
          >
            <ChevronDown size={19} />
            <span>到选项</span>
          </button>
        ) : (
          <button
            onClick={(event) => openPanel(event, "journal")}
            className="dock-primary"
          >
            <ScrollText size={19} />
            <span>年表</span>
          </button>
        )}
      </nav>
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <SheetContent
          className={`game-notebook-sheet ${panel === "status" ? "notebook-status" : ""}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (toolRef.current?.isConnected)
              toolRef.current.focus({ preventScroll: true });
          }}
        >
          <div className="notebook-header">
            <span>TRAVELER'S NOTEBOOK</span>
            <SheetTitle>{panel ? panelTitles[panel] : "随身手册"}</SheetTitle>
            <SheetDescription className="sr-only">
              {panel ? panelDescriptions[panel] : "查看游戏资料"}
            </SheetDescription>
          </div>
          <div className="notebook-scroll">
            {panel === "status" && <StatusPanel state={game} />}
            {panel === "directions" && <LifeDirections state={game} />}
            {panel === "world" && <WorldNotebook />}
            {panel === "journal" && <LifeJournal key={game.id} state={game} />}
            {panel === "reading" && (
              <div className="reading-settings">
                <p className="notebook-intro">
                  找到适合自己的阅读节奏。调整立即生效。
                </p>
                <fieldset>
                  <legend>正文字号</legend>
                  <div className="reader-options">
                    {([17, 19, 21] as const).map((size) => (
                      <button
                        key={size}
                        aria-pressed={preferences.size === size}
                        onClick={() => update({ size })}
                      >
                        {size === 17 ? "标准" : size === 19 ? "大字" : "特大"}
                        <small>{size}px</small>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>正文字体</legend>
                  <div className="reader-options">
                    <button
                      aria-pressed={preferences.font === "serif"}
                      onClick={() => update({ font: "serif" })}
                    >
                      书卷宋体
                    </button>
                    <button
                      aria-pressed={preferences.font === "sans"}
                      onClick={() => update({ font: "sans" })}
                    >
                      清晰黑体
                    </button>
                  </div>
                </fieldset>
                <label className="focus-setting">
                  <span>
                    <strong>专注阅读</strong>
                    <small>在宽屏中收起两侧资料栏，专心阅读正文。</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.focus}
                    onChange={(event) =>
                      update({ focus: event.target.checked })
                    }
                  />
                </label>
                <div
                  className={`reader-sample reader-${preferences.font}`}
                  style={{ fontSize: preferences.size }}
                >
                  一封旧信，一句承诺。你曾经作出的微小选择，正在远方生根。
                </div>
                <p className="reading-storage-note">
                  {remembered
                    ? "阅读偏好已记在当前浏览器。"
                    : "当前无法记住设置，本次阅读仍会应用。"}
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={
          !!fatalChoice &&
          choices.some((item) => item.choice.id === fatalChoice.id)
        }
        onOpenChange={(open) => {
          if (!open) setFatalChoice(null);
        }}
      >
        <AlertDialogContent className="fatal-confirm-dialog">
          <CircleAlert size={34} />
          <AlertDialogTitle>此举可能终结这一生</AlertDialogTitle>
          <AlertDialogDescription>{fatalChoice?.detail}</AlertDialogDescription>
          <strong>永久死亡：结果结算后不能回退。</strong>
          <AlertDialogFooter>
            <AlertDialogCancel>重新考虑</AlertDialogCancel>
            <AlertDialogAction
              className="delete-confirm"
              disabled={!!pending || saving}
              onClick={() => {
                if (fatalChoice) choose(game, fatalChoice.id);
                setFatalChoice(null);
              }}
            >
              承担后果
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
