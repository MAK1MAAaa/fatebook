import { Link } from "react-router";
import { ArrowRight, BookOpen, Feather, ScrollText, Compass, ChevronDown } from "lucide-react";
import { useRpg } from "../rpg/context";
import { listRpgSaves } from "../rpg/storage";
import { CHAPTER_INFO } from "../rpg/content";
import { Portrait } from "../components/rpg/Artwork";
import { characterPortraitKey } from "../rpg/portraits";

export default function Home() {
  const { envelope } = useRpg();
  const latest = listRpgSaves(envelope).find(row => row.state?.status === "active")?.state;
  const resumeStatus = latest?.scene === "reward" ? "等待领取战果" : latest?.battle?.result === "lost" ? "战败，可免费重试" : latest?.battle ? `第 ${latest.battle.turn} 回合` : "地区探索";
  return <main className="home-page page-shell">
    <section className="hero">
      <div className="hero-content">
        <span className="eyebrow">无职转生 · 原创 IF 人生</span>
        <h1>这一生，<br />由你<span>出牌。</span></h1>
        <p className="hero-description">组起牌组，迎战对手。<br />在剑与魔法之间，找到自己的归处。</p>
        {latest && <div className="continue-summary"><span>上次的旅途</span><strong>{latest.character.name}</strong><p>第 {latest.chapter} 章 · {CHAPTER_INFO[latest.chapter - 1].title} · {resumeStatus}</p></div>}
        <div className="hero-actions">
          {latest ? <><Link to={`/story/${latest.id}`} className="button primary">继续旅途<ArrowRight size={18} /></Link><Link to="/create" className="button subtle"><Feather size={17} />新的人生</Link></> : <><Link to="/create" className="button primary"><Feather size={18} />开启新的人生<ArrowRight size={18} /></Link><Link to="/world" className="button subtle"><BookOpen size={17} />世界手册</Link></>}
        </div>
        <div className="hero-meta"><span>七个人生章节</span><span>96 张卡牌</span><span>18 种结局</span></div>
      </div>
      <div className="hero-art">
        <div className="hero-orbit" aria-hidden="true"><Compass /></div>
        <Portrait name={latest?.character.name ?? "鲁迪乌斯"} portraitKey={latest ? characterPortraitKey(latest.character, latest.age, latest.year) : characterPortraitKey({ actor: "rudeus", race: "human" }, 19)} className="hero-character" sizes="(max-width: 767px) 260px, 480px" eager />
        <span className="hero-art-caption">每一次选择，都留下回声。</span>
      </div>
    </section>
    <details className="home-introduction surface-panel">
      <summary><BookOpen size={19} />这是一段怎样的旅途？<ChevronDown size={18} /></summary>
      <div className="feature-grid">
        <article><Feather /><h2>选择你的人生</h2><p>自建角色，或扮演鲁迪、艾莉丝、希露菲与洛琪希。熟悉的时代，未曾发生的可能。</p></article>
        <article><Compass /><h2>让选择留下回声</h2><p>学过的语言、寄出的信、兑现的承诺，影响任务、同伴与后来的机会。</p></article>
        <article><ScrollText /><h2>调整战术，再次挑战</h2><p>出牌后自动保存，战败可免费重试。只有明确确认的不可逆剧情会封存人生。</p></article>
      </div>
    </details>
    <div className="home-notice"><BookOpen size={19} /><p>包含完整原作剧透与原创 IF 分支。存档仅保存在当前浏览器。</p><Link className="text-button" to="/world">设定与来源<ArrowRight size={16} /></Link></div>
  </main>;
}
