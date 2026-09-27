import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Copy, Film, Layers3, Menu, MoveUpRight, Sparkles, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import "./landing.css";

const works = [
  { title: "彼方，另一颗太阳", category: "叙事短片", label: "BEYOND THE HORIZON", image: "/images/fluxora-world.png", position: "center", prompt: "一名旅人站在玄武岩悬崖上，巨大的橙红色太阳缓缓升起，远山被雾气覆盖。广角镜头，胶片颗粒，暖色光线。", palette: "赤陶 / 深灰", ratio: "16:9" },
  { title: "在城市醒来之前", category: "视觉实验", label: "AFTER HOURS", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85", position: "center", prompt: "深蓝色夜空与静谧城市，远处微光亮起。缓慢推进镜头，冷色调，安静、疏离的情绪。", palette: "午夜蓝 / 银白", ratio: "16:9" },
  { title: "自然，不止一种形态", category: "品牌概念", label: "NATURAL FREQUENCY", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=85", position: "center", prompt: "阳光穿过浓密森林，光束落在苔藓与树叶上。微风、清晨水汽，柔和自然色彩，慢速镜头。", palette: "森林绿 / 金色", ratio: "16:9" },
];
const steps = [
  { name: "从一个想法开始", label: "01 / IMAGINE", title: "灵感不用完整，\n先说出来就好。", text: "描述一个画面，放入参考资料。让创意在对话中变得清晰，而不是反复从空白提示词开始。", message: "我想拍一段关于远行的短片。画面安静，有一点不真实。", answer: "先从一个孤独的旅人开始。赤陶色星球、遥远的太阳，以及没有对白的长镜头。", chips: ["世界观设定.pdf", "情绪参考.jpg"] },
  { name: "让项目记住风格", label: "02 / REMEMBER", title: "你的世界，\n有自己的连续性。", text: "把确认过的角色、视觉风格和故事设定留在项目里。下一次创作，沿着同一条线继续。", message: "保留赤陶色调和旅人的黑色斗篷，后续镜头都沿用。", answer: "这可以保存为项目记忆。你确认后，后续创作就能引用这些设定。", chips: ["角色 · 黑色斗篷", "风格 · 赤陶色调"] },
  { name: "把想象变成画面", label: "03 / CREATE", title: "每一个镜头，\n都由你来决定。", text: "整理提示词、选择参考素材并确认参数。你决定何时开始生成，作品与创作过程留在同一个项目中。", message: "第一个镜头：旅人走向远处的太阳。", answer: "镜头方案已整理：广角、缓慢推进、低饱和暖色。确认提示词与参数后，再提交生成。", chips: ["镜头 · 缓慢推进", "构图 · 16:9"] },
];
const faqs = [
  ["Fluxora 和普通的视频生成工具有什么不同？", "Fluxora 围绕项目组织创作：资料、对话、已确认的记忆与生成记录彼此关联。重点是让下一次创作能够接着上一次的想法继续。"],
  ["现在可以直接生成视频吗？", "视频生成链路仍在开发。官网中的场景图与流程是创作方向展示，不是实时生成结果；你可以进入已有的登录和项目入口。"],
  ["不同项目会共享记忆吗？", "不会默认共享。知识库、对话与记忆按项目隔离，长期记忆需要用户明确确认。"],
  ["官网中的场景素材来自哪里？", "赤色星球主视觉是为 Fluxora 创建的 AI 概念图；夜空和森林图片来自 Unsplash，用于情绪参考。它们不是平台用户作品或生成能力承诺。"],
];

const HERO_SHIFT_PX = 12;

export function heroShiftPx(clientX: number, left: number, width: number): number {
  if (width <= 0) {
    return 0;
  }
  const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
  return (ratio - 0.5) * HERO_SHIFT_PX * 2;
}

export function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState("全部灵感");
  const [selected, setSelected] = useState<(typeof works)[number] | null>(null);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const current = steps[step];

  useEffect(() => {
    const previous = document.title;
    document.title = "Fluxora — 让想象，有迹可循";
    return () => { document.title = previous; };
  }, []);
  useEffect(() => { setCopied(false); setCopyError(false); }, [selected]);
  useEffect(() => {
    const hero = heroRef.current;
    if (
      hero === null ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      return;
    }
    let target = 0;
    let current = 0;
    let frame = 0;
    const paint = () => {
      current += (target - current) * 0.12;
      if (Math.abs(target - current) < 0.05) {
        current = target;
      }
      hero.style.setProperty("--hero-shift", `${current.toFixed(2)}px`);
      frame = current === target ? 0 : window.requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(paint);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const bounds = hero.getBoundingClientRect();
      target = heroShiftPx(event.clientX, bounds.left, bounds.width);
      schedule();
    };
    const onLeave = () => {
      target = 0;
      schedule();
    };
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  async function copyPrompt() {
    if (!selected) return;
    try { await navigator.clipboard.writeText(selected.prompt); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  function jump() { setMenuOpen(false); }

  return (
    <div className="landing">
      <a className="skip-link" href="#main">跳到主要内容</a>
      <header className="land-nav">
        <Link className="land-logo" to="/" aria-label="Fluxora 首页"><span className="logo-mark"><Layers3 size={23} /></span>fluxora<span className="logo-period">®</span></Link>
        <nav className={menuOpen ? "nav-links is-open" : "nav-links"} aria-label="官网导航">
          <a href="#explore" onClick={jump}>灵感画廊</a><a href="#workflow" onClick={jump}>创作方式</a><a href="#memory" onClick={jump}>项目记忆</a><a href="#faq" onClick={jump}>常见问题</a>
        </nav>
        <div className="nav-actions"><Link className="login-link" to="/login">登录</Link><Button asChild className="land-button lime small"><Link to="/projects">进入工作台 <ArrowUpRight size={15} /></Link></Button><Button className="menu-toggle" variant="ghost" aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button></div>
      </header>

      <main id="main">
        <section className="hero" ref={heroRef}>
          <div className="hero-media">
            <img className="hero-image" src="/images/fluxora-world.png" alt="赤色太阳悬于雾海，一位旅人站在远方的悬崖上" fetchPriority="high" />
          </div>
          <div className="hero-shade" />
          <div className="hero-topline"><span>THE NEXT FRAME IS YOURS.</span><span>独立创作者的 AI 影像空间</span></div>
          <div className="hero-content">
            <div className="eyebrow"><span className="tiny-line" /> A NEW SPACE FOR YOUR IMAGINATION</div>
            <h1>让想象，<br />有迹<span className="serif-word">可循。</span><span className="title-star">✳</span></h1>
            <p>从一个念头，到一个世界。<br />让资料、对话与记忆，成为你的下一帧。</p>
            <div className="hero-ctas"><Button asChild className="land-button lime"><Link to="/projects">开启你的创作 <ArrowUpRight size={18} /></Link></Button><a className="quiet-link" href="#explore">寻找一点灵感 <ArrowRight size={17} /></a></div>
          </div>
          <div className="hero-bottom"><a href="#explore" className="scroll-cue"><ArrowDown size={16} /> 向下探索</a><div className="frame-caption"><span>001 — BEYOND THE HORIZON</span><small>FLUXORA ORIGINAL CONCEPT / AI 概念图</small></div><span className="frame-counter"><span>SCENE</span> 01</span></div>
        </section>

        <section className="manifesto-strip" aria-label="产品理念"><span>LESS REPETITION.</span><span className="strip-center">更多想象。更少从头开始。</span><span>MORE IMAGINATION. <Sparkles size={18} /></span></section>

        <section className="land-section gallery" id="explore">
          <div className="section-heading"><div><div className="eyebrow muted">01 / THE INSPIRATION ROOM</div><h2>下一个世界，<span>由你开场。</span></h2></div><p>看看一个想法，可以去往哪里。<br />场景为概念与情绪参考，非实时生成作品。</p></div>
          <div className="filter-row" aria-label="灵感分类">{["全部灵感", "叙事短片", "品牌概念", "视觉实验"].map(item => <button key={item} className={filter === item ? "filter active" : "filter"} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}<span className="gallery-hint">点击场景，探索创作提示词 <MoveUpRight size={14} /></span></div>
          <div className="work-grid">{works.filter(work => filter === "全部灵感" || work.category === filter).map((work) => <button className="work-card" key={work.title} onClick={() => setSelected(work)}><div className="work-image"><img src={work.image} alt={work.title} loading="lazy" style={{ objectPosition: work.position }} /><span className="work-tag">{work.category}</span><span className="work-open"><ArrowUpRight size={22} /></span><span className="work-overlay">探索这个场景</span></div><div className="work-caption"><div><small>{work.label}</small><h3>{work.title}</h3></div><span>{work.ratio}</span></div></button>)}</div>
        </section>

        <section className="workflow land-section" id="workflow">
          <div className="workflow-intro"><div className="eyebrow muted">02 / A FLOW THAT FEELS LIKE YOU</div><h2>创作是连续的。<br /><span>工具也应该是。</span></h2><p>不用在散落的窗口里拼凑灵感。<br />在同一个项目，让每次讨论都有下文。</p><div className="step-list" role="tablist" aria-label="创作流程">{steps.map((item, index) => <button role="tab" aria-selected={step === index} id={`step-${index}`} aria-controls="workflow-panel" key={item.label} className={step === index ? "step active" : "step"} onClick={() => setStep(index)}><span>0{index + 1}</span>{item.name}<ArrowUpRight size={18} /></button>)}</div></div>
          <div className="studio-preview" role="tabpanel" id="workflow-panel" aria-labelledby={`step-${step}`} tabIndex={0}><div className="studio-bar"><span><span className="studio-dot" /> 远行 · 创作项目</span><span>交互概念演示</span></div><div className="studio-layout"><aside><Layers3 size={20} /><Film size={19} /><Sparkles size={19} /></aside><div className="studio-body" key={step}><span className="eyebrow muted">{current.label}</span><h3>{current.title}</h3><div className="chat-bubble">{current.message}</div><div className="assistant-reply"><span className="assistant-icon">✳</span><p>{current.answer}</p></div><div className="context-chips">{current.chips.map(chip => <span key={chip}>{chip}</span>)}</div><div className="preview-input">继续你的想法… <span><ArrowUpRight size={15} /></span></div></div></div><p className="preview-note">{current.text}</p></div>
        </section>

        <section className="memory-section land-section" id="memory"><div className="memory-visual"><div className="memory-orbit orbit-one" /><div className="memory-orbit orbit-two" /><div className="memory-core"><Layers3 size={42} /><span>你的项目</span></div><div className="memory-note note-one"><span>CHARACTER</span>那个穿黑色斗篷的旅人</div><div className="memory-note note-two"><span>VISUAL LANGUAGE</span>赤陶色调 · 胶片质感</div><div className="memory-note note-three"><span>YOUR DECISION</span><Check size={14} /> 由你确认，才会记住</div></div><div className="memory-copy"><div className="eyebrow muted">03 / YOUR WORLD, REMEMBERED</div><h2>记住你的世界。<br /><span>不限制你的想象。</span></h2><p>角色的样子、故事的基调、坚持的风格。<br />把重要的设定留下，而不是每次重新解释。</p><ul><li><Check size={17} /> 每个项目，独立的知识与记忆</li><li><Check size={17} /> 每条设定，由你确认、编辑与撤销</li><li><Check size={17} /> 每次引用，都有可以追溯的来源</li></ul><a className="quiet-link" href="#workflow" onClick={() => setStep(1)}>看看记忆如何参与创作 <ArrowUpRight size={16} /></a></div></section>

        <section className="draft-section land-section"><span className="eyebrow">WHAT IF...</span><h2>如果下一帧，<br />就是你脑海里的那一幕？</h2><form onSubmit={event => { event.preventDefault(); setDraftOpen(true); }}><label className="sr-only" htmlFor="idea">描述你的创作灵感</label><input id="idea" value={draft} onChange={event => setDraft(event.target.value)} placeholder="一个旅人，走向从未见过的日落…" required maxLength={1000} /><Button type="submit" className="land-button lime">整理灵感 <ArrowUpRight size={18} /></Button></form><small>先留住这个想法。此处仅为本地草稿预览，不会调用生成服务。</small></section>

        <section className="faq-section land-section" id="faq"><div><span className="eyebrow muted">A FEW THINGS TO KNOW</span><h2>想知道更多？</h2></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>
      </main>
      <footer className="land-footer"><div className="footer-top"><Link className="land-logo" to="/"><Layers3 size={25} /> fluxora</Link><span>From context to cinema.</span><a href="#main">回到顶部 ↑</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Fluxora</span><span>为还没出现的画面，留一个位置。</span><Link to="/login">进入项目空间 <ArrowUpRight size={14} /></Link></div></footer>

      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="land-modal">{selected && <><img className="modal-image" src={selected.image} alt={selected.title} /><div className="modal-copy"><span className="eyebrow muted">{selected.category} / 概念参考</span><DialogTitle className="modal-title">{selected.title}</DialogTitle><DialogDescription className="modal-description">探索画面的情绪、构图与提示词。此素材不是实时生成结果。</DialogDescription><div className="modal-palette">{selected.palette} <span>{selected.ratio}</span></div><p className="prompt-text">{selected.prompt}</p><Button className="land-button lime" onClick={copyPrompt}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "提示词已复制" : "复制创作提示词"}</Button><span role="status" className="copy-status">{copyError ? "复制未成功，请手动选择上方提示词。" : copied ? "可以粘贴到你的项目中继续创作。" : ""}</span></div></>}</DialogContent></Dialog>
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}><DialogContent className="land-modal draft-modal"><div className="modal-copy"><span className="eyebrow muted">YOUR NEXT FRAME</span><DialogTitle className="modal-title">先留住这个想法。</DialogTitle><DialogDescription className="modal-description">这是本次页面中的临时草稿，刷新后不会保存，也没有提交生成任务。</DialogDescription><p className="prompt-text">{draft}</p><Button asChild className="land-button lime"><Link to="/projects">进入项目空间 <ArrowUpRight size={16} /></Link></Button></div></DialogContent></Dialog>
    </div>
  );
}
