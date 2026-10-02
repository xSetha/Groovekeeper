// Counts which components ran in each React update, for tests that check what re-renders (rerender.test.tsx).
// React reports updates to the developer-tools hook, which it only looks for when it starts, so this setup file
// runs before anything loads React.

interface Fiber {
  type: unknown;
  flags: number;
  memoizedProps: unknown;
  memoizedState: unknown;
  child: Fiber | null;
  sibling: Fiber | null;
}

// React's flag for "this component's function ran". It stays on a component React skips in later updates,
// so a component counts only when its props or state (its hooks) also changed since it was last seen.
const PERFORMED_WORK = 1;
const seen = new WeakMap<Fiber, { props: unknown; state: unknown }>();

function ran(fiber: Fiber): boolean {
  if (!(fiber.flags & PERFORMED_WORK)) return false;
  const last = seen.get(fiber);
  seen.set(fiber, { props: fiber.memoizedProps, state: fiber.memoizedState });
  return !last || last.props !== fiber.memoizedProps || last.state !== fiber.memoizedState;
}

/** How many times each component (by function name) has run since the counts were last cleared. */
export const renders = new Map<string, number>();

const nameOf = (type: unknown): string | undefined =>
  typeof type === 'function' ? type.name : (type as { type?: { name?: string } } | null)?.type?.name;

(globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true,
  inject: () => 1,
  checkDCE: () => {},
  onCommitFiberUnmount: () => {},
  onCommitFiberRoot: (_renderer: number, root: { current: Fiber }) => {
    const visit = (fiber: Fiber | null) => {
      for (let f = fiber; f; f = f.sibling) {
        const name = ran(f) ? nameOf(f.type) : undefined;
        if (name) renders.set(name, (renders.get(name) ?? 0) + 1);
        visit(f.child);
      }
    };
    visit(root.current);
  },
};
