"use client";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { STATUS_LABEL, STATUS_REQUIRES_TEXT, transitionLabel, type IssueStatus } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status";

export function TransitionDialog({
  target,
  from,
  onClose,
  onSubmit,
  pending,
  error,
  prefill,
}: {
  target: IssueStatus | null;
  from: IssueStatus;
  onClose: () => void;
  onSubmit: (text: string) => void;
  pending: boolean;
  error?: string | null;
  prefill?: string | null;
}) {
  const req = target ? STATUS_REQUIRES_TEXT[target] : undefined;
  const [text, setText] = useState("");
  const openKey = `${target}|${prefill ?? ""}`;
  const [lastKey, setLastKey] = useState(openKey);
  if (lastKey !== openKey) {
    setLastKey(openKey);
    setText(target === "NEEDS_INFO" && prefill ? prefill : "");
  }
  const tooShort = req ? text.trim().length < req.min : false;

  return (
    <Dialog.Root open={!!target} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Dialog.Content className="fixed left-1/2 top-[16vh] z-50 w-[520px] max-w-[calc(100vw-24px)] -translate-x-1/2 animate-pop-in rounded-dlg border border-line bg-raised p-6 shadow-[var(--shadow-dialog)]">
          {target && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!tooShort) onSubmit(text.trim());
              }}
            >
              <Dialog.Title className="text-title-lg font-semibold">{transitionLabel(from, target)}</Dialog.Title>
              <Dialog.Description className="mt-2 flex items-center gap-2 text-meta text-ink-3">
                <StatusPill status={from} /> → <StatusPill status={target} />
              </Dialog.Description>
              <div className="mt-5">
                <Label htmlFor="transition-text" required={!!req} hint={req ? `${text.trim().length}/${req.min}+` : "необязательно"}>
                  {req?.label ?? "Комментарий автору"}
                </Label>
                <Textarea
                  id="transition-text"
                  autoFocus
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={req?.placeholder ?? `Коротко поясните автору, что означает «${STATUS_LABEL[target]}».`}
                  aria-invalid={!!error || undefined}
                />
                <FieldError>{error}</FieldError>
                <p className="mt-2 text-meta text-ink-3">Автор получит уведомление{target === "IMPLEMENTED" || target === "REJECTED" ? ", а также все коллеги, поддержавшие обращение" : ""}.</p>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost">
                    Отмена
                  </Button>
                </Dialog.Close>
                <Button type="submit" variant={target === "REJECTED" ? "danger" : "primary"} disabled={tooShort} loading={pending}>
                  {transitionLabel(from, target)}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
