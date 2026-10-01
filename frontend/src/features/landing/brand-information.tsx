import { Link } from "react-router";
import { brand } from "../../brand";
import { LumiLogo } from "../../components/brand/LumiLogo";

/** Product information only; do not invent company addresses or legal guarantees. */
export function BrandInformation({ kind }: { kind: "about" | "privacy" | "terms" }) {
  const content = {
    about: { title: `About ${brand.company}`, paragraphs: [brand.companyDescription, brand.productDescription, brand.tagline] },
    privacy: { title: "隐私说明", paragraphs: [
      `${brand.name} 使用账号、项目、上传素材、创作描述与生成记录提供创作功能。项目资料与资产按项目权限访问。`,
      "当你提交生成任务时，完成该任务所需的描述与素材会发送到管理员配置的模型供应商。请仅提交你有权使用且适合交由该供应商处理的内容。",
      "本页是当前产品数据处理说明。正式隐私政策、数据保留期限与隐私联系渠道尚待运营方公布。",
    ] },
    terms: { title: "使用说明", paragraphs: [
      `${brand.name} 是 ${brand.company} 的图片与视频创作工作台。生成结果取决于所使用的模型；展示的概念素材不是生成效果保证。`,
      "请确保你有权使用提交的文字、图片及视频，并在发布生成内容前审核其准确性、适用性与第三方权利。",
      "本页是产品使用说明，不构成已生效的完整服务协议。正式服务条款、商用授权范围与计费政策尚待运营方公布。",
    ] },
  }[kind];
  return <main className="min-h-screen bg-canvas px-6 py-12 text-ink"><div className="mx-auto max-w-3xl">
    <Link to="/" aria-label={`${brand.name} 首页`}><LumiLogo /></Link>
    <h1 className="my-10 text-3xl font-semibold">{content.title}</h1>
    {content.paragraphs.map(text => <p key={text} className="my-6 leading-8 text-muted">{text}</p>)}
    <Link to="/studio" className="underline">开始创作</Link>
    <footer className="mt-20 text-sm text-muted">© {new Date().getFullYear()} {brand.company}. All rights reserved.</footer>
  </div></main>;
}
