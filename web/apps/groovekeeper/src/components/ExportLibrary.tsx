import { useState } from 'react';
import { exportLibrary } from '../library/backup';
import { download } from '../library/files';
import { toast } from '../toasts';

/** Saves the whole library as one zip: every song as a .txt file, and its notes and setlists to import here. */
export async function saveLibraryExport(): Promise<boolean> {
  try {
    const exported = await exportLibrary();
    download(exported.name, exported.data, 'application/zip');
    const what = `${exported.songs === 1 ? '1 song' : `${exported.songs} songs`} and ${exported.setlists === 1 ? '1 setlist' : `${exported.setlists} setlists`}`;
    toast('success', `Exported ${exported.name}`, `${what}. Import it in Groovekeeper to bring them back, notes included.`);
    return true;
  } catch {
    toast('error', "Couldn't export the library", 'Reload the page and try again.');
    return false;
  }
}

/** A button that exports the whole library (saveLibraryExport). */
export function ExportLibrary({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void saveLibraryExport().finally(() => setBusy(false));
      }}
    >
      Export library
    </button>
  );
}
