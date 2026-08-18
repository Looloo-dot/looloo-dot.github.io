# louiszhu-site — Louis Yiven Zhu

The banner is **a live 3D ASCII benchmark landscape**: a perspective wireframe terrain
drawn entirely in typed characters, with a petrol-coloured capability frontier moving across
its surface. The frontier is a lifted ribbon reduced to one camera-facing lower edge, one
petrol crown and sparse supports, so it has readable volume without becoming an X-ray tangle.
The terrain itself slowly
changes. Hover locally deforms it, dragging gives a full 360-degree orbit with gentle inertia,
and clicking sends an `[EVAL]` pulse across the field. Arrow keys orbit the scene and Enter or
Space triggers the same pulse for keyboard users. A near-60fps text raster plus sub-pixel
layer drift keeps motion fluid. It pauses off-screen or in hidden tabs, recomposes
for narrow screens, and gives reduced-motion visitors one authored still. Affiliation logos
in `img/` come from Wikimedia
Commons / Hugging Face and display grayscale; verify usage before publishing. Contact email
is the OII address behind an "Email me" button. Remaining stubs: Scholar / ORCID / CV
(`data-todo`) — GitHub and LinkedIn are live.

Hand-written static site. No framework, no build step, no CDN. Deploys to GitHub Pages as-is.

```
index.html     the page
styles.css     the whole design system
banner.js      the reversible ASCII scenes (active: moving frontier; alternate: wave)
site.js        progress bar, spine, reveals, theme, popovers, keyboard
fonts/         Spectral · Public Sans · IBM Plex Mono (all SIL OFL, ~124KB)
```

## The idea

The site is built around one claim: **a number arrives stripped of the conditions that
produced it, and this page tries to be the counterexample.**

- The **banner** is deliberately legible before it moves. A wireframe landscape makes the
  3D subject clear in one glance; the layered frontier moves
  over terrain that will not stay fixed. It treats benchmark progress as a shifting map,
  rather than as a single score climbing a stable axis. `prefers-reduced-motion` renders the
  same composition as a still.
- Six benchmark regions make the metaphor concrete: MMLU/HELM, HLE, SWE-Bench,
  Terminal-Bench v2.1, GDPval and tau3-Banking. Each is a small topographic feature, and the
  nearest four earn clean labels while the others rotate into view; the moving frontier
  lights a label when it crosses that region. Their positions and heights
  are editorial geography, **not current scores or a ranking**.
- The previous wave study is preserved in `banner.js`. To compare it again, change
  `data-scene="frontier"` to `data-scene="wave"` on `#field` in `index.html`; changing the
  attribute back restores this version without reconstructing either scene.
- **Numbers in prose** distinguish counted (dotted underline) from estimated (signal
  hairline). Every figure has a hover/tap popover saying what it is and where it comes from.
  No fabricated statistics: popovers describe the estimator and source, and cite nothing
  that isn't in the manuscripts.
- **Statuses are literal.** Nothing is "forthcoming" unless someone accepted it. The one
  published item is the emphasized chip; pending items are quiet.

## Before this goes public

1. Every `data-todo` link is a stub — Scholar, ORCID, GitHub, CV PDF, paper PDFs, and the
   footer's "how it works" note. Search `data-todo`.
2. Verify the two live DOIs (SSRN wage paper, arXiv neuro paper) resolve to the right things.
3. Read every sentence once more against the manuscripts — especially the three figures in
   "One Capability" and the 87% in "Price of Intelligence".
4. The email is the CV's public one (louiszhu9@gmail.com); confirm that's the address you
   want on a public page.

## Conventions

- `--line: 30px` is the only vertical unit; margins are multiples or halves of it.
- Colour is never decorative: `--signal` = links, headings, the moving frontier and
  evaluation pulses, `::selection`;
  everything else is ink on paper.
- Motion: the banner cycle (one rAF loop, paused off-screen), and 130–600ms transitions.
  Numbers never count up; content never fades in for `prefers-reduced-motion` users (`.rv`
  is added by JS only when motion is allowed, so no-JS/reduced-motion get the full page at
  first paint).
- Oldstyle figures in prose, lining + tabular in anything data (`table`, `.fig`, `.stat`).
- Dark mode: `light-dark()` tokens + a toggle that sets `color-scheme` itself (a class alone
  does nothing); stored choice is applied in `<head>` before first paint.

## The assistant ("Ask me anything")

`ask.js` is a hand-built retrieval Q&A: ~24 curated knowledge entries + a keyword scorer
(plural-normalised, prefix-aware; generic words can't carry a match alone, one specific word
can). Fully client-side, answers only from its base, honest fallback pointing to email.
**Keep the knowledge entries in sync when the site's facts change.**

**Upgrading to a real LLM — the code is already written.** `worker.js` in this repo is a
complete Cloudflare Worker: it holds the Anthropic API key as a server-side secret, carries
the full site knowledge in its system prompt, instructs Claude (Haiku) to answer ONLY from
those facts and refuse everything else, resists prompt injection, and returns `{answer}`
with CORS. Deploy steps are in its header comment (≈10 minutes, free tier, fractions of a
penny per question). Then paste the worker URL into `LLM_ENDPOINT` at the top of `ask.js` —
the chat upgrades itself, the section's mode label switches to say Claude is behind it
(it never claims more than is running), and the local matcher remains the offline fallback.
`worker.js` is never loaded by the site; it exists in the repo only for deployment.
Keep SITE_FACTS in worker.js and the KB in ask.js in sync when facts change.

## Keyboard

`1`–`5` sections · `0` top · `Esc` closes popovers · tab everywhere, visible focus.

## Local preview

```bash
python3 -m http.server 8913 --directory .
```
