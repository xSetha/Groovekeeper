// The account's songs and setlists in Supabase (tables and rules in web/supabase/migrations).
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { RemoteRow, SyncedTable } from '../library/db';
import { DuplicateError, RefusedError, type Remote } from './sync';

const COLUMNS: Record<SyncedTable, string> = {
  songs: 'id, title, artist, key, text, notes, deleted, version, updated_at',
  setlists: 'id, name, songs, deleted, version, updated_at',
};

// The most rows Supabase returns for one request.
const PAGE = 1000;

// Postgres's error for a key that's already taken.
const UNIQUE_VIOLATION = '23505';
// The account's limits (migration 20261007120000): no room for another row, or a row too big (a check).
const LIMIT_REACHED = 'GK001';
const CHECK_VIOLATION = '23514';
// The database takes no changes: its storage is full, or the project is paused.
export const READ_ONLY = '25006';

/** Thrown when the database refuses or can't be reached; the next sync tries again. */
export class RemoteError extends Error {
  readonly code: string;
  constructor(error: PostgrestError) {
    super(`The account's database refused: ${error.message}`);
    this.code = error.code;
  }
}

function rows(result: { data: unknown; error: PostgrestError | null }): RemoteRow[] {
  if (result.error?.code === LIMIT_REACHED) throw new RefusedError('limit');
  if (result.error?.code === CHECK_VIOLATION) throw new RefusedError('size');
  if (result.error) throw new RemoteError(result.error);
  // The columns asked for are the ones RemoteRow has (COLUMNS).
  return (result.data ?? []) as RemoteRow[];
}

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async insert(table, newRows) {
      const result = await client.from(table).insert(newRows).select(COLUMNS[table]);
      if (result.error?.code === UNIQUE_VIOLATION) throw new DuplicateError();
      return rows(result);
    },

    async update(table, id, fields, version) {
      const result = await client.from(table).update(fields).eq('id', id).eq('version', version).select(COLUMNS[table]);
      return rows(result)[0] ?? null;
    },

    async get(table, id) {
      const result = await client.from(table).select(COLUMNS[table]).eq('id', id);
      return rows(result)[0] ?? null;
    },

    async changedSince(table, since) {
      const all: RemoteRow[] = [];
      for (let from = 0; ; from += PAGE) {
        let query = client.from(table).select(COLUMNS[table]).order('updated_at').order('id').range(from, from + PAGE - 1);
        if (since !== null) query = query.gt('updated_at', since);
        const page = rows(await query);
        all.push(...page);
        if (page.length < PAGE) return all;
      }
    },

    async epoch() {
      const result = await client.from('server_epoch').select('value').single();
      if (result.error) throw new RemoteError(result.error);
      return (result.data as { value: string }).value;
    },
  };
}
