import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** A third choice between Cancel and the confirmation, such as exporting before deleting. */
  extra?: { label: string; onClick: () => void };
}

/** A modal question with Cancel focused, so Enter doesn't confirm by accident. Esc cancels. */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, extra }: Props) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-lg border border-line bg-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancel} type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11">
            Cancel
          </button>
          {extra ? (
            <button type="button" onClick={extra.onClick} className="rounded border border-line px-3 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11">
              {extra.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-accent-fill px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-125 pointer-coarse:min-h-11"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
