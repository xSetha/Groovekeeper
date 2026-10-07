import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useMatch } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { SetlistPage } from './pages/SetlistPage';
import { SetlistSongPage } from './pages/SetlistSongPage';
import { SetlistsPage } from './pages/SetlistsPage';
import { SongPage } from './pages/SongPage';
import { StartPage } from './pages/StartPage';
import { useIsPhone } from './phone';

// Exporting a PDF is done now and then, so its page is loaded only when it's opened.
const PdfPage = lazy(() => import('./pages/PdfPage'));
// The account pages are opened now and then too.
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ConflictsPage = lazy(() => import('./pages/ConflictsPage'));

export function App() {
  // A song read on a phone gets the whole screen; it has its own way back to the library.
  const phone = useIsPhone();
  // A song read on a phone, from the library or a setlist.
  const songMatch = useMatch('/songs/:id');
  const setlistSongMatch = useMatch('/setlists/:id/:position');
  const reading = songMatch !== null || setlistSongMatch !== null;
  const readingOnPhone = phone && reading;
  const { pathname } = useLocation();
  return (
    // Installed on a phone, the app reaches under the notch, the rounded corners and the home indicator
    // (viewport-fit=cover): the app keeps clear of them here; the top bar pads itself, and so does the reading
    // view's bar at the bottom, which takes its color down to the edge.
    <div
      className={`flex h-dvh flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] ${readingOnPhone ? '' : 'pb-[env(safe-area-inset-bottom)]'}`}
    >
      {readingOnPhone ? null : <TopBar />}
      <ErrorBoundary resetKey={pathname}>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/songs/:id" element={<SongPage />} />
          <Route path="/setlists" element={<SetlistsPage />} />
          <Route path="/setlists/:id" element={<SetlistPage />} />
          <Route path="/setlists/:id/:position" element={<SetlistSongPage />} />
          <Route path="/pdf" element={<Suspense><PdfPage /></Suspense>} />
          <Route path="/account" element={<Suspense><AccountPage /></Suspense>} />
          <Route path="/conflicts" element={<Suspense><ConflictsPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      <Toasts />
    </div>
  );
}
