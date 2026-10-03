import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useMatch } from 'react-router';
import { TopBar } from './components/TopBar';
import { SetlistPage } from './pages/SetlistPage';
import { SetlistSongPage } from './pages/SetlistSongPage';
import { SetlistsPage } from './pages/SetlistsPage';
import { SongPage } from './pages/SongPage';
import { StartPage } from './pages/StartPage';
import { useIsPhone } from './phone';

// Printing is used now and then, so its page is loaded only when it's opened.
const PrintPage = lazy(() => import('./pages/PrintPage'));

export function App() {
  // A song read on a phone gets the whole screen; it has its own way back to the library.
  const phone = useIsPhone();
  // A song read on a phone, from the library or a setlist.
  const songMatch = useMatch('/songs/:id');
  const setlistSongMatch = useMatch('/setlists/:id/:position');
  const reading = songMatch !== null || setlistSongMatch !== null;
  const readingOnPhone = phone && reading;
  return (
    <div className="flex h-dvh flex-col print:block print:h-auto">
      {readingOnPhone ? null : <TopBar />}
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/songs/:id" element={<SongPage />} />
        <Route path="/setlists" element={<SetlistsPage />} />
        <Route path="/setlists/:id" element={<SetlistPage />} />
        <Route path="/setlists/:id/:position" element={<SetlistSongPage />} />
        <Route path="/print" element={<Suspense><PrintPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
