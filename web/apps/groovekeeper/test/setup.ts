import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearToasts } from '../src/toasts';

afterEach(() => {
  cleanup();
  clearToasts();
});
