// The account functions the account pages call, as test doubles; each test file mocks src/sync/account with them:
//   vi.mock('../src/sync/account', async (original) => ({ ...(await original()), ...(await import('./account-doubles')).accountDoubles }));
import { vi } from 'vitest';

export const accountDoubles = {
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(() => Promise.resolve(null)),
  setNewPassword: vi.fn(() => Promise.resolve(null)),
  resendConfirmation: vi.fn(() => Promise.resolve(null)),
  settleGuestLibrary: vi.fn(() => Promise.resolve()),
  keepOtherAccountsSongs: vi.fn(() => Promise.resolve()),
  forgetEndedSession: vi.fn(() => Promise.resolve()),
  hasUnsyncedChanges: vi.fn(() => Promise.resolve(false)),
  signOut: vi.fn(() => Promise.resolve()),
  signOutEverywhere: vi.fn(() => Promise.resolve(null)),
  changePassword: vi.fn(() => Promise.resolve(null)),
  changeEmail: vi.fn(() => Promise.resolve(null)),
  deleteAccount: vi.fn(() => Promise.resolve(null)),
  runSync: vi.fn(() => Promise.resolve()),
};
