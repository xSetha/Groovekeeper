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

/** A choice of one among a few, as radio buttons, each with a line on what it does. */
export function RadioGroup<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; hint?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">{props.label}</legend>
      {props.options.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 hover:bg-hover pointer-coarse:min-h-11 pointer-coarse:items-center">
          <input
            type="radio"
            name={props.label}
            checked={props.value === option.value}
            onChange={() => props.onChange(option.value)}
            className="mt-1 size-4 shrink-0 accent-accent pointer-coarse:mt-0"
          />
          <span className="min-w-0">
            {option.label}
            {option.hint ? <span className="block text-sm text-muted">{option.hint}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function CheckOption(props: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-hover pointer-coarse:min-h-11">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="size-4 shrink-0 accent-accent"
      />
      {props.children}
    </label>
  );
}
