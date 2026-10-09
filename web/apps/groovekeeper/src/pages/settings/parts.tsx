// The building blocks of a settings section: its title, and groups of settings with a heading each.
import type { ReactNode } from 'react';

export function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-xl font-semibold">{children}</h2>;
}

/** One group of a section: a heading, a line on what it is, and its settings or actions. */
export function Group({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-line py-6 last:border-b-0">
      <h3 className="font-semibold">{title}</h3>
      {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
