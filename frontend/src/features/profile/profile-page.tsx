import { Clapperboard, ImageIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "../../components/ui/button";
import { AccountMark, useSession } from "../auth";

type WorkTab = "image" | "video";

export function ProfilePage({ projectId }: { projectId: string }) {
  const session = useSession();
  const [tab, setTab] = useState<WorkTab>("image");
  const email = session.data?.email ?? "";

  return (
    <main className="workspace-content profile-page">
      <section className="profile-identity">
        <AccountMark email={email} size="lg" />
        <div className="min-w-0">
          <p className="workspace-eyebrow">PROFILE</p>
          <h1>{email}</h1>
        </div>
      </section>

      <div aria-label="作品类型" className="generation-type profile-tabs" role="tablist">
        <button
          aria-controls="profile-panel-image"
          aria-selected={tab === "image"}
          className={tab === "image" ? "active" : ""}
          id="profile-tab-image"
          onClick={() => setTab("image")}
          role="tab"
          type="button"
        >
          <ImageIcon aria-hidden size={16} />
          图片
        </button>
        <button
          aria-controls="profile-panel-video"
          aria-selected={tab === "video"}
          className={tab === "video" ? "active" : ""}
          id="profile-tab-video"
          onClick={() => setTab("video")}
          role="tab"
          type="button"
        >
          <Clapperboard aria-hidden size={16} />
          视频
        </button>
      </div>

      {tab === "image" ? (
        <div
          aria-labelledby="profile-tab-image"
          className="profile-panel"
          id="profile-panel-image"
          role="tabpanel"
        >
          <section className="profile-empty">
            <h2>还没有图片作品</h2>
            <p>去当前项目里开始下一段创作。</p>
            <Button asChild>
              <Link to={`/projects/${projectId}`}>去创作</Link>
            </Button>
          </section>
        </div>
      ) : (
        <div
          aria-labelledby="profile-tab-video"
          className="profile-panel"
          id="profile-panel-video"
          role="tabpanel"
        >
          <section className="profile-empty">
            <h2>视频作品尚未开放</h2>
            <p>视频生成尚未开放。完成后，作品会显示在这里。</p>
          </section>
        </div>
      )}
    </main>
  );
}
