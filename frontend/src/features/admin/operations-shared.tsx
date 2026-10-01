import { Button } from "../../components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "../../components/ui/alert-dialog";
import { Select } from "../../components/ui/select";
import { userFacingMessage } from "../../lib/api";
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  const id = `filter-${label}`;
  return (
    <label className="admin-filter-field" htmlFor={id}>
      <span>{label}</span>
      <Select
        id={id}
        value={value}
        onChange={onChange}
        options={Object.entries(options).map(([value, label]) => ({
          value,
          label,
        }))}
      />
    </label>
  );
}
export function Pagination({
  page,
  total,
  onChange,
  busy,
}: {
  page: number;
  total: number;
  onChange: (v: number) => void;
  busy: boolean;
}) {
  return (
    <div className="admin-ops-pagination">
      <span>
        共 {total} 条 · 第 {page + 1} / {Math.max(1, Math.ceil(total / 20))} 页
      </span>
      <Button
        variant="outline"
        disabled={page === 0 || busy}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        disabled={(page + 1) * 20 >= total || busy}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </Button>
    </div>
  );
}
export function QueryMessage({
  pending,
  error,
  empty,
  retry,
}: {
  pending: boolean;
  error: unknown;
  empty: boolean;
  retry: () => void;
}) {
  if (pending)
    return (
      <p role="status" className="admin-empty">
        正在加载…
      </p>
    );
  if (error)
    return (
      <div className="admin-empty">
        <p role="alert">{userFacingMessage(error)}</p>
        <Button onClick={retry} variant="outline">
          重试
        </Button>
      </div>
    );
  if (empty) return <p className="admin-empty">暂无符合条件的记录</p>;
  return null;
}
export function Confirmation({
  title,
  description,
  busy,
  error,
  close,
  confirm,
}: {
  title: string;
  description: string;
  busy: boolean;
  error: unknown;
  close: () => void;
  confirm: () => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <AlertDialogContent className="admin-surface">
        <AlertDialogTitle className="text-lg font-semibold">
          {title}
        </AlertDialogTitle>
        <AlertDialogDescription className="my-4 text-sm text-muted">
          {description}
        </AlertDialogDescription>
        {error ? (
          <p role="alert" className="text-danger mb-4">
            {userFacingMessage(error)}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <AlertDialogCancel disabled={busy}>返回</AlertDialogCancel>
          <Button variant="danger" disabled={busy} onClick={confirm}>
            {busy ? "正在处理…" : "确认操作"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export const formatTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—";
