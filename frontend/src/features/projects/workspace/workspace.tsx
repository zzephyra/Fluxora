import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router";
import { ArrowDownUp, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronDown, CircleHelp, Clapperboard, Copy, Film, FolderOpen, Image, LayoutGrid, List, Menu, MessageSquare, Plus, Search, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { FluxoraMark } from "../../../components/ui/fluxora-mark";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../components/ui/dialog";
import { AccountMenu } from "../../auth";
import type { Project } from "../types";
import { roleLabel } from "../types";
import { creativePresets } from "./presets";
import "./workspace.css";

const presetIcons = { story: MessageSquare, brand: Clapperboard, world: Sparkles, shot: Film };

export function Workspace({ project }: { project: Project }) {
  const base = `/projects/${project.id}`;
  const location = useLocation();
  const suffix = location.pathname.replace(/\/$/, "").slice(base.length);
  const page = suffix === "/assets" ? "assets" : suffix === "/generation" ? "generation" : "create";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generationType, setGenerationType] = useState<"video" | "image">("video");
  const [assetType, setAssetType] = useState("全部资产");
  const [assetSearch, setAssetSearch] = useState("");
  const [view, setView] = useState("grid");
  const [dialog, setDialog] = useState<"help" | "draft" | "clear" | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!draft.trim() && !generationPrompt.trim()) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, generationPrompt]);
  const title = page === "assets" ? "资产" : page === "generation" ? "生成" : "创作";
  if (!["", "/assets", "/generation"].includes(suffix)) return <Navigate replace to={base} />;
  function fillPrompt(prompt: string) { setDraft(prompt); textarea.current?.focus(); }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopyStatus("已复制到剪贴板"); }
    catch { setCopyStatus("复制失败，请手动选择并复制内容"); }
  }
  function navItems() {
    return <>{[{ label: "创作", to: base, icon: MessageSquare, end: true }, { label: "资产", to: `${base}/assets`, icon: FolderOpen, end: false }, { label: "生成", to: `${base}/generation`, icon: WandSparkles, end: false }].map(item => <NavLink key={item.label} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `workspace-nav-item${isActive ? " active" : ""}`}><item.icon size={19} /><span>{item.label}</span><span className="nav-active-dot" /></NavLink>)}</>;
  }
  return <div className="workspace">
    <aside className="workspace-sidebar" aria-label="工作区侧边栏">
      <Link to="/projects" className="workspace-brand" aria-label="Fluxora，返回项目列表"><FluxoraMark width={43} height={43} /></Link>
      
      <nav aria-label="工作区导航">{navItems()}</nav>
      <div className="sidebar-bottom"><div className="project-private"><ShieldCheck size={15} /><span>独立空间</span></div><Button variant="ghost" className="sidebar-help" onClick={() => setDialog("help")}><CircleHelp size={17} /><span>使用帮助</span></Button><Link to="/projects" className="sidebar-back"><ArrowLeft size={16} /><span>返回项目</span></Link></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-header"><div className="workspace-breadcrumb"><Button variant="ghost" className="workspace-mobile-toggle" aria-label="打开工作区导航" onClick={() => setMobileOpen(true)}><Menu size={20} /></Button><Link to="/projects" className="project-switch" title="切换项目"><span className="project-avatar">{project.name.slice(0, 1)}</span><span>{project.name}</span><ChevronDown size={13} /></Link><span className="breadcrumb-divider">/</span><span>{title}</span></div><div className="workspace-header-actions"><span className="workspace-role">{roleLabel(project.role)}</span><AccountMenu /></div></header>

      {page === "create" && <main className="workspace-create">
        <div className="create-toolbar"><span><span className="workspace-status-dot" /> 灵感从这里开始</span><Button variant="ghost" onClick={() => { if (draft) setDialog("clear"); else textarea.current?.focus(); }}><Plus size={16} /> 新建草稿</Button></div>
        <div className="creative-center"><div className="workspace-eyebrow">YOUR IMAGINATION, IN MOTION</div><h1>你好，今天想创作什么？</h1><p className="creative-subtitle">从一句灵感开始，让想象拥有画面。</p><div className="creative-modes"><span><Sparkles size={16} /> 创意对话</span><Link to={`${base}/generation`}><Film size={16} /> 图片与视频 <ArrowUpRight size={13} /></Link></div>
          <div className="workspace-composer"><div className="composer-row"><button type="button" className="composer-add" disabled title="上传服务接入后开放" aria-label="添加参考素材"><Plus size={22} /></button><label className="sr-only" htmlFor="creative-draft">创作需求</label><textarea ref={textarea} id="creative-draft" placeholder="描述你的灵感，或者从下面的一个方向开始…" value={draft} maxLength={20000} onChange={event => { setDraft(event.target.value); setCopyStatus(""); }} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing && draft.trim()) { event.preventDefault(); setDialog("draft"); } }} /></div><div className="composer-bottom"><span className="composer-context"><FolderOpen size={15} /> 当前项目 <span className="composer-separator">·</span> 需求草稿</span><div><span className="draft-count">{draft.length.toLocaleString()} / 20,000</span><Button className="composer-submit" disabled={!draft.trim()} aria-label="预览创作需求" onClick={() => { setCopyStatus(""); setDialog("draft"); }}><ArrowUp size={19} /></Button></div></div></div>
          <p className="composer-note">对话服务接入中 · 可先整理需求，点击箭头预览并复制 · 草稿仅保留在当前项目页面</p>
          <div className="preset-grid">{creativePresets.map(preset => { const Icon = presetIcons[preset.kind]; return <button key={preset.id} className="preset-card" onClick={() => fillPrompt(preset.prompt)}><Icon size={20} /><span><strong>{preset.label}</strong></span><ArrowUpRight size={15} /></button>; })}</div>
          <p className="workspace-isolation"><ShieldCheck size={13} /> 这个项目和其他项目分开，不会带入其他项目的资料、对话或记忆。</p>
        </div>
        <section className="inspiration-section" aria-label="创作灵感"><div className="inspiration-heading"><div><span className="workspace-eyebrow">THE NEXT POSSIBILITY</span><h2>灵感，不止一种可能</h2></div><span>概念参考 · 点击带入创作需求</span></div><div className="inspiration-grid">{[
          { title: "去往，未被定义的世界", subtitle: "世界观探索", image: "/images/fluxora-world.png", preset: creativePresets[2], tag: "WORLD BUILDING" },
          { title: "让平凡，成为电影的一幕", subtitle: "光影与叙事", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=85", preset: creativePresets[0], tag: "VISUAL STORY" },
          { title: "在夜色中，寻找新的视角", subtitle: "镜头语言", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85", preset: creativePresets[3], tag: "CINEMATIC MOOD" },
        ].map(item => <button className="inspiration-card" key={item.tag} onClick={() => fillPrompt(item.preset.prompt)}><img src={item.image} alt="" loading="lazy" /><span className="inspiration-tag">{item.tag}</span><span className="inspiration-caption"><small>{item.subtitle}</small><strong>{item.title}</strong></span><span className="inspiration-arrow"><ArrowUpRight size={19} /></span></button>)}</div></section>
        <footer className="workspace-bottomline"><span>FROM CONTEXT TO CINEMA.</span><span>每一个想法，都值得一帧。</span></footer>
      </main>}

      {page === "assets" && <main className="workspace-content"><div className="workspace-page-heading"><div><span className="workspace-eyebrow">YOUR CREATIVE LIBRARY</span><h1>项目资产</h1><p>在这里管理项目中创作的图片、视频和参考素材。</p></div><Button disabled title="上传服务接入后开放"><Plus size={16} /> 上传资产</Button></div><div className="asset-toolbar"><div className="asset-filters" aria-label="资产类型">{["全部资产", "图片", "视频"].map(type => <button key={type} aria-pressed={assetType === type} className={assetType === type ? "active" : ""} onClick={() => setAssetType(type)}>{type}</button>)}</div><div className="asset-tools"><label className="asset-search"><Search size={16} /><Input aria-label="搜索资产" placeholder="搜索资产名称" value={assetSearch} onChange={event => setAssetSearch(event.target.value)} /></label><Button variant="ghost" disabled title="资产服务接入后开放排序" aria-label="按时间排序"><ArrowDownUp size={17} /></Button><div className="view-toggle"><Button variant="ghost" aria-label="网格视图" aria-pressed={view === "grid"} className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><LayoutGrid size={17} /></Button><Button variant="ghost" aria-label="列表视图" aria-pressed={view === "list"} className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={18} /></Button></div></div></div>
        <div className="asset-service-note"><CircleHelp size={15} /> 资产服务尚未接入，当前未查询真实资产；筛选与视图将在接入后作用于你的项目资产。</div>
        <section className={`workspace-empty ${view}`} aria-label="资产服务未开放"><div className="empty-art"><div /><FolderOpen size={40} /><span><Image size={19} /></span></div><h2>去创作你的下一帧。</h2><p>生成的图片和视频，将在这里汇聚。<br />你也能在这里整理创作所需的参考素材。</p>{assetSearch && <p className="pending-filter">待查询：{assetType} · {assetSearch}</p>}<Button asChild><Link to={base}>去创作</Link></Button></section>
      </main>}

      {page === "generation" && <main className="workspace-content"><div className="workspace-page-heading"><div><span className="workspace-eyebrow">MAKE THE NEXT FRAME</span><h1>把想象，交给画面。</h1><p>整理提示词和参考方向，为下一次生成做好准备。</p></div><span className="integration-badge">模型服务接入中</span></div><div className="generation-layout"><section className="generation-settings"><div className="generation-type" aria-label="生成类型"><button className={generationType === "video" ? "active" : ""} aria-pressed={generationType === "video"} onClick={() => setGenerationType("video")}><Film size={17} /> 视频生成</button><button className={generationType === "image" ? "active" : ""} aria-pressed={generationType === "image"} onClick={() => setGenerationType("image")}><Image size={17} /> 图片生成</button></div><label className="generation-label" htmlFor="generation-prompt">画面描述 <span>你的想法，越具体越好</span></label><textarea id="generation-prompt" maxLength={10000} value={generationPrompt} onChange={event => { setGenerationPrompt(event.target.value); setCopyStatus(""); }} placeholder={generationType === "video" ? "描述主体、动作、镜头运动、场景与氛围…" : "描述主体、构图、色彩、光线与视觉风格…"} /><div className="generation-prompt-actions"><span>{generationPrompt.length} / 10,000</span><Button variant="ghost" disabled={!generationPrompt.trim()} onClick={() => void copy(generationPrompt)}><Copy size={13} /> 复制提示词</Button></div><label className="generation-label" htmlFor="model-select">生成模型</label><select id="model-select" disabled><option>模型接入后提供可用选项</option></select><span className="generation-label">参考素材 <span>可选</span></span><button className="reference-upload" disabled><Plus size={20} /><span>添加参考图片</span><small>上传服务接入后开放</small></button><p className="generation-limits">分辨率、时长与画幅将根据实际模型能力提供，不预设未经支持的参数。</p><Button className="generate-button" disabled><WandSparkles size={17} /> {generationType === "video" ? "生成视频" : "生成图片"} · 暂未开放</Button><p className="generation-copy-status" role="status">{copyStatus}</p></section><section className="generation-preview"><div className="preview-topline"><span>生成预览</span><span>{generationType === "video" ? "VIDEO" : "IMAGE"}</span></div><div className="generation-preview-center"><div className="preview-frame"><FluxoraMark width={53} height={53} /></div><h2>你的下一帧，还未被定义。</h2><p>连接模型并完成生成后，<br />结果将在这里展示，并归入项目资产。</p></div><div className="generation-history"><span>生成记录</span><span>服务接入后显示真实任务状态</span></div></section></div></main>}
    </div>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}><DialogContent className="workspace-mobile-menu"><DialogTitle>工作区导航</DialogTitle><DialogDescription>切换当前项目的工作页面</DialogDescription><nav aria-label="移动工作区导航">{navItems()}</nav><Link to="/projects">返回项目列表</Link></DialogContent></Dialog>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent className="workspace-dialog"><DialogTitle className="text-xl">{dialog === "help" ? "你的创作工作区" : dialog === "clear" ? "开始新的需求草稿？" : "创作需求预览"}</DialogTitle><DialogDescription className="mt-3 text-muted">{dialog === "help" ? "创作中整理想法，资产中管理图片与视频，生成中准备提示词。当前业务服务接入中，草稿不自动保存；离开项目或刷新前请复制重要内容。" : dialog === "clear" ? "这将清空当前输入。尚未复制的内容将丢失，不会删除任何服务端对话。" : "这是一份本地需求草稿，尚未发送给 AI，也未保存到项目。"}</DialogDescription>{dialog === "draft" && <><p className="workspace-draft-preview">{draft}</p><Button onClick={() => void copy(draft)}><Copy size={15} /> 复制需求</Button><p className="mt-3 text-sm text-muted" role="status">{copyStatus}</p></>}{dialog === "clear" && <div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setDialog(null)}>保留草稿</Button><Button onClick={() => { setDraft(""); setDialog(null); textarea.current?.focus(); }}>清空并新建</Button></div>}{dialog === "help" && <Button className="mt-6" onClick={() => setDialog(null)}><Check size={15} /> 知道了</Button>}</DialogContent></Dialog>
  </div>;
}
