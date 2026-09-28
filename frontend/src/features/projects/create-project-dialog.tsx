import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import { Field, fieldErrorId } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { isAbortError, userFacingMessage } from "../../lib/api";
import { createProject, projectDetailQueryKey, projectListQueryKey } from "./api";
import { isProjectId, PROJECT_NAME_MAX_LENGTH, validateProjectName } from "./types";

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const createMutation = useMutation({
    mutationFn: createProject,
  });

  function reset() {
    setName("");
    setNameError(null);
    setFormError(null);
    setConfirmDiscard(false);
  }

  function requestClose() {
    if (createMutation.isPending) {
      return;
    }
    if (name.trim()) {
      setConfirmDiscard(true);
      return;
    }
    reset();
    onOpenChange(false);
  }

  function discard() {
    reset();
    onOpenChange(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = validateProjectName(name);
    setNameError(nextError);
    setFormError(null);
    if (nextError) {
      return;
    }
    try {
      const project = await createMutation.mutateAsync(name);
      if (!isProjectId(project.id)) {
        setFormError("操作没有完成，请重试");
        return;
      }
      queryClient.setQueryData(projectDetailQueryKey(project.id), project);
      await queryClient.invalidateQueries({ queryKey: projectListQueryKey });
      reset();
      onOpenChange(false);
      navigate(`/projects/${project.id}`);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      setFormError(userFacingMessage(error));
    }
  }

  return (
    <>
      <Dialog
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true);
            return;
          }
          requestClose();
        }}
        open={open}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (name.trim() || createMutation.isPending) {
              event.preventDefault();
              requestClose();
            }
          }}
          onInteractOutside={(event) => {
            if (name.trim() || createMutation.isPending) {
              event.preventDefault();
              requestClose();
            }
          }}
        >
          <DialogTitle className="pr-10 text-lg font-semibold">新建创作空间</DialogTitle>
          <DialogDescription className="mt-3 text-muted">
            用于品牌短片、连续故事或角色设定。资料、对话和记忆不会从其他创作空间带过来，创建后你是所有者。
          </DialogDescription>
          <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
            <Field error={nameError} id="project-name" label="创作空间名称">
              <Input
                aria-describedby={nameError ? fieldErrorId("project-name") : undefined}
                aria-invalid={nameError ? true : undefined}
                id="project-name"
                maxLength={PROJECT_NAME_MAX_LENGTH}
                name="name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </Field>
            {formError ? (
              <p className="flex items-center gap-2 text-danger" role="alert">
                <CircleAlert aria-hidden className="size-4 shrink-0" />
                {formError}
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <Button onClick={requestClose} type="button" variant="outline">
                取消
              </Button>
              <Button disabled={createMutation.isPending} type="submit">
                {createMutation.isPending ? (
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                ) : null}
                {createMutation.isPending ? "正在创建" : "创建"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setConfirmDiscard} open={confirmDiscard}>
        <AlertDialogContent>
          <AlertDialogTitle className="text-lg font-semibold">放弃未保存的创作空间名称？</AlertDialogTitle>
          <AlertDialogDescription className="mt-3 text-muted">
            关闭后需要重新输入。
          </AlertDialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>放弃</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
