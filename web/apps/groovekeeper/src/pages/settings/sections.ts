// The sections of Settings, in the order they're listed. A new option goes in one of them; a new kind of option
// becomes a new entry here (SettingsLayout makes its route and its place in the list from it).
import type { ComponentType } from 'react';
import { AboutSection } from './AboutSection';
import { AccountSection } from './AccountSection';
import { DisplaySection } from './DisplaySection';
import { ExportSection } from './ExportSection';
import { PrivacySection } from './PrivacySection';
import { SyncSection } from './SyncSection';

export interface SettingsSection {
  /** Its address under /settings. */
  path: string;
  label: string;
  /** One line under the label in the list on phones. */
  summary: string;
  /** Whether it is for signed-in users: a guest doesn't see it, and is sent to Sign in if they ask for it. */
  needsAccount: boolean;
  Component: ComponentType;
}

export const SECTIONS: readonly SettingsSection[] = [
  { path: 'display', label: 'Display', summary: 'Chords, text size, theme', needsAccount: false, Component: DisplaySection },
  { path: 'export', label: 'Export', summary: 'PDF defaults and paper', needsAccount: false, Component: ExportSection },
  { path: 'account', label: 'Account', summary: 'Email, password, signing out', needsAccount: true, Component: AccountSection },
  { path: 'sync', label: 'Sync and storage', summary: 'How syncing stands, what the account holds', needsAccount: true, Component: SyncSection },
  { path: 'privacy', label: 'Privacy and data', summary: 'What’s kept, deleting your account', needsAccount: true, Component: PrivacySection },
  { path: 'about', label: 'About', summary: 'Groovekeeper, open source', needsAccount: false, Component: AboutSection },
];
