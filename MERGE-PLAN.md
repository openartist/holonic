# Merging the Holoseum site into `openartist/holonic` (holons.world)

Research notes and a concrete merge plan. Written 9 November 2026, against the live
repo, the live site, and this workspace.

**Short version:** keep a Markdown static-site generator as the shell of holons.world,
put the new app in the same repo at `/app/` on the same origin, and move the builder
from Material for MkDocs to Zensical `classic` before May 2027. Do not rewrite the
site in a JS framework.

---

## 1. What actually exists today

### `openartist/holonic` — the live site

| Fact | Value |
| --- | --- |
| Purpose | Legal framework for Holoseums; "Holons LMS" is a *different* repo |
| Builder | MkDocs + Material for MkDocs |
| Config | `mkdocs.yml` (valid YAML, 40 lines) |
| Content | 13 Markdown files: `index`, `about`, `whitepaper`, `contributor_guide`, plus 9 under `docs/documents/` (5 in nav) |
| Custom theme | `material/overrides/home.html` — the stock Material landing template, not Holons copy; effectively unused |
| Hosting | GitHub Pages, custom domain `www.holons.world` (`docs/CNAME`) |
| Deploy path | `gh-pages` branch, last written 2024-06-24 from commit `c10d91f` |
| Workflow | `.github/workflows/gh-pages.yml`, `mkdocs build` + `peaceiris/actions-gh-pages@v4` |
| Workflow history | **0 runs** in the Actions API — the live site is a 2024 branch deploy, not CI |
| Last commit on `main` | 2024-06-24 "Create whitepaper.md" (72 commits total) |
| Apex redirect | `holons.world` → `www.holons.world` (301, GitHub-hosted) |

So the live site is **stale by two years** relative to `main`, and the CI pipeline has
never run. `about.md`, `whitepaper.md` and four document drafts exist in the repo but
were never published. Any merge must fix the deploy path, not just add files.

### This workspace — the new site

| Fact | Value |
| --- | --- |
| Stack | Vanilla ES modules, **no build step, no dependencies** |
| Code | `src/*.js`, 8,190 lines across 21 modules; `index.html`; `styles.css` (102 KB) |
| Routing | Hash routes (`#/`, `#/projects/<id>/<tab>`) — works on any static host |
| Data | Fetches its own Markdown at runtime: `docs/incorporation/*.md` (124 KB), `docs/holons-coop/business-plan.md` |
| State | `localStorage` (plan, model, deck position, reservations) — origin-scoped |
| Tabs | Home, Projects, Site plan, Calculator, P&L, Roadmap, Slides, Documents, Team, Brief |
| Content | New network home (4 Holons, Lithium City live), 14-doc incorporation packet, 44-slide deck, business plan, walkability study |
| Tests | `npm test` — 12 Node checks, currently passing |
| Extras | `procedural-cities/` (31 MB vendored Three.js app, incl. its own `.git`), 8 PDFs at root, 11 MB `deck.pptx` |

Everything the browser needs is already relative-path and static-host safe: no
absolute `/` URLs, no server, no bundler.

### Practical note on local folders

There is **no local clone of `holonic`**. `/Users/paulbloch/Documents/github/holons` is
`openartist/holons` — a React CRA + Firebase LMS, unrelated. Step 0 of the merge is
`git clone https://github.com/openartist/holonic`.

---

## 2. The webstack question

### The incumbent is being retired

- Material for MkDocs **9.7.0 (11 Nov 2025) is the last feature release**. The project
  is in maintenance mode; Insiders was folded into the free release.
- **End of life: 5 May 2027.** Critical fixes and security updates only, then nothing.
  Published sites keep working, but unpatched.
- **MkDocs 2.0 is a ground-up rewrite and is incompatible with Material.** Pinning
  `mkdocs<2` is now mandatory — the current workflow runs an unpinned
  `pip install mkdocs-material`, so a future MkDocs 2.0 default would break the build.
- The maintainers' successor is **Zensical**, MIT, Rust + Python, by the same team.

### Zensical status (checked 9 Nov 2026)

- **0.1.0 shipped 5 November 2026** — confirmed on PyPI; this begins the "dependable
  release line" after the 0.0.x alpha series. Still 0.x, still pre-1.0.
- Reads an existing `mkdocs.yml` unchanged; preserves `docs_dir` / `site_dir` and URLs.
- A **`classic` theme** reproduces Material's appearance; `extra_css`, `extra_javascript`
  and template overrides mostly work unchanged.
- Native replacements for the common plugins (search, blog, tags, redirects, minify,
  social, exclude, llms.txt…). `mkdocs-material` features are covered.
- Gaps that matter here: **`hooks` unsupported**, plugin API not public yet, module
  system still settling. The current site uses no plugins and no hooks.

### Options considered

| Option | Fit for this site | Verdict |
| --- | --- | --- |
| **Stay on Material for MkDocs** | Zero change today; unsupported after May 2027 | Tactical only — use as the safety net during the merge |
| **Zensical (classic)** | Same Markdown, same `mkdocs.yml`, same URLs, same GitHub-edit workflow, maintained by the authors | **Recommended** |
| **Astro + Starlight** | Excellent SSG, zero-JS pages, component model, huge ecosystem — but needs Node tooling and a theme rebuild for 8 pages, and the app gains nothing (it is already dependency-free) | Only if the site grows into a real marketing site with many pages |
| **Docusaurus / VitePress** | React/Vue SPA docs; heavier than needed, and still a rewrite | No |
| **Retire the SSG, ship only the SPA** | One codebase, but legal documents lose stable indexable URLs, search, print pages, GitHub-web editing and the "Edit this page" contribution path | No |

**Why hybrid and not "just use the app":** the durable, citable part of this project is
the legal library — articles, bylaws, operating agreement, membership terms. Those want
permanent URLs, full-text search, print styles, and edits by non-technical contributors
straight from GitHub's web editor. The app is the *tool*: site plan, calculator, P&L,
reservation flow. Trying to make one vanilla SPA do both costs search, SEO and
contributor access; trying to make MkDocs render the calculator costs the app.

**Why not a subdomain:** `app.holons.world` would split analytics, split
`localStorage`, force CORS for shared assets, and double the deploy surface. A path
prefix gives the same isolation with none of that.

---

## 3. Target repository layout

```
holonic/
├── mkdocs.yml                 # later zensical.toml; mkdocs.yml stays valid either way
├── docs/                      # SSG content ONLY
│   ├── CNAME                  # www.holons.world (must survive the build)
│   ├── index.md               # new network home copy + CTA into /app/
│   ├── about.md               # vision / manifesto (old index.md sections move here)
│   ├── projects/lithium-city.md   # static, indexable project page linking to the app
│   ├── team.md
│   ├── whitepaper.md
│   ├── contributor_guide.md
│   ├── documents/             # canonical public legal library
│   └── assets/
├── app/                       # the SPA, copied verbatim into site/app/
│   ├── index.html
│   ├── styles.css
│   ├── src/*.js
│   └── docs/incorporation/*.md      # raw payloads, deliberately OUTSIDE docs/
│       └── docs/holons-coop/*
├── material/overrides/        # or delete: stock template, unused
├── tools/                     # app checks + preview script
├── package.json               # app dev server + npm test
└── .github/workflows/pages.yml
```

### The one non-obvious constraint

MkDocs/Zensical **convert every `.md` under `docs_dir` into a page** — the raw file is
not copied to `site/`. The app fetches Markdown at runtime, so its payloads must never
live under `docs/`. Keeping them at `app/docs/…` and copying `app/` into `site/app/`
after the SSG build means:

- `fetch('docs/incorporation/…')` and `fetch('docs/holons-coop/business-plan.md')`
  keep working **unchanged** (relative to `/app/`),
- no `.md` extension hacks, no JSON conversion, no `exclude_docs` trap (excluding them
  would 404 the fetches),
- `docs/CNAME` and the Markdown library are untouched by the copy.

Do **not** use `exclude_docs` for these files. Exclusion removes them from `site/`
entirely, which is the opposite of what the app needs.

---

## 4. Integration mechanics

### Build and deploy

Replace the committed-`gh-pages` flow (stale, workflow never ran) with an Actions
build → Pages artifact deploy:

```yaml
name: Deploy site
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency: { group: pages, cancel-in-progress: true }

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm test                 # 12 app checks; the app has no other safety net

      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install "zensical==0.1.*"   # transition build: "mkdocs-material==9.7.*" "mkdocs<2"

      - run: zensical build                  # transition build: mkdocs build

      - name: Copy the app into the site
        run: |
          mkdir -p site/app
          cp -R app/. site/app/
          test -f site/app/index.html
          test -f site/app/docs/incorporation/00-filing-index.md
          test -f site/CNAME

      - uses: actions/upload-pages-artifact@v3
        with: { path: site }

  deploy:
    needs: build
    environment: github-pages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/deploy-pages@v4
```

Then set **Settings → Pages → Source: GitHub Actions**. Keep `docs/CNAME`; Pages reads
it from the artifact. The old `gh-pages` branch can be deleted after the first
successful deploy (it is currently the only thing serving the domain).

### Local development

The app's own server stays as it is (`npm start`, port 8517, no-store headers) for app
work. For integration work, add one script that reproduces the real layout:

```bash
# tools/preview.sh
zensical build            # or: mkdocs build
mkdir -p site/app && cp -R app/. site/app/
python3 tools/serve.py 8518 site
```

This is the only reliable way to catch base-path mistakes before CI.

### Things that already work in our favour

- All asset references are relative (`styles.css`, `src/main.js`) — the app runs from
  `/app/` with no edits.
- Hash routing means deep links like `/app/#/projects/lithium-city/documents/02-bylaws`
  need no server rewrites.
- Same origin keeps `localStorage` and makes a single analytics surface possible.
- No service worker, so no cache-scope problems under a path prefix.

### Things to fix during the port

1. **Add a way back**: the app's top bar has no link to holons.world. Add one (and a
   matching "Open the study" CTA from the SSG pages).
2. **Brand**: the app uses cream `#F6F0E4` / navy `#0E2841`; Material is white/black.
   Align the Material palette and `extra.css` (or keep the app visually distinct on
   purpose, but decide).
3. **Drop `material/overrides/home.html`** — it is the stock Material demo template
   (references `illustration.png` and Insiders) and is not Holons content.
4. **Ship list**: exclude the 8 root PDFs, `procedural-cities/` (31 MB, includes its own
   `.git`, and nothing in the new site links to it) and `node_modules`. Keep
   `deck.pptx` (11 MB) only if the Brief tab's download link is wanted — it is a large
   file on a Pages site; consider linking the Markdown instead.
5. **Version strings**: `index.html` and `styles.css` carry `?v=2026…` cache-bust
   queries; keep bumping them or switch to hashed filenames.
6. **Pin Python deps** — unpinned `pip install mkdocs-material` is a live breakage risk
   now that MkDocs 2.0 exists.

---

## 5. Content merge

| New workspace | Old site | Decision |
| --- | --- | --- |
| Network home (4 Holons) | `index.md` vision copy | New copy becomes `docs/index.md`; **move** the vision sections to `about.md` rather than deleting them |
| — | `about.md` (LLC advantages) | Out of date: the new packet is a California nonprofit mutual benefit corporation. Rewrite, don't append |
| `docs/incorporation/*` (14 drafts) | `docs/documents/*` (9 files, 5 published) | Pick **one canonical source**. Recommended: the 14-doc packet as `docs/documents/`, with the old URLs kept as redirects; the app then reads generated copies under `app/content/` at build time |
| Team tab | — | New `docs/team.md` |
| Brief / deck | `whitepaper.md` (not in nav) | Surface the whitepaper in nav; decide whether the business plan is public |
| Calculator, P&L, Roadmap, Site plan, Reserve | — | App only (`/app/`) |

**URL preservation matters.** These are live and potentially linked:
`/documents/articles_of_organization/`, `/documents/bylaws/`,
`/documents/member_certificate/`, `/documents/member_ledger/`,
`/documents/operating_agreement/`, `/about/`, `/contributor_guide/`. Either keep the
paths or add redirects (Zensical supports redirects natively). Silent 404s on legal
pages are the worst failure mode of this merge.

**SEO architecture.** Hash routes are not indexable, so the app's project pages get no
search presence. Put the *copy* that should be found in Markdown — home, a
`/projects/lithium-city/` page, team, documents — and let those link into the app for
the interactive views. This also gives each Holon a stable URL later.

---

## 6. Phased plan

**Phase 0 — baseline (30 min)**
1. `git clone https://github.com/openartist/holonic` beside this workspace.
2. `pip install "mkdocs-material==9.7.*" "mkdocs<2"`, `mkdocs serve`, confirm the repo
   builds and the nav matches production.
3. Fix the deploy path first: switch Pages to GitHub Actions with the workflow above,
   deploy the *unchanged* site. If that fails, stop — nothing else matters until the
   domain is served by CI.
4. Tag the current live state (`git tag pre-merge`) for rollback.

**Phase 1 — port the app, no content changes (half day)**
1. Copy `index.html`, `styles.css`, `favicon.svg`, `src/`, `docs/incorporation/`,
   `docs/holons-coop/`, `tools/`, `package.json` into `app/` (payload paths preserved).
2. Build + copy locally, verify at `/app/`: every tab, both Markdown fetches, SVG/PNG
   export, deck navigation, a deep link, and a reserve flow round trip.
3. Add the "Holons.world" link in the app top bar.
4. Deploy. This alone puts the new site online at `/app/` without touching a single
   legal URL.

**Phase 2 — content and navigation (one to two days)**
1. New `docs/index.md` from the network home copy; old vision copy → `about.md`.
2. Add `/projects/lithium-city/`, `/team/`, surface `/whitepaper/`; add an "Open the
   study" CTA on each.
3. Decide canonical documents and add redirects for the five published legal URLs.
4. Add a nav tab "Study" (or "Projects") pointing at `/app/`.
5. Fix the app's stale `docs/holons-coop/business-plan.md` vs the new packet if the
   numbers diverged.

**Phase 3 — builder swap (half day)**
1. `pip install "zensical==0.1.*"`, run `zensical build` beside `mkdocs build`.
2. Diff `site/` trees: page paths, search, `CNAME`, `extra.css`, fonts, the 404 page.
   Use the `classic` theme so the visual change is near zero.
3. Switch the workflow, keep Material pinned in a comment/branch for one release.
4. Only after a green deploy, delete `gh-pages`, the stale `material/overrides/`, and
   unpin nothing.

**Phase 4 — cleanup**
- Archive `procedural-cities/` out of the published tree (its own repo upstream).
- Decide the public home of the 11 MB deck.
- Add a CI link check (`site/app/index.html` exists, every `docs/incorporation/*.md`
  reachable, no root-absolute app URLs, the five legal URLs return 200).
- Write the contributor guide section on the `app/` boundary: Markdown edits need no
  Node; JS edits need `npm test`.

---

## 7. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Zensical is 0.x and still changing | Build churn | Stay on Material through Phase 1–2; swap last; `mkdocs.yml` remains valid so rollback is one line |
| MkDocs 2.0 lands as default | Silent build failure | Pin versions in CI today |
| Pages deploy misconfigured | Domain offline | Verify Pages source before merging content; keep the `gh-pages` branch until the first green deploy |
| Legal URLs break | Broken citations, bad look for a legal project | Redirect map + link check in CI |
| Duplicate legal sources drift | Conflicting documents | One canonical directory + generated copies, never hand-edited duplicates |
| 11 MB deck + images on Pages | Slow first load | Serve the Markdown; keep the deck as a linked download |
| No JS tests beyond `npm test` | App regressions after the move | Run the suite in CI; smoke-test `/app/` after each deploy |

## 8. Recommendation in one paragraph

Clone `openartist/holonic`, fix its deploy so GitHub Actions actually publishes, and put
the new site in it as a static `/app/` subtree copied after the SSG build — same repo,
same origin, no framework rewrite. Keep the Markdown SSG for the legal library and the
indexable pages, because that is what gives this project durable URLs, search, print
output and a non-technical editing path. Move the builder from the retiring Material for
MkDocs to Zensical's `classic` theme as the final, isolated step, so the content merge
is never blocked by a toolchain change.
