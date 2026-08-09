# Third-party notices

## gzh-design-skill

- Source: https://github.com/isjiamu/gzh-design-skill
- Integrated revision: `ba1f4175519b481cb3566616c9e5178705067904`
- Copyright: Copyright (C) 2026 甲木 (Jiamu) × 摸鱼小李 (Moyu Xiaoli)
- License: GNU Affero General Public License v3.0 or later

This project derives its WeChat-safe output contract, theme definitions,
semantic component mappings, validation rules, and selected implementation
patterns from `gzh-design-skill`.

Changes made on 2026-08-09 include:

- adapting the upstream Agent-oriented workflow into a deterministic browser renderer;
- mapping the six registered upstream themes into a browser-consumable registry;
- migrating the editor's legacy custom blocks into upstream-compatible semantic components;
- sharing one canonical HTML result between preview, copy, export, and validation;
- adapting the upstream output validator for this repository.

The modified project is distributed under AGPL-3.0-or-later. The full license
text is available in [LICENSE](LICENSE). This software is provided without
warranty.

When this application is made available over a network, users must be given a
prominent way to obtain the exact corresponding source for the running version.

## Marked

- Source: https://github.com/markedjs/marked
- Version: 15.0.12
- Copyright: Copyright (c) 2018+ MarkedJS; Copyright (c) 2011-2018 Christopher Jeffrey
- License: MIT; bundled Markdown portions retain their original BSD-style notice

The browser bundle is vendored at `vendor/marked/marked.min.js` so the editor
keeps working offline and does not drift when a CDN's unversioned latest build
changes. Its full notices are in `vendor/marked/LICENSE.md`.
