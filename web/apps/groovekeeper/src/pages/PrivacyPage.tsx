import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';

// Who runs this copy of the app and how to reach them (build settings: each copy names its own).
const OPERATOR = import.meta.env.VITE_SITE_OPERATOR as string;
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string;

/** What the app keeps about the people using it, where, for how long, and what they can do about it. */
export default function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy – Groovekeeper';
  }, []);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto max-w-2xl px-4 py-8 leading-relaxed">
        <h1 className="text-2xl font-semibold">Privacy</h1>
        <p className="mt-2 text-sm text-muted">Last changed on 8 October 2026.</p>

        <p className="mt-4">
          Groovekeeper is run by {OPERATOR}, who is responsible for the personal data described here. For any
          question about it, write to <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">{CONTACT}</a>.
          Groovekeeper is free and open source; it has no ads, no tracking and no analytics.
        </p>

        <Section title="Without an account">
          Your songs, notes and setlists are kept in this browser, on this device, and are never sent to us. The
          pages themselves come from Cloudflare, which hosts the site; like any web server, it sees your IP address
          to send you the pages.
        </Section>

        <Section title="With an account">
          <p>We keep, for as long as your account exists:</p>
          <ul className="mt-2 list-disc pl-6">
            <li>your email address, to sign you in and to send you the emails you ask for;</li>
            <li>your password, stored only as a one-way hash that nobody can read it back from;</li>
            <li>your songs, notes and setlists, and when each was last changed, so every device you sign in on has them;</li>
            <li>
              when you signed up and last signed in, and for each device signed in, its IP address and browser, to keep
              it signed in and to spot misuse.
            </li>
          </ul>
          <p className="mt-2">
            The servers also log requests (with IP addresses) for a short time, to keep the site running and safe.
          </p>
          <p className="mt-2">
            Your devices keep a copy in their browser too, so the app works without a connection. Signing out
            removes it from that device.
          </p>
        </Section>

        <Section title="Who keeps it for us">
          <ul className="list-disc pl-6">
            <li>
              <strong>Supabase</strong> keeps the accounts and their songs, in a database in the European Union.
            </li>
            <li>
              <strong>Resend</strong> sends the emails that confirm an account or reset a password, so it receives your
              email address for that.
            </li>
            <li>
              <strong>Cloudflare</strong> hosts the site and runs Turnstile, the check that keeps bots out of the
              sign-in forms: it looks at your browser to tell people from bots, only on those forms.
            </li>
          </ul>
          <p className="mt-2">
            Each night an encrypted copy of the database is made, kept for 7 days, to bring it back if something goes
            wrong.
          </p>
          <p className="mt-2">
            Supabase, Resend and Cloudflare are companies based in the United States, so your data may be handled
            there. Each takes part in the EU-US Data Privacy Framework and signs the European Commission’s standard
            contractual clauses, the safeguards the GDPR asks for when data leaves the EU.
          </p>
        </Section>

        <Section title="Why">
          Keeping your account and songs is what you ask for by creating an account (the service you signed up for).
          Keeping bots out and making backups protect the site and everyone’s songs (a legitimate interest).
        </Section>

        <Section title="What you can do">
          <ul className="list-disc pl-6">
            <li>
              Take all your songs, notes and setlists with you: <strong>Export library</strong> in the library, or in{' '}
              <Link to="/settings/sync" className="text-accent hover:underline">
                Settings → Sync and storage
              </Link>
              .
            </li>
            <li>
              Delete your account and everything in it: <strong>Delete account</strong> in Settings → Privacy and data. It’s gone at
              once; the nightly copies keep it for up to 7 days more.
            </li>
            <li>
              Ask what we keep about you, have it corrected, or object: write to {CONTACT}.
            </li>
            <li>
              Complain to the data protection authority where you live, if you think we handle your data wrongly.
            </li>
          </ul>
        </Section>

        <Section title="Changes">
          When this page changes, its date at the top changes too.
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
