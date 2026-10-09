// The check that the hosted database has the repo's migrations (migrations.ts), for the deploy job.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { migrationsOutOfStep } from '../migrations';

const table = (...rows: string[]) =>
  ['', '        LOCAL      |     REMOTE     |     TIME (UTC)', '  ----------------|----------------|---------------------', ...rows].join('\n');

describe('migrationsOutOfStep', () => {
  it('finds nothing when both sides have the same migrations', () => {
    const list = table('   20261003182521 | 20261003182521 | 2026-10-03 18:25:21', '   20261006120000 | 20261006120000 | 2026-10-06 12:00:00');
    expect(migrationsOutOfStep(list)).toEqual([]);
  });

  it('names a migration the database lacks', () => {
    const list = table('   20261003182521 | 20261003182521 | 2026-10-03 18:25:21', '   20261007120000 |                | 2026-10-07 12:00:00');
    expect(migrationsOutOfStep(list)).toEqual(['20261007120000 is in the repo but not in the database']);
  });

  it('names a migration only the database has', () => {
    const list = table('                    | 20261008090000 | 2026-10-08 09:00:00');
    expect(migrationsOutOfStep(list)).toEqual(['20261008090000 is in the database but not in the repo']);
  });
});
