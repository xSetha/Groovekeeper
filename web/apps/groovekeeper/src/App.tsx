import { Navigate, Route, Routes, useMatch } from 'react-router';
import { TopBar } from './components/TopBar';
import { SongPage } from './pages/SongPage';
import { StartPage } from './pages/StartPage';
import { useIsPhone } from './phone';

export function App() {
  // A song read on a phone gets the whole screen; it has its own way back to the library.
  const phone = useIsPhone();
  const onSongPage = useMatch('/songs/:id') !== null;
  const readingOnPhone = phone && onSongPage;
  return (
    <div className="flex h-dvh flex-col">
      {readingOnPhone ? null : <TopBar />}
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/songs/:id" element={<SongPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
