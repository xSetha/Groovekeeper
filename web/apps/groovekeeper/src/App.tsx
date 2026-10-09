import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GuestWarning } from './components/GuestWarning';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { AccountRedirect, SignedInOnly } from './pages/auth/AuthLayout';
import { SetlistPage } from './pages/SetlistPage';
import { SetlistSongPage } from './pages/SetlistSongPage';
import { SetlistsPage } from './pages/SetlistsPage';
import { SongPage } from './pages/SongPage';
import { StartPage } from './pages/StartPage';
import { useIsPhone } from './phone';
import { useAccount } from './sync/account';

// Exporting a PDF is done now and then, so its page is loaded only when it's opened.
const PdfPage = lazy(() => import('./pages/PdfPage'));
// The account and settings pages are opened now and then too.
const SignInPage = lazy(() => import('./pages/auth/SignInPage'));
const SignUpPage = lazy(() => import('./pages/auth/SignUpPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const NewPasswordPage = lazy(() => import('./pages/auth/NewPasswordPage'));
const AuthCallbackPage = lazy(() => import('./pages/auth/AuthCallbackPage'));
const WelcomePage = lazy(() => import('./pages/auth/WelcomePage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsLayout'));
const ConflictsPage = lazy(() => import('./pages/ConflictsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));

export function App() {
  // A song read on a phone gets the whole screen; it has its own way back to the library.
  const phone = useIsPhone();
  // A song read on a phone, from the library or a setlist.
  const songMatch = useMatch('/songs/:id');
  const setlistSongMatch = useMatch('/setlists/:id/:position');
  const reading = songMatch !== null || setlistSongMatch !== null;
  const readingOnPhone = phone && reading;
  const { pathname } = useLocation();
  // An email link that landed on the start page (an older redirect setting, or Supabase falling back to the
  // Site URL) goes on to /auth, which leads where it should. Once, when it arrives.
  const emailLink = useAccount((s) => s.emailLink !== null || s.resettingPassword || s.linkError !== null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const landedHome = pathname === '/';
  useEffect(() => {
    if (emailLink && landedHome) navigateRef.current('/auth', { replace: true });
    // Only the link's arrival counts: going home later doesn't send the user back.
  }, [emailLink]);
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
          {/* Setlists are for accounts: a guest is asked to sign in. */}
          <Route path="/setlists" element={<SignedInOnly><SetlistsPage /></SignedInOnly>} />
          <Route path="/setlists/:id" element={<SignedInOnly><SetlistPage /></SignedInOnly>} />
          <Route path="/setlists/:id/:position" element={<SignedInOnly><SetlistSongPage /></SignedInOnly>} />
          <Route path="/pdf" element={<Suspense><PdfPage /></Suspense>} />
          <Route path="/signin" element={<Suspense><SignInPage /></Suspense>} />
          <Route path="/signup" element={<Suspense><SignUpPage /></Suspense>} />
          <Route path="/forgot-password" element={<Suspense><ForgotPasswordPage /></Suspense>} />
          <Route path="/forgot-password/new" element={<Suspense><NewPasswordPage /></Suspense>} />
          <Route path="/auth" element={<Suspense><AuthCallbackPage /></Suspense>} />
          <Route path="/welcome" element={<Suspense><WelcomePage /></Suspense>} />
          <Route path="/settings/*" element={<Suspense><SettingsPage /></Suspense>} />
          {/* The old account page, still linked from emails sent before. */}
          <Route path="/account" element={<AccountRedirect />} />
          <Route path="/privacy" element={<Suspense><PrivacyPage /></Suspense>} />
          <Route path="/conflicts" element={<Suspense><ConflictsPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      <GuestWarning />
      <Toasts />
    </div>
  );
}
