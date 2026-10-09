import { useEffect } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { useMediaQuery } from '../../phone';
import { SignedInOnly } from '../auth/AuthLayout';
import { ChangePasswordPage } from './ChangePasswordPage';
import { SECTIONS } from './sections';

// Below this width, Settings shows either the list of sections or one section, not both side by side.
const NARROW_QUERY = '(max-width: 767px)';

/** /settings/*: for signed-in users. The sections beside the one open; on a narrow screen, one or the other. */
export default function SettingsLayout() {
  return (
    <SignedInOnly>
      <Settings />
    </SignedInOnly>
  );
}

function Settings() {
  const narrow = useMediaQuery(NARROW_QUERY);
  const { pathname } = useLocation();
  const atList = pathname.replace(/\/$/, '') === '/settings';
  const current = SECTIONS.find((section) => pathname.startsWith(`/settings/${section.path}`));
  const inPassword = pathname.startsWith('/settings/account/password');

  useEffect(() => {
    document.title = `${current ? `${current.label} – ` : ''}Settings – Groovekeeper`;
  }, [current]);

  // A wide screen always has a section open: the first one, at /settings.
  if (atList && !narrow) return <Navigate to={`/settings/${SECTIONS[0]!.path}`} replace />;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl gap-10 px-4 py-8">
        {!narrow || atList ? (
          <nav aria-label="Settings" className={narrow ? 'flex-1' : 'w-52 shrink-0'}>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <ul className="mt-4 flex flex-col gap-1">
              {SECTIONS.map((section) => (
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
              {SECTIONS.map(({ path, Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
              <Route path="account/password" element={<ChangePasswordPage />} />
              <Route path="*" element={<Navigate to="/settings" replace />} />
            </Routes>
          </div>
        )}
      </div>
    </main>
  );
}
