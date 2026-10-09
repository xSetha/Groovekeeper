// Whether the hosted database has exactly the repo's migrations, for the deploy job (.github/workflows/ci.yml):
// it reads the table `supabase migration list --linked` prints, on stdin, and stops the deploy when a migration
// is only in the repo (the new app would meet an old database) or only in the database (a repo older than it).
import { readFileSync } from 'node:fs';

/** The versions in only one place: the table's rows with an empty LOCAL or REMOTE column. */
export function migrationsOutOfStep(list: string): string[] {
  const out: string[] = [];
  for (const line of list.split(/\r?\n/)) {
    const [local = '', remote = ''] = line.split('|').map((cell) => cell.trim());
    if (!/^\d{8,}$/.test(local) && !/^\d{8,}$/.test(remote)) continue; // the header, the rule and blank lines
    if (!local) out.push(`${remote} is in the database but not in the repo`);
    else if (!remote) out.push(`${local} is in the repo but not in the database`);
  }
  return out;
}

// Run as `supabase migration list --linked | node migrations.ts`.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop()!)) {
  const problems = migrationsOutOfStep(readFileSync(0, 'utf8'));
  for (const problem of problems) console.error(`Migration ${problem}.`);
  process.exit(problems.length > 0 ? 1 : 0);
}
