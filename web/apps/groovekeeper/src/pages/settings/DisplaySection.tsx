import type { ChordStyle } from '@groovekeeper/core';
import { ThemeChoices } from '../../components/ThemePicker';
import { updateSettings, useSetting, type TextSize } from '../../settings';
import { Group, RadioGroup, SectionTitle } from './parts';

const CHORD_STYLES: { value: ChordStyle; label: string; hint: string }[] = [
  { value: 'letters', label: 'A B C', hint: 'Am  G7  C  F' },
  { value: 'solfege', label: 'Do Re Mi', hint: 'Lam  Sol7  Do  Fa' },
  { value: 'numerals', label: 'I IV V (Roman numerals)', hint: 'vi  V7  I  IV, counted from each song’s key' },
];

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
];

/** Settings → Display: how chords are written, the size of the text in the editor, and the theme. For everyone, guests too. */
export function DisplaySection() {
  const chords = useSetting('chords');
  const textSize = useSetting('textSize');
  return (
    <>
      <SectionTitle>Display</SectionTitle>
      <Group
        title="Chords"
        description="How chords are written in the editor, when reading, and to start with in exports. Your songs always keep letters, and you can type chords either way. A song without a key keeps letters in Roman numerals."
      >
        <RadioGroup label="Chords" value={chords} options={CHORD_STYLES} onChange={(value) => updateSettings({ chords: value })} />
      </Group>
      <Group title="Text size" description="The lyrics and chords in the editor. A PDF keeps its own size.">
        <RadioGroup label="Text size" value={textSize} options={TEXT_SIZES} onChange={(value) => updateSettings({ textSize: value })} />
      </Group>
      <Group title="Theme" description="Also in the top bar.">
        <div role="group" aria-label="Theme" className="flex max-w-sm flex-col">
          <ThemeChoices />
        </div>
      </Group>
    </>
  );
}
