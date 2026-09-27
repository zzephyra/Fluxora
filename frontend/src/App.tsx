import { useEffect, useState } from "react";

type ApiState = "loading" | "ready" | "unavailable";

export function App() {
  const [apiState, setApiState] = useState<ApiState>("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/readyz", { signal: controller.signal })
      .then((response) => {
        setApiState(response.ok ? "ready" : "unavailable");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setApiState("unavailable");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold text-ink">Fluxora</h1>
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold">产品页面尚未开放</h2>
        <p className="mt-3 text-muted">
          登录、项目和工作台仍在实现中。此页只确认前端开发服务器和 API 是否连通，不展示演示数据。
        </p>
        <p className="mt-4" role="status">
          {apiState === "loading" && "正在检查 API"}
          {apiState === "ready" && "API 已就绪"}
          {apiState === "unavailable" && "API 未就绪"}
        </p>
        <a className="mt-6 inline-flex h-10 items-center text-primary" href="/docs">
          打开 API 文档
        </a>
      </section>
    </main>
  );
}
