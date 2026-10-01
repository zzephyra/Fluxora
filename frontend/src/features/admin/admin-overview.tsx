import { brand } from "../../brand";
import { ArrowUpRight, CheckCircle2, CircleDashed } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router";
import { ADMIN_MODULES } from "./admin-navigation";
import { useAdminItems } from "./model-admin-page";

export function AdminOverview() {
  const items = useAdminItems();
  const stats = [
    ["已登记模型", items.length],
    ["已启用模型", items.filter(item => item.enabled).length],
    ["供应商数量", new Set(items.map(item => item.provider)).size],
    ["已启用视频模型", items.filter(item => item.enabled && ["text_to_video", "image_to_video"].includes(item.capability)).length],
  ];
  return <>
    <div className="admin-page-heading"><div><h1>控制台总览</h1><p>从模型配置到创作运营，集中管理 {brand.name}。</p></div><Link className="admin-console-action" to="/admin/models">管理模型 <ArrowUpRight size={16} /></Link></div>
    <section aria-label="模型目录统计" className="admin-overview">{stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <p className="admin-console-note">统计来自当前模型目录；已启用不代表供应商在线或已完成业务指定。</p>
    <div className="admin-section-heading"><h2>管理入口</h2><span>6 个已接入模块 · 2 个规划模块</span></div>
    <div className="admin-module-grid">{ADMIN_MODULES.filter(item => item.path !== "/admin").map(({ path, title, icon: Icon, description, planned }) => <Link className="admin-module-card" key={path} to={path}>
      <div className="admin-module-card-top"><Icon size={21} /><span className={planned ? "admin-module-status" : "admin-module-status ready"}>{planned ? "待接入" : "已接入"}</span></div>
      <h2>{title}<ArrowUpRight size={16} /></h2><p>{description}</p>
    </Link>)}</div>
  </>;
}

export function AdminModuleScreen() {
  const { pathname } = useLocation();
  const item = ADMIN_MODULES.find(module => module.path === pathname.replace(/\/$/, "") && module.planned);
  if (!item) return <Navigate replace to="/admin" />;
  const Icon = item.icon;
  return <>
    <div className="admin-page-heading"><div><h1>{item.title}</h1><p>{item.description}</p></div><span className="admin-module-status">待接入</span></div>
    <section className="admin-planned-panel" aria-label={`${item.title}接入状态`}>
      <div className="admin-planned-icon"><Icon size={28} /></div>
      <h2>管理入口已就绪，业务能力待接入</h2>
      <p>当前尚未提供此模块的管理接口，因此这里不展示业务数据或操作按钮。</p>
      <Link className="admin-console-action" to="/admin">返回控制台总览 <ArrowUpRight size={16} /></Link>
    </section>
    <section className="admin-module-scope"><h2>计划支持的管理能力</h2>{item.features.map(feature => <p key={feature}><CircleDashed size={17} />{feature}</p>)}</section>
    <aside className="admin-console-boundary"><CheckCircle2 size={19} /><p>接入前需明确管理员的数据访问范围和操作审计规则。已开放用户管理及生成任务、资产、导出运营元数据；其他项目内容继续按成员权限隔离。</p></aside>
  </>;
}
