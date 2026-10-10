import { Link } from 'react-router';
import { Group, SectionTitle } from './parts';

const REPOSITORY = 'https://github.com/xSetha/Groovekeeper';

/** Settings → About: what Groovekeeper is, and where its code lives. */
export function AboutSection() {
  return (
    <>
      <SectionTitle>About</SectionTitle>
      <Group
        title="Groovekeeper"
        description="Write chord sheets: lyrics with each chord on the syllable where it changes."
      />
      <Group title="Desktop app" description="Groovekeeper for Windows works offline and updates itself.">
        <ul className="flex flex-col gap-2">
          <li>
            <a
              href={`${REPOSITORY}/releases/latest/download/Groovekeeper-Setup.exe`}
              className="text-accent hover:underline"
            >
              Download for Windows
            </a>
          </li>
          <li>
            <a href={`${REPOSITORY}/releases/latest`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              What’s new
            </a>
          </li>
        </ul>
      </Group>
      <Group title="Open source" description="Groovekeeper is free and open source, under the MIT License.">
        <ul className="flex flex-col gap-2">
          <li>
            <a href={REPOSITORY} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              The code, on GitHub
            </a>
          </li>
          <li>
            <a href={`${REPOSITORY}/blob/main/CREDITS.md`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Credits: the photos, fonts and libraries it uses
            </a>
          </li>
          <li>
            <Link to="/privacy" className="text-accent hover:underline">
              Privacy
            </Link>
          </li>
        </ul>
      </Group>
    </>
  );
}
