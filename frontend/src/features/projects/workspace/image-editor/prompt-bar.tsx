export function PromptBar({
  value,
  busy,
  onChange,
  onSubmit,
}: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="image-editor-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        aria-label="重绘描述"
        onChange={(event) => onChange(event.target.value)}
        placeholder="描述你想修改的内容"
        value={value}
      />
      <button disabled={busy || value.trim().length === 0} type="submit">
        生成
      </button>
    </form>
  );
}
