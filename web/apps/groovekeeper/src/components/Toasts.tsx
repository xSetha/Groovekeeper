import { dismissToast, useToasts, type Toast } from '../toasts';

/**
 * The toasts, bottom right (bottom centre on a phone, above the home indicator), newest at the bottom. The
 * area is always there, even empty, so screen readers are listening when a toast comes in; it lets clicks
 * through to the page between the toasts.
 */
export function Toasts() {
  const toasts = useToasts();
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-50 flex flex-col gap-2 sm:left-auto sm:w-96"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </section>
  );
}

const MARK: Record<Toast['kind'], string> = { success: '✓', info: 'i', error: '!' };

function ToastCard({ toast }: { toast: Toast }) {
  const error = toast.kind === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-3 rounded border bg-card px-4 py-3 text-sm shadow-lg ${error ? 'border-chord' : 'border-line'}`}
    >
      <span aria-hidden="true" className={`w-3 shrink-0 text-center font-semibold ${error ? 'text-chord' : 'text-accent'}`}>
        {MARK[toast.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words">{toast.title}</p>
        {toast.message ? <p className="mt-0.5 break-words text-muted">{toast.message}</p> : null}
        {toast.action ? (
          <button
            type="button"
            className="mt-2 rounded bg-accent-fill px-3 py-1 font-semibold text-on-accent hover:brightness-125 pointer-coarse:min-h-11"
            onClick={() => {
              dismissToast(toast.id);
              toast.action?.run();
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Close"
        className="-my-1 -mr-2 rounded px-2 py-1 text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        onClick={() => dismissToast(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
