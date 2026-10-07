import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './index.css';
import { startAccount } from './sync/account';
import './themes';
import { reportUncaughtErrors } from './toasts';
import { reloadWhenFilesAreGone, watchForUpdates } from './updates';

reportUncaughtErrors();
reloadWhenFilesAreGone();
watchForUpdates();
startAccount();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
