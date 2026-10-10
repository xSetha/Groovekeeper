import { useEffect } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { useMediaQuery } from '../../phone';
import { useAccount } from '../../sync/account';
import { SignedInOnly } from '../auth/AuthLayout';
import { ChangePasswordPage } from './ChangePasswordPage';
import { SECTIONS } from './sections';

// Below this width, Settings shows either the list of sections or one section, not both side by side.
const NARROW_QUERY = '(max-width: 767px)';

/**
 * /settings/*: the sections beside the one open; on a narrow screen, one or the other. Display, Export and About are for
 * everyone; the account's sections are for signed-in users, and a guest asking for one is sent to Sign in.
 */
export default function SettingsLayout() {
  return <Settings />;
}

function Settings() {
  const status = useAccount((s) => s.status);
  const signedIn = status === 'signedIn';
  const sections = SECTIONS.filter((section) => signedIn || !section.needsAccount);
  const narrow = useMediaQuery(NARROW_QUERY);
  const { pathname } = useLocation();
  const atList = pathname.replace(/\/$/, '') === '/settings';
  const current = SECTIONS.find((section) => pathname.startsWith(`/settings/${section.path}`));
  const inPassword = pathname.startsWith('/settings/account/password');

  useEffect(() => {
    document.title = `${current ? `${current.label} – ` : ''}Settings – Groovekeeper`;
  }, [current]);

  // Until the account is known the list would show only some sections and then grow.
  if (status === 'starting') return null;

  // A wide screen always has a section open: the first one, at /settings.
  if (atList && !narrow) return <Navigate to={`/settings/${sections[0]!.path}`} replace />;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl gap-10 px-4 py-8">
        {!narrow || atList ? (
          <nav aria-label="Settings" className={narrow ? 'flex-1' : 'w-52 shrink-0'}>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <ul className="mt-4 flex flex-col gap-1">
              {sections.map((section) => (
                <li key={section.path}>
                  <NavLink
                    to={`/settings/${section.path}`}
                    className="block rounded px-3 py-2 hover:bg-hover aria-[current=page]:bg-hover aria-[current=page]:font-semibold pointer-coarse:min-h-11"
                  >
                    {section.label}
                    {narrow ? <span className="block text-sm text-muted">{section.summary}</span> : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {atList ? null : (
          <div className="min-w-0 flex-1">
            {narrow ? (
              // Back one level: from a section to the list, from Change password to Account.
              <Link to={inPassword ? '/settings/account' : '/settings'} className="-ml-2 inline-flex min-h-11 items-center px-2 text-muted">
                ‹ {inPassword ? 'Account' : 'Settings'}
              </Link>
            ) : null}
            <Routes>
              {SECTIONS.map(({ path, needsAccount, Component }) => (
                <Route
                  key={path}
                  path={path}
                  element={needsAccount ? <SignedInOnly><Component /></SignedInOnly> : <Component />}
                />
              ))}
              <Route path="account/password" element={<SignedInOnly><ChangePasswordPage /></SignedInOnly>} />
              <Route path="*" element={<Navigate to="/settings" replace />} />
            </Routes>
          </div>
        )}
      </div>
    </main>
  );
}
