# Public-safe bootstrap audit
Cloudflare Pages output: `public/` only. Allowed published files at first deployment: `public/index.html` exclusively.
The source tree outside `public/` contains private planning material and is NOT a publicly publishable artifact.

Initial public HTML is a standalone, script-free, link-free status page. It has no references to internal scripts, private asset names, Drive or Sheets URLs, price records, signup information or hidden screen IDs.

Before any future build, independently enumerate resulting `public/` and block commits that introduce protected content, even when the GitHub repository is PRIVATE.

Cloudflare Production Access + signed-out denial is still required before any full IA portal release. Preview branch None and Cloudflare build state are separate follow-up verifications. No new Pages/Worker/DB/domain is authorized.
