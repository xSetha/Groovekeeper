# Credits

## Start page photos

Each theme's start page has a photo behind it, in `SongCreator/Assets/Backgrounds`. They are in the
public domain or under CC0, from Wikimedia Commons; the app uses cropped, resized copies. The web
version uses the same files (`web/apps/groovekeeper/src/assets`).

| Theme | Photo | By | License |
| --- | --- | --- | --- |
| Amp | [Fender Champion II 50 Amplifier](https://commons.wikimedia.org/wiki/File:Fender_Champion_II_50_Amplifier.jpg) (the speaker grille only) | TheSaturnLover | CC0 |
| Backstage | [Mixing console in Korsze](https://commons.wikimedia.org/wiki/File:Mixing_console_in_Korsze_(Unsplash).jpg) | freestocks.org | CC0 |
| Record Sleeve | [12in LP vinyl record, macro of the grooves](https://commons.wikimedia.org/wiki/File:12in-LP-Vinyl-Record-Macro-Grooves.jpg) | Evan-Amos | Public domain |
| Songbook | [Polonaise Op. 53, manuscript](https://commons.wikimedia.org/wiki/File:Chopin_polonaise_Op._53.jpg) | Frédéric Chopin | Public domain |

## Desktop app libraries

PDF export uses [QuestPDF](https://www.questpdf.com) under its Community License; see
[docs/RELEASING.md](docs/RELEASING.md#third-party-licenses). Updates use [Velopack](https://velopack.io)
(MIT), and the library uses [Microsoft.Data.Sqlite](https://www.nuget.org/packages/Microsoft.Data.Sqlite) (MIT).

## Web app fonts

The PDFs the web app writes embed two fonts, kept with their license texts in
`web/apps/groovekeeper/src/assets/fonts`. Both are under the
[SIL Open Font License 1.1](https://openfontlicense.org).

| Font | Used for | By |
| --- | --- | --- |
| [Cascadia Mono](https://github.com/microsoft/cascadia-code) | Lyrics, chords and section headings | Microsoft Corporation |
| [Noto Sans](https://github.com/notofonts/latin-greek-cyrillic) | Titles and notes | The Noto Project Authors |

## Web app libraries

| Library | Used for | License |
| --- | --- | --- |
| [React](https://react.dev) and React DOM | The user interface | MIT |
| [React Router](https://reactrouter.com) | Pages and addresses | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | The editor's state, undo and redo | MIT |
| [Dexie.js](https://dexie.org) and dexie-react-hooks | The library in the browser (IndexedDB). Copyright (c) 2014-2017 David Fahlander | Apache 2.0 |
| [supabase-js](https://github.com/supabase/supabase-js) | Accounts and sync | MIT |
| [jsPDF](https://github.com/parallax/jsPDF) | Writing PDFs | MIT |
| fflate, fast-png, pako, iobuffer, @babel/runtime, canvg, core-js, html2canvas, [DOMPurify](https://github.com/cure53/DOMPurify) | Come with jsPDF: the first five are part of the code that writes PDFs, the others belong to jsPDF features the app doesn't use | MIT, except pako (MIT and Zlib) and DOMPurify (MPL 2.0 or Apache 2.0) |
| [Tailwind CSS](https://tailwindcss.com) | Styles | MIT |
