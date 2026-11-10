## Introduction

Holons.world documents a legal framework for creating Holoseums — holonic,
multi-modal coliving spaces — and hosts the network site that presents the
projects, their financial studies and the co-op formation packet.

## What is published

One GitHub Pages deployment on www.holons.world serves two halves:

- `/` — the network app in `app/`: the project pages, site plan, calculator,
  ten-year P&L, roadmap, slides, the incorporation packet and the Desert
  Parcel Atlas at `/research/`.
- `/documents/site/` — the MkDocs site in `docs/`: the framing pages and the
  legal documents.

`.github/workflows/gh-pages.yml` builds both on every push to `main`. It runs
`mkdocs build -d site/documents/site`, copies the app's runtime files to the
published root, lifts `404.html` and `CNAME` up so the custom domain and
unknown-path handling keep working, and deploys `site/` to `gh-pages`.

## Working locally

```bash
cd app && npm test    # route, model, deck, document and UI smoke checks
cd app && npm start   # serves the app on http://127.0.0.1:8517/
```

The app has no dependencies; the checks run on plain Node.

To preview the exact published layout, build the docs into the same shape as
the workflow and serve the result:

```bash
python3 -m venv .venv && .venv/bin/pip install mkdocs-material==9.7.7
.venv/bin/mkdocs build -d /tmp/holons-site/documents/site
cp -R app/index.html app/styles.css app/favicon.svg app/src app/assets app/docs app/research /tmp/holons-site/
cp /tmp/holons-site/documents/site/CNAME /tmp/holons-site/CNAME
python3 -m http.server 8519 --bind 127.0.0.1 --directory /tmp/holons-site
```

## Repository layout

- `app/` — the network app: source in `app/src/`, imagery in `app/assets/`,
  the legal drafts it renders in `app/docs/`, the atlas in `app/research/`,
  and the check scripts in `app/tools/`.
- `docs/` — the MkDocs source. `mkdocs.yml` sets `site_url` to
  `https://www.holons.world/documents/site/`.
- `MERGE-PLAN.md` — why the site is a Markdown SSG plus a static app rather
  than a framework rewrite, and the phased plan for the next migration.

Not in the repository: the source PDFs and scans used as research inputs, the
vendored `procedural-cities` demo (it has its own repository), and transient
working files.

## How to Contribute

You can make modifications directly through Github or by downloading and
installing the whole Git repo and pushing changes.

## Have Questions?

Contact Paul Bloch through Github.
