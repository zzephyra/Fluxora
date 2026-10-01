import { useId } from "react";

export function PromptBar({ value, busy, hasSelection, onChange, onSubmit }: {
  value: string;
  busy: boolean;
  hasSelection: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const hintId = useId();
  const reason = busy ? "正在准备图片，请稍候…"
    : !hasSelection ? "先用蒙版笔在图片上涂抹需要修改的区域，例如要去掉的人物，再点击生成。"
      : !value.trim() ? "选区已准备好，请输入希望如何修改。" : null;
  return <div>
    <form className="image-editor-prompt" onSubmit={(event) => {
      event.preventDefault();
      if (!reason) onSubmit();
    }}>
      <input aria-label="重绘描述" aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        placeholder="描述你想修改的内容" value={value} />
      <button disabled={!!reason} aria-describedby={hintId} title={reason ?? "生成选区内的修改"} type="submit">
        {busy ? "准备中…" : "生成"}
      </button>
    </form>
    <p id={hintId} role="status" className="image-editor-selection-hint">
      {reason ?? "已添加选区 · 仅重绘涂抹区域，其他区域保持不变。"}
    </p>
  </div>;
}
