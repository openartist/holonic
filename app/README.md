# Tiny Home Village — procedural site plans

A small, dependency-free web app that draws a schematic site plan for an RV park or
tiny-home village inside a rectangle you specify.Seven different neighbourhood patterns are available, each driven by a set of editable
rules, and every plan is seeded — the same seed, parcel and rules always draw the same village.

## Run it

```bash
python3 -m http.server 8517 --bind 127.0.0.1   # or: npm start
# open http://127.0.0.1:8517/
```

No build step, no packages. Any static file server works; ES modules need `http://`
(opening `index.html` from `file://` will not load the modules).

## Procedural Cities demo

The vendored Three.js city and RV-park generator (`procedural-cities/`, MIT, upstream [lanmower/Procedural-Cities](https://github.com/lanmower/Procedural-Cities)) was **not** imported: nothing in this site links to it and it carries its own 31 MB clone. It remains in the research workspace.

## Neighbourhood patterns

The **Layout rule** control decides how lots are organised. On `Auto` the seed picks a
pattern suitable for the parcel's proportions, so regenerating walks through
different villages rather than the same plan.

| Pattern | What it builds |
| --- | --- |
| **Parallel lanes** | Community core at the entry, garden band above it, then ranks of double-loaded lanes with lots back-to-back. Dense, simple to serve. |
| **Loop courtyards** | The interior becomes blocks; each block gets a rectangular loop lane with lots outside and inside it and a planted island in the middle. |
| **Street grid** | Blocks separated by crossing streets; each block is ringed with lots facing the streets, with a green or orchard in the block centre. |
| **Perimeter lots** | Lots face the loop drive all the way round the parcel, with the village core and gardens in the middle green. |
| **Concentric rings** | Nested loop drives stepping in from the perimeter, one row of lots facing each ring, radial cross lanes between rings, core at the centre. |
| **Hamlet clusters** | Small clusters of lots around their own court, jittered across the parcel at varying size and position and chained back to the core by foot lanes. |
| **Terraced rows** | Single-loaded rows that alternate which side of the lane the lots sit on, with staggered starts and short cross lanes — read as informal terraces rather than a grid. |

If a parcel is too small or too shallow for block subdivision, the generator says so
in **Notes** and falls back to parallel lanes rather than drawing an empty sheet.

## Rules

Every pattern responds to these (panel → **Rules**):

| Rule | Effect |
| --- | --- |
| Lane width | 18–28 ft drive width; also shifts the street grid spacing |
| Buffer | perimeter landscape / easement width |
| Garden share | fraction of the interior given to community gardens |
| Tree density | 0–2× multiplier on scattered planting |
| Visitor stalls | bays beside the entry (or auto-sized from the lot count) |
| Resident stalls | a second bay for residents / overflow |
| Community core | compact, standard, or full (adds a second bathhouse) |
| Stall on every lot | draws a marked 9' × 18' car stall at each lot front |

Three presets — **RV resort**, **Tiny village**, **Garden park** — set the whole rule
set at once.

## Shared facilities and services

Every facility is a row in the **Shared facilities** list with its own footprint in
feet (W × D) and a toggle: community gardens, orchard rows, dog park, pool & deck,
playground, sport court, picnic grove, fire circle, amphitheatre lawn, market pavilion
and EV charging, plus the buildings — clubhouse, bathhouse, laundry, workshop, storage,
bike workshop and outdoor kitchen. Footprints are targets: the generator fits what it
can and names anything it had to drop in **Notes**.

**Utilities** are three independent configurations, each of which changes what gets
drawn on the ground and how the services run:

| System | Options | What appears |
| --- | --- | --- |
| Power | grid · solar + grid tie · off-grid solar + battery · generator + battery | transformer pad, or ground-mount solar array with inverters, battery bank and generator yard |
| Water | county · well + treatment · hauled tanks · rainwater | meter vault, well house, tank farm or cisterns |
| Sewage | city sewer · septic · compost toilets | lift station and manholes, septic tanks with a drain field, or a compost toilet block with a greywater bed |

Each system draws a trunk alignment offset beside every lane, a service stub into every
lot, and a labelled inlet at the entry where the mains arrive. **Layers** in the panel
toggle Electric, Water and Sewage independently without regenerating the plan.

## Community core and parking

The core is not laid out the same way twice. With **Core arrangement** on `Auto` the
seed decides between two arrangements, and each one also varies in four further ways:

- **which flank of the plaza holds the buildings** — left or right, chosen per seed;
- **stacking direction** — buildings pack up from the bottom or down from the top;
- **one or two columns** — courts wider than about 170 ft take two columns side by side;
- **order** — buildings are placed biggest-first, so the column is no longer always
  office → bathhouse → laundry → workshop → storage.

| Arrangement | Layout |
| --- | --- |
| `compact` | All buildings on one flank, parking on the other, pool/pavilion joining whichever flank the seed picks. |
| `courtyard` | Buildings wrap both flanks of the plaza around the clubhouse; only resident parking stays at the core, and visitor parking moves into the peripheral bays below. |

## Parking location and sizing

**Parking location** (`edge` by default) keeps every stall at the perimeter. Bays are
reserved against the inside of the loop drive, at five depths each side, with the sites
nearest the entry end taken first; nothing is parked in the middle of the village.
Resident and visitor parking are both sited this way, so with parking out of the core
both flanks of the plaza are free for buildings. Switch the rule to `core` to allow a
parking court beside the plaza instead.

**Bays are sized from their stalls, not the other way round.** A reserved bay is fitted
to the stalls it holds: a 5-stall lot comes out 48 × 42 ft and a 9-stall lot 48 × 60 ft,
rather than a 56 × 60 ft apron with rows missing. Stalls spread evenly across the rows,
the last bay of a kind takes the remainder, and any reserved ground the fitted bay does
not use becomes a pocket of lawn instead of a gap in the row. If demand exceeds what the
perimeter can take, the plan says so in a note instead of quietly under-parking — and
conversely it never over-reserves: when the demand is small, the second bay is released
back to green.

**Visitor parking** can be concentrated or **distributed along the loop**: two bays at
different depths, so no lot is far from a visitor space. Distribution applies when
parking is sized from the lots; an explicit stall count is placed exactly, spread over
as many perimeter bays as it needs (24 visitor stalls becomes 12 + 12).

The schedule reports `Core` and `Parking location` separately.

## Footpaths and path character

Every lot gets a **door path** — a walk from the street-facing wall of the home out to
its frontage — plus links from the plaza to the clubhouse and each core building, and
a worn trail across any lawn large enough to hold one. Those paths are polylines, so a
curve is just a denser polyline: the junctions stay exactly where they are and the span
between them bulges, with a smoothstep offset so the ends meet the junction without a
kink.

**Path character** sets how hard they bend:

| Style | Amplitude | Where it shows |
| --- | --- | --- |
| `straight` | none | Ruled door paths; the plan reads as an engineered layout. |
| `gentle` | 7 ft | Door paths drift slightly, the entry drive eases, foot lanes curve. |
| `winding` | 30 ft | Worn trails across lawns, a strongly bowed entry drive, foot lanes that wander between clusters. |

Style also loosens the **hamlet clusters** in the organic pattern: cell jitter is 7 ft on
straight, 12 ft on gentle and 18 ft on winding, so clusters sit less on a grid.

Roads that lots front — the loop drive, band lanes, cross lanes — deliberately keep
their line: frontage, setback, utility trunks and lot stubs are all measured from that
centreline, and bending it would slide every lot off its own frontage. The curvature
lives in the pedestrian network, the entry drive and the foot lanes, which is where a
walk can afford to wander. The schedule reports total footpath length under `Pathways`.

## Cars, walking and bikes

Every line on the drawing carries a circulation mode, and the render shows it:

| Mode | What is in it | How it reads |
| --- | --- | --- |
| `car` | Loop drive, entry drive, band lanes, cross lanes, access stems and bridges | Paved, kerbed, with a dashed centreline |
| `walk` | Foot lanes, plaza and building links, door paths, lawn trails | Lighter surface, broken edge, no centreline; trails are dashed |
| `bike` | The loop drive carries a marked bike route, and every foot lane and trail takes bikes | Dashed route line set inside the carriageway |

A way becomes walk-only by its job, not by hand: anything named `Foot Lane` or drawn
narrower than 14 ft is a walking route, everything else is a vehicle street. That is
the rule behind the numbers — foot lanes appear as 3 walk-only ways in the organic
pattern and 8 in terrace, while bands, loops, grid, perimeter and rings are all car
streets plus pedestrian paths.

The schedule reports `Car roads`, `Walking` and `Bike route` in feet, and the title
block legend separates `CAR ROAD` from `WALK / BIKE`.

## Streets and access

A street that reaches nothing is a trap, so connectivity is a rule rather than a
side effect of the layout:

- **Block loops get access stems.** A loop courtyard is a closed ring, and a ring with
  lots packed round all four sides used to have no way in. Each block now reserves a
  16 ft stem on both flanks *before the lots are placed*, so the gap is left in the row
  and the loop meets the street outside it on two opposite sides. Hamlet clusters get a
  third stem on their centreline, because a cluster's only street is the foot lane that
  runs down the middle of the column.
- **Every street is proved to reach the network.** After the layout, the generator
  groups road centrelines into networks by whether their corridors actually touch
  (`(w₁+w₂)/2 + 5 ft`), takes the network containing the loop drive as the trunk, and
  bridges any straggler with a short access lane. Candidates are sampled along both
  roads and scored on length, and a bridge is only accepted if its corridor is clear of
  lots, buildings and parking — so access lanes run through gaps, never over a lot.
- The schedule reports `Streets` as networks and how many lanes had to be tied in.
  `Tie every street into the loop` in the panel turns the pass off, which is useful for
  seeing what the layouts actually produce: without it the organic clusters come out as
  seven separate networks.

Roads that lots front still keep their line, and every built plan now resolves to a
single network across all seven patterns and parcel shapes.

## Capacity

**People per home** and **guests per home** in the Rules panel drive the population
figures. The schedule reports residents, overnight guests at peak, peak population and
peak per acre; the title block carries the same numbers next to the services line.

| Stat | How it is calculated |
| --- | --- |
| Residents | lots × people per home |
| Guests at peak | lots × guests per home |
| Peak population | residents + guests |
| Peak per acre | peak population ÷ parcel acres |

The guest figure also feeds a parking check: if the visitor bay holds fewer stalls than
`ceil(guests ÷ 2.5)` guest cars, the plan says so in **Notes** instead of silently
under-parking. Defaults are 2 people and 1 guest per home; the presets vary them
(RV resort 2.2/1.5, tiny village 2.0/0.8, garden park 2.0/1.2).

## Parking

Parking is now drawn, counted and scheduled:

- **Visitor parking** — a single- or double-loaded bay beside the entry drive, next to
  the office, with stall divisions and a live stall count.
- **Resident parking** — a second bay above it for residents and overflow.
- **On-lot stalls** — each lot carries a marked car stall next to its pad, in addition
  to the RV pad itself.

Bays reserve ground before lots are placed, then their stall count is settled from the
final lot count (or from your explicit rule). The schedule and title block report
`visitor + resident` stalls separately from on-lot stalls.

## What else is generated

Tree-lined perimeter with a dashed property line and loop drive; entry drive and
drop-off plaza; clubhouse, office, bathhouse, laundry, workshop, storage, pool + deck,
pavilion, dump station; community garden with raised beds, greenhouse, tool shed,
orchard rows and a fenced dog park where the block allows; walkways, street names, lot
numbers, dimensions, north arrow, scale bar and a title block. Export as **SVG** or
**PNG**.

## How the layout works

All geometry is in feet in one coordinate space (`src/geom.js` is plain rects).

1. Inset the parcel by the buffer, run the loop drive inside that.
2. Choose a pattern (explicit, or seeded from the parcel's aspect).
3. Place the community core and garden **first** so their footprints are reserved,
   along with parking bays and the entry drive.
4. Lay lots along lanes/blocks. Every candidate lot is tested against roads,
   structures, parking, and other lots before it is accepted, so patterns degrade by
   skipping lots rather than overlapping them.
5. Fill leftovers with greens, orchard rows and planting; anything that does not fit is
   reported in **Notes**.
6. Portrait parcels are generated landscape and transposed at the end, with lot
   frontage and label rotation following the transform.

`src/rng.js` is a seeded PRNG (mulberry32 over an FNV hash); `Math.random` is never used
while drawing.

## Files

```
index.html        app shell and controls
styles.css        instrument-panel styling
src/main.js       input wiring, presets, stats, SVG/PNG export
src/generate.js   patterns, rules, core, gardens, lanes, lots, parking, planting
src/render.js     SVG drawing: two palettes, dimensions, north arrow, title block
src/geom.js       rect / polyline helpers
src/rng.js        seeded random + seed phrases
tools/check.mjs   headless geometry audit (parcel sweep, all patterns, rules)
tools/ui-smoke.mjs runs main.js against a DOM shim to catch wiring bugs
```

## Checks

```bash
npm run check          # geometry + parking + SVG audit
node tools/ui-smoke.mjs
```

`check.mjs` asserts: no non-finite values, no lot/lot or building/building overlap,
nothing outside the parcel, lots inside not crossing their own pavement, every stall
inside its bay and every bay clear of lots and buildings, stall totals consistent with
stats, no tree on a lot, and no `NaN` in either rendered theme — across a parcel sweep
and once per pattern.

## Research

[docs/walkability-study.md](docs/walkability-study.md) is a sourced study of Roman and
European urban form, the walkability evidence base, and the public/private interface —
with a derived rule set, a scorecard, and a section on where this generator already
complies and where it falls short.

## Limitations

This is a schematic massing study, not a construction document: no topography,
drainage, utilities, fire access radii, ADA routes, setbacks or local RV-park code.
Lot and building dimensions are typical ranges, not approvals.

## Tabs, calculator and ten-year P&L

The page has nine tabs: **Home**, **Site plan**, **Calculator**, **P&L · 10 years**,
**Roadmap**, **Slides**, **Documents**, **Team** and **Holons Coop brief**.

- **Calculator** (`src/model.js`, `src/model-ui.js`) is a capacity-linked model of the
  operating business: land and build costs, membership prices and dues, season
  length and occupancy, nightly rate, retreat, event and parking income, the
  60/40 owner–co-op lodging split, baseline and direct costs, inflation, property
  tax, TOT, capex reserve, debt terms and exit cap rate. Every variable is an
  input; the KPI row and funding bridge recalculate as you type.
- **P&L · 10 years** is the same projection as a spreadsheet: sticky line column
  and year header, demand, revenue, operating-expense and result blocks, terminal
  value, plus two editable rows of per-year overrides for occupancy and nightly
  rate (blank follows the growth curve). *Download CSV* exports the sheet.
- **Holons Coop brief** renders `docs/holons-coop/business-plan.md`, imported from
  the Desktop study together with its 44-slide deck.

Defaults are the plan's own numbers, and the model reproduces its arithmetic:
864 paid nights, $39,640 gross receipts, $18,144 owner pool, $13,730 incremental
costs, $7,766 net co-op contribution, 864/432/1,296-night scenarios, a $180,000
project budget and $190,000 of membership capital. `node tools/model-check.mjs`
asserts those figures before checking the ten-year identities (revenue parts, NOI,
cash flow, cumulative cash, DSCR, IRR solver, break-even, CSV shape);
`node tools/model-ui-smoke.mjs` checks the sheet and KPI markup.

Conventions worth knowing: the co-op view counts dues and its 40% lodging share,
so the owner payout is a memo line; TOT is a pass-through liability, never
revenue; membership capital funds the build rather than counting as income. A
loan is optional — at the plan's NOI a market-rate loan does not meet a 1.25×
DSCR, which is why the plan funds construction from memberships.

## Roadmap tab

`src/roadmap.js` adds a fifth tab: six gated phases over 104 weeks, 38 checklist
steps and a gate for each phase, from listing and title screening through
acquisition, design and approvals, build, the first season, and the second-parcel
decision.

The tab is wired to the others rather than a separate document:

- **Budgets** come from the calculator's build lines, and each line is assigned to
  exactly one phase (diligence; land + closing + legal; permits; site, water,
  wastewater, solar and contingency; opening reserve). The phases add up to the
  project cost, and editing the land price or a system allowance moves the phase
  budget with it.
- **Readiness chips** read the drawn plan (lots against modelled spaces, shared
  stalls against the plan's 24 + 4) and the ten-year projection (funding gap,
  year-1 NOI, minimum DSCR). Each chip is a button that opens the tab it came
  from, and every step has the same jump link.
- **Progress** is per phase and overall, persisted in local storage, with the next
  open gate named at the top.
- The Gantt strip shows the six phase windows and a tick per milestone week.

`node tools/roadmap-check.mjs` (or `npm run check:roadmap`) asserts the phase
budgets reconcile with the project cost under edits, progress maths, that a thin
plan and an unfunded model produce warnings, and that every step, gate and jump
link is present.

## Slides tab and the deck-derived design

`src/deck.js` is generated from `docs/holons-coop/deck.pptx` by parsing the OOXML
(slide order, background, placeholder text, tables), and `src/deck-ui.js` renders
the 44 slides as native HTML rather than slide images. Templates cover the deck's
own patterns: a cover, statement slides, table slides (27 of the 44) and card
grids built from short heading lines followed by body text. Navigation is arrows,
space, Home/End, `G` for the 44-tile overview, `F` for full screen, with the
current slide remembered in local storage.

Charts and pictures in the original deck are not reproduced; those slides carry a
"chart in original deck" note and the `.pptx` remains in `docs/holons-coop/`.

The interface uses a warm monochrome palette — cream `#F6F0E4`, navy
`#0E2841`, black `#0B0B0B` for headings, primary actions and highlights, and muted
beige `#D8CBB6` for soft surfaces — with an Apple-style system font stack,
pill controls, 16–20px card radii, hairline separators, frosted tab and table
headers, and a restrained type scale. The site plan itself stays dark as a
deliberate canvas card against the cream page.

`npm run check:deck` checks slide numbering, every title, table shape, escaping,
heading/body grouping and that all 44 slides render.

## Documents tab and the incorporation packet

`docs/incorporation/` holds a fourteen-document packet for Holons Coop, a proposed
California nonprofit mutual benefit corporation operating as a consumer
cooperative: filing index, articles, bylaws, organizational resolutions, conflict
of interest policy, the membership, occupancy, rental pool, guest and disclosure
documents, records and financial policies, a filing checklist and a formation
timeline.

The Documents tab lists every draft in a left-hand register, in packet order with
its status (4 ready to file or use, 5 for board adoption, 5 awaiting counsel and
DRE review), and renders the selected Markdown in the reading pane. Each draft
prints on its own and downloads as `.md`; `#/projects/lithium-city/documents/<id>`
deep-links straight to a document. Every tab, project, reserve state and document
has a hash address, and older `#documents/<id>` links still resolve.

`src/documents.js` holds the register — number, file, title, group, action,
status and signature block — and `tools/documents-check.mjs` (`npm run check:docs`)
asserts that every file exists and carries its expected clauses, that the register
in `00-filing-index.md` matches the metadata exactly, and that the nav and reading
pane render every document without `NaN`/`undefined`.

## Home tab

The Home tab is the landing page: a short statement of what the project is, the
key figures, and a tile for every other tab. `src/home.js` builds it from the same
sources as the rest of the site — membership spaces and capital from the
calculator's base case, step and slide counts from the roadmap and deck, and the
ready / adopt / counsel split from the document register — so the overview shows
the project's actual numbers rather than a second copy of them. The parcel size is
read from the currently drawn plan, and the jump buttons switch tabs through the
same router the tab bar uses.

`npm run check:home` asserts the figures against the model, that every tab has a
tile, that the document counts match the register, and that a jump button calls
the tab router.

The top bar carries **Contact Us**, which opens a contact sheet, and **Join Now**,
which opens the drafted membership subscription agreement. The co-op has no inbox
yet, so the sheet's address is a single placeholder constant (`CONTACT_EMAIL` in
`src/main.js`) to replace when one exists; no inquiry is sent from the page.
