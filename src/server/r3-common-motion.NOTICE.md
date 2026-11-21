# Shared product motion sources

`r3-common-motion.mjs` and the adjacent integration changes adapt the following references into the canonical product DOM runtime. The QA document uses the same implementation with isolated fixture data. Native values, text selection, IME composition and existing form payloads are retained.

| Source | Fixed reference | Adapted mechanics |
|---|---|---|
| [Transitions.dev](https://github.com/Jakubantalik/transitions.dev/tree/add5b467b13be16664d10fd888330ce2f3288b07/skills/transitions-dev) | `add5b467b13be16664d10fd888330ce2f3288b07`; `01-card-resize.md`, `05-menu-dropdown.md`, `07-panel-reveal.md`, `14-skeleton-reveal.md`, `27-toggle.md` | Painted-geometry resize reversal; mounted dropdown close; bottom panel focus/scroll lifecycle; actual text Range skeleton geometry and reveal; spring switch thumb. Existing semantic tokens and reduced-motion preference control timing. |
| [DesignBookmark — Springy input](https://designbookmark.com/motion#db-springy-input) | Preserved original HTML and embedded script inspected on 2026-11-21 | Native-input mirror with per-grapheme insertion/deletion and trailing-character movement; composition/caret remain native. |
| [DesignBookmark — Swipe deck](https://designbookmark.com/motion#db-swipe-deck) | Preserved original HTML and embedded script inspected on 2026-11-21 | Same-node grid/deck FLIP, dated ordering, painted-frame interruption and reversal. |
| [DesignBookmark — Spring dropdown](https://designbookmark.com/motion#db-spring-dropdown) | Preserved original HTML and embedded script inspected on 2026-11-21 | Scale/opacity opening and closing; orientation-aware origin; live keyboard focus and native select form values. |
| [DesignBookmark — Tag input](https://designbookmark.com/motion#db-tag-input) | Preserved original HTML and embedded script inspected on 2026-11-21 | Spring insertion, in-flow occupied-width collapse, neighboring-tag position continuity. |
| [Kokonut UI — Wheel picker](https://github.com/kokonut-labs/kokonutui/blob/655ec61161aff87721e4c60c3cc4dc3329f3e80e/components/kokonutui/wheel-picker.tsx) | `655ec61161aff87721e4c60c3cc4dc3329f3e80e` | 20-degree cylinder, bounded exponential edge resistance, 80 ms velocity window, 0.32 s projected coast and 140/24 spring settle; shared pointer, keyboard and wheel selection. |

DesignBookmark references are identified as source inspirations; no blanket MIT license is asserted for that site. The inspected Transitions.dev skill and transition snippets use the Transitions.dev License below. Kokonut UI uses MIT. Product API acknowledgements, failure rollback, authorization, request idempotency and signature binding are Order application logic, not reference demo behavior.

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
