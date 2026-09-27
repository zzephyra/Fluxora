import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";

const scenes = [
  { image: "/images/fluxora-world.png", alt: "旅人站在赤色太阳下的悬崖上", tag: "01 / BEYOND THE HORIZON", title: "每一个世界，\n都始于你的想象。", description: "从一个念头出发，让对话、资料与记忆，陪你走向下一帧。", credit: "FLUXORA ORIGINAL · AI 概念图" },
  { image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1600&q=85", alt: "深蓝夜空中的星光与远方地平线", tag: "02 / AFTER HOURS", title: "让未说完的故事，\n拥有下一幕。", description: "留住那些一闪而过的想法，在同一个项目里继续创作。", credit: "UNSPLASH · 情绪参考" },
  { image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=85", alt: "清晨阳光穿过森林与绿色树叶", tag: "03 / NATURAL FREQUENCY", title: "记住你的风格，\n发现新的可能。", description: "让重要的设定有迹可循，也给下一次灵感留下空间。", credit: "UNSPLASH · 情绪参考" },
];

export function LoginShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 901px)");
    const update = () => setEligible(!motion.matches && desktop.matches);
    const visibility = () => setVisible(document.visibilityState === "visible");
    update(); visibility();
    motion.addEventListener("change", update);
    desktop.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => { motion.removeEventListener("change", update); desktop.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (paused || interacting || focused || !eligible || !visible) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % scenes.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused, interacting, focused, eligible, visible]);
  function select(index: number) { setActive((index + scenes.length) % scenes.length); setPaused(true); }
  const scene = scenes[active];
  return (
    <section className="login-showcase" aria-label="创作灵感轮播" aria-roledescription="轮播" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className="login-scene-images" aria-hidden="true">{scenes.map((item, index) => <img key={item.tag} className={index === active ? "login-scene active" : "login-scene"} src={item.image} alt="" loading={index === 0 ? "eager" : "lazy"} />)}</div>
      <div className="login-scene-scrim" />
      <div className="showcase-top"><span>YOUR NEXT FRAME STARTS HERE</span><span className="showcase-symbol">✳</span></div>
      <div className="showcase-story" aria-live={paused ? "polite" : "off"} aria-atomic="true"><span className="showcase-tag">{scene.tag}</span><h2 key={scene.title}>{scene.title}</h2><p>{scene.description}</p><span className="sr-only">{scene.alt}</span></div>
      <div className="showcase-controls"><div className="scene-pagination" aria-label="选择场景">{scenes.map((item, index) => <button key={item.tag} className={active === index ? "scene-dot active" : "scene-dot"} aria-label={`显示第 ${index + 1} 张场景`} aria-current={active === index ? "true" : undefined} onClick={() => select(index)} />)}<span>0{active + 1} <span>/ 03</span></span></div><div className="scene-arrows"><Button variant="ghost" className="scene-control" aria-label={paused ? "播放轮播" : "暂停轮播"} onClick={() => setPaused(!paused)}>{paused ? <Play size={15} /> : <Pause size={15} />}</Button><Button variant="ghost" className="scene-control" aria-label="上一张场景" onClick={() => select(active - 1)}><ArrowLeft size={17} /></Button><Button variant="ghost" className="scene-control" aria-label="下一张场景" onClick={() => select(active + 1)}><ArrowRight size={17} /></Button></div></div>
      <div className="showcase-credit"><span>{scene.credit}</span><span>概念展示，非实时生成</span></div>
    </section>
  );
}
