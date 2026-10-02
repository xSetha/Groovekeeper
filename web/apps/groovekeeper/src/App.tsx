import { Navigate, Route, Routes } from 'react-router';
import { TopBar } from './components/TopBar';
import { SongPage } from './pages/SongPage';
import { StartPage } from './pages/StartPage';

export function App() {
  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/songs/:id" element={<SongPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
