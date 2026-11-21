# Product administrator motion sources

This implementation adapts the interaction mechanics below into the same self-contained DOM runtime used by the product and QA. Business figures, document text and saved layouts come only from the caller's adapter. Reference demos' data and automatic idle demonstrations are not imported.

- Stat Card, Sidebar Collapse and Morph Tooltip: Designbookmark preserved source. Independent springs, left-to-right point retargeting, label cascade and asymmetric leading/trailing edge springs are retained.
- Kokonut UI: https://github.com/kokonut-labs/kokonutui at `655ec61161aff87721e4c60c3cc4dc3329f3e80e`. `scroll-index.tsx`, `bento-grid.tsx`, `metric-card.tsx`, `spending-ring.tsx`: measured document ticks and scrubbing, FLIP with lift/tilt and keyboard reorder, graph cursor/range, angular ring selection with velocity and spring.
- Libraries.dev: https://github.com/Jakubantalik/Libraries.dev at `14ae9d2dad18fcee251f4b06333b492a2a41d2ed`. `packages/liquid-gooey/src/{Gooey.tsx,GooeyItem.tsx,filter.tsx,spring.ts}`: SVG liquid silhouette behind crisp DOM children, the 6/18/-7 filter, and a shared animation clock for the content and mirrored blobs. Only the MIT gooey package is adapted; no model files are used.
- Transitions.dev: https://github.com/Jakubantalik/transitions.dev. `skills/transitions-dev/{01-card-resize,21-accordion,24-learn-more-hover}.md`: CSS snippets and tokens included verbatim with reduced-motion guards. These transitions are shipped as part of the Order product, not as a competing transitions library.

## Kokonut UI notice

MIT License

Copyright (c) 2025 kokonutUI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Libraries.dev liquid-gooey notice

MIT License

Copyright (c) 2026 Jakub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Transitions.dev license

Transitions.dev License
Copyright (c) 2026 Jakub Antalik / Transitions.dev

Summary: you (and any coding agent working for you) may use the transitions
and skills in this repository in unlimited personal and commercial projects,
modify them freely, and ship them to your users. The tooling is MIT. The one
restriction is that you may not redistribute the transitions library itself
as a competing product.

This repository contains two kinds of material under two licenses.

-------------------------------------------------------------------------------
1. Transitions and skills
-------------------------------------------------------------------------------

Covers: the transitions/ directory, the skills/ directory (including the
transitions-dev and transitions-polish agent skills), and every transition
snippet (CSS, React, TypeScript) published on transitions.dev.

Permission is granted, free of charge, to any person or automated agent
obtaining these transitions to:

  - use them in unlimited personal and commercial projects;
  - copy, paste, and modify them freely;
  - ship them to end users as part of your own product or website;
  - install and run the skills in any coding agent (Claude Code, Cursor,
    GitHub Copilot, Codex, Gemini CLI, and others) to apply the transitions
    to your code.

Restriction: you may not redistribute the library itself. You may not
repackage, resell, or publish the collection (or a substantial part of it) as
a competing transitions library, motion pack, or animation kit. Use the
transitions in your products, not as a product of their own.

Templates and themes: with a Pro, Business, or Lifetime plan you may use the
transitions inside templates, themes, starter kits, and UI kits that you sell
or give away, as long as (1) the transitions are part of a larger design, not
the main thing being sold; (2) the template includes only the transitions it
actually uses, not the library or a substantial part of it; and (3) the
transitions.dev comment in each transition's code is kept. Buyers of your
template may use those transitions as part of it. A motion or animation pack
whose main selling point is the transitions is not allowed.

Full terms: https://transitions.dev/terms.html

-------------------------------------------------------------------------------
Paid plans (Pro transitions and Agent features)
-------------------------------------------------------------------------------

The free transitions and skills in this repository need no plan, for anyone,
including companies. The paid plans cover the Pro transitions and the paid
Transitions Motion Agent features:

  - Pro: for solo builders and freelancers. Licenses one individual who
    pays for it personally, including work that individual delivers to
    their own clients as an independent freelancer.
  - Business: for companies and teams. Required when the Pro transitions or
    paid Agent features are used by or on behalf of a company or other
    organization, even by a single person (for example, one designer at a
    company). Each person using them needs a seat.

Which plan applies: if a company or organization pays for the plan, or
reimburses someone for it, the plan must be Business. A Pro plan paid for
with a company card, expensed, or bought for use at an employer is outside
the Pro license.

Once you have access under either plan, the use rights and the
redistribution restriction in section 1 apply to the Pro transitions too.

-------------------------------------------------------------------------------
2. Tooling: MIT License
-------------------------------------------------------------------------------

Covers: the agent/, cli/, cli-legacy/, refine/, build/, and scripts/
directories (including the transitions-agent and transitions-dev packages
and the Refine tool).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

-------------------------------------------------------------------------------
Everything else
-------------------------------------------------------------------------------

The transitions.dev website design, branding, and logo are not covered by
either license above. All rights reserved.
