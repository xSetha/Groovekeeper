import { updateSettings, useSetting } from '../../settings';
import type { Paper } from '../../pdf/layout';
import { CheckOption, Group, RadioGroup, SectionTitle } from './parts';

const PAPERS: { value: Paper; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'US Letter' },
];

/** Settings → Export: where a PDF export starts. For everyone, guests too. */
export function ExportSection() {
  const collapseRepeats = useSetting('collapseRepeats');
  const paper = useSetting('paper');
  return (
    <>
      <SectionTitle>Export</SectionTitle>
      <Group title="Exporting PDFs" description="Where each export starts. The Export PDF page can still change them for one export; the chords choice starts on Display’s.">
        <CheckOption checked={collapseRepeats} onChange={(value) => updateSettings({ collapseRepeats: value })}>
          Collapse repeated sections
        </CheckOption>
      </Group>
      <Group title="Paper size">
        <RadioGroup label="Paper size" value={paper} options={PAPERS} onChange={(value) => updateSettings({ paper: value })} />
      </Group>
    </>
  );
}
