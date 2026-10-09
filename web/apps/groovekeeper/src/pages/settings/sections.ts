// The sections of Settings, in the order they're listed. A new option goes in one of them; a new kind of option
// becomes a new entry here (SettingsLayout makes its route and its place in the list from it).
import type { ComponentType } from 'react';
import { AboutSection } from './AboutSection';
import { AccountSection } from './AccountSection';
import { PrivacySection } from './PrivacySection';
import { SyncSection } from './SyncSection';

export interface SettingsSection {
  /** Its address under /settings. */
  path: string;
  label: string;
  /** One line under the label in the list on phones. */
  summary: string;
  Component: ComponentType;
}

export const SECTIONS: readonly SettingsSection[] = [
  { path: 'account', label: 'Account', summary: 'Email, password, signing out', Component: AccountSection },
  { path: 'sync', label: 'Sync and storage', summary: 'How syncing stands, what the account holds', Component: SyncSection },
  { path: 'privacy', label: 'Privacy and data', summary: 'What’s kept, deleting your account', Component: PrivacySection },
  { path: 'about', label: 'About', summary: 'Groovekeeper, open source', Component: AboutSection },
];
