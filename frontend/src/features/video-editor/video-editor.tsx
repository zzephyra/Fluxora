import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { editorError } from "./api";
import { getDocument, type EditorDocument } from "./api";
import { createEditorStore, EditorContext } from "./store";
import { useEditorShortcuts } from "./shortcuts";
import { EditorHeader } from "./editor-header";
import { MaterialsPanel } from "./materials-panel";
import { PreviewPanel } from "./preview-panel";
import { PropertiesPanel } from "./properties-panel";
import { Timeline } from "./timeline";
import { clearThumbnails } from "./media";
import "./video-editor.css";
function Session({ document }: { document: EditorDocument }) {
  const [store] = useState(() => createEditorStore(document));
  useEffect(() => () => clearThumbnails(), []);
  return (
    <EditorContext.Provider value={store}>
      <EditorBody projectId={document.project_id} documentId={document.id} />
    </EditorContext.Provider>
  );
}
function EditorBody({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId: string;
}) {
  useEditorShortcuts();
  return (
    <main className="video-editor">
      <EditorHeader projectId={projectId} documentId={documentId} />
      <div className="ve-main">
        <MaterialsPanel projectId={projectId} />
        <PreviewPanel projectId={projectId} />
        <PropertiesPanel />
      </div>
      <Timeline projectId={projectId} />
    </main>
  );
}
export function VideoEditor() {
  const { projectId = "", documentId = "" } = useParams();
  const document = useQuery({
    queryKey: ["projects", projectId, "editor-document", documentId],
    queryFn: ({ signal }) => getDocument(projectId, documentId, signal),
    refetchOnWindowFocus: false,
  });
  if (document.isPending)
    return (
      <div className="ve-loading" role="status">
        正在打开剪辑工程…
      </div>
    );
  if (document.isError)
    return (
      <div className="ve-loading" role="alert">
        <p>{editorError(document.error)}</p>
        <Button onClick={() => void document.refetch()}>重试</Button>
        <Link to={`/projects/${projectId}/generation`}>返回生成页</Link>
      </div>
    );
  return (
    <Session key={`${projectId}:${documentId}`} document={document.data} />
  );
}
