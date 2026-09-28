export function BrushSettings({
  brushSize,
  mode,
  onBrushSize,
  onMode,
}: {
  brushSize: number;
  mode: "brush" | "eraser";
  onBrushSize: (size: number) => void;
  onMode: (mode: "brush" | "eraser") => void;
}) {
  return (
    <div className="image-editor-brush">
      <button aria-pressed={mode === "brush"} onClick={() => onMode("brush")} type="button">
        蒙版笔
      </button>
      <button aria-pressed={mode === "eraser"} onClick={() => onMode("eraser")} type="button">
        蒙版橡皮
      </button>
      <label>
        笔刷
        <input
          aria-label="笔刷大小"
          max={200}
          min={5}
          onChange={(event) => onBrushSize(Number(event.target.value))}
          type="range"
          value={brushSize}
        />
        <span>{brushSize}</span>
      </label>
    </div>
  );
}
