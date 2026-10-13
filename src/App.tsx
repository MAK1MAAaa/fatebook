import { useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import {
  Feather,
  BookOpen,
  ScrollText,
  Sparkles,
  X,
  AlertTriangle,
  Menu,
} from "lucide-react";
import Home from "./pages/Home";
import Create from "./pages/Create";
import Story from "./pages/RpgStory";
import LegacyStory from "./pages/LegacyStory";
import RpgProvider from "./components/rpg/RpgProvider";
import SavePauseNotice from "./components/rpg/SavePauseNotice";
import Saves from "./pages/Saves";
import Endings from "./pages/Endings";
import World from "./pages/World";
import GameProvider from "./components/game/GameProvider";
import { useRpg as useGame } from "./rpg/context";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./components/ui/dialog";
import "./components/game/story-tools.css";
import "./components/rpg/rpg.css";
import "./components/rpg/compact-layout.css";
import "./components/rpg/folding-ui.css";
import "./components/rpg/readability.css";
import "./App.css";
import "./components/rpg/card-catalog.css";
import "./components/rpg/portraits.css";
import "./components/rpg/workshop.css";
function Layout() {
  const { error, pending, saving, retry, dismiss } = useGame();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const storyPage = location.pathname.startsWith("/story/");
  return (
    <div className={storyPage ? "app app-story" : "app"}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到正文
      </a>
      <header className="site-header">
        <Link to="/" className="brand">
          <div className="brand-mark">
            <Feather size={22} />
          </div>
          <div>
            <strong>命运之书</strong>
          </div>
        </Link>
        <nav className="desktop-navigation" aria-label="主导航">
          <NavLink to="/" end aria-label="返回首页">
            <Feather size={15} />
            <span>首页</span>
          </NavLink>
          <NavLink to="/saves" aria-label="人生档案">
            <ScrollText size={15} />
            <span>档案</span>
          </NavLink>
          <NavLink to="/endings" aria-label="命运图鉴">
            <Sparkles size={15} />
            <span>图鉴</span>
          </NavLink>
          <NavLink to="/world" aria-label="世界手册">
            <BookOpen size={15} />
            <span>手册</span>
          </NavLink>
        </nav>
        <Link to="/create" className="header-start">
          新的人生
          <Feather size={14} />
        </Link>
        <button className="mobile-menu-button icon-button" onClick={() => setMenuOpen(true)} aria-label="打开导航菜单"><Menu size={22} /></button>
      </header>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="navigation-dialog">
          <DialogTitle>命运之书</DialogTitle>
          <DialogDescription>选择要翻开的篇章。</DialogDescription>
          <SavePauseNotice />
          <nav aria-label="移动端主导航">
            {([["/", "首页", Feather], ["/saves", "人生档案", ScrollText], ["/endings", "命运图鉴", Sparkles], ["/world", "世界手册", BookOpen], ["/create", "新的人生", Feather]] as const).map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} onClick={() => setMenuOpen(false)}><Icon size={19} />{label}</NavLink>)}
          </nav>
        </DialogContent>
      </Dialog>
      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>{pending ? "结果尚未保存，推进已暂停" : "记录提示"}</strong>
            <p>{error}</p>
          </div>
          <button onClick={retry} disabled={saving}>
            {saving ? "正在保存" : pending ? "重试保存" : "重新读取"}
          </button>
          {!pending && (
            <button aria-label="关闭提示" onClick={dismiss}>
              <X size={16} />
            </button>
          )}
        </div>
      )}
      <div id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/story/:id" element={<Story />} />
          <Route path="/legacy/:id" element={<LegacyStory />} />
          <Route path="/saves" element={<Saves />} />
          <Route path="/endings" element={<Endings />} />
          <Route path="/world" element={<World />} />
          <Route
            path="*"
            element={
              <main className="empty-state">
                <h1>这一页尚未写下</h1>
                <Link to="/">返回序章</Link>
              </main>
            }
          />
        </Routes>
      </div>
      {!storyPage && (
        <footer className="site-footer">
          <span>
            命运之书 <i>·</i> 无职转生原创 IF 人生
          </span>
          <Link to="/world">设定与来源</Link>
        </footer>
      )}
    </div>
  );
}
export default function App() {
  return (
    <GameProvider>
      <RpgProvider><Layout /></RpgProvider>
    </GameProvider>
  );
}
