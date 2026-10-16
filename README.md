# Personal Schedule · 2026–2027

A static website built with HTML, CSS, and JavaScript. Open `index.html` locally or through GitHub Pages. No build step or server is required.

## Features

- Week and month views, navigation between periods, and a jump to the current date. The week view uses a uniform hourly scale: each card’s position and height match the class time, and overlapping classes on the same day share the column width.
- Independent toggles for UVT, NURE, and alternative groups for outstanding coursework. Physical education is included in UVT.
- Alternative groups can be overlaid on the main calendar with a separate toggle and are included in overlap calculations.
- An attendance tab with separate UVT laboratory and lecture counters, plus 44 checkboxes for NURE laboratory sessions, practical classes, and tests. Marks are saved in the browser’s `localStorage`.
- A 17-week semester, UVT group 4 classes, selected mathematics and architecture retakes, German, physical education, and 27 dated sessions at the second university.
- Highlighted conflicts and a list of classes whose times need checking. When alternative groups are enabled, their conflicts with the main schedule are shown too.
- Class details and the known room appear when a card is selected; a link to the selected period can be copied from the address bar.

The data is stored in `data.js` and was transferred from a personal schedule workbook. Spanish is excluded. The YaPZT class on October 19 at 07:45 needs confirmation: the original entry was `19:10-7:45`.

Each NURE session lasts 3 hours 10 minutes. The site calculates its end time from the listed start and uses the full interval for card height and conflict detection.

The design follows [Tessera Storybook](https://timbuhtuk.github.io/tessera-storybook/?path=/docs/02-components-actions-controls--docs&globals=backgrounds.value:dark): palette, typography, rectangular controls, and focus states. Font licenses are in `licenses/`.
