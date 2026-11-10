# Procedural Cities — Three.js / GitHub Pages

A procedural city generator running entirely in the browser using Three.js.

**[Live Demo](https://lanmower.github.io/Procedural-Cities/)**

## Algorithms

The city generation pipeline is a faithful JavaScript port of the original Unreal Engine C++ implementation:

### Road Network (roadGen.js)
Priority-queue driven road expansion guided by a simplex noise heatmap (ported from `Spawner.cpp`).

- A min-heap processes road candidates ordered by noise value at their endpoint
- Each accepted segment spawns forward continuation + left/right branches
- Main roads can branch into new main roads or secondary roads (`mainBranchChance`)
- Loose road ends extend up to `maxAttach` to connect to nearby roads

### Plot Extraction (plotGen.js)
City block polygon extraction from road segments (ported from `BaseLibrary::getSurroundingPolygons`).

- Each road segment produces two parallel side-lines
- Side-lines are split wherever they cross other roads
- Intersecting side-lines link into parent/child chains that form block polygons

### Building Generation (buildingGen.js)
Recursive polygon subdivision and extrusion (ported from `PlotBuilder` + `HouseBuilder`).

- Plot polygons are bisected along their longest edge until below max area
- Each footprint is extruded via `THREE.ExtrudeGeometry` to a random floor count

### Noise (noise.js)
2D Simplex noise ported from `simplexnoise.cpp` (Sebastien Rombauts / Stefan Gustavson).

## Running Locally

```
npm run cities     # from the repo root: serves docs on http://127.0.0.1:8520/
```

Or `npx serve docs`. Open the printed URL.

## GitHub Pages

Point GitHub Pages to the `/docs` folder in repository settings.

## Controls

| Action | Control |
|--------|---------|
| Orbit  | Left-drag |
| Zoom   | Scroll |
| Pan    | Right-drag |

## Rules panel

Every plan is a pure function of the seed and the rule set, and every rule redraws
the city as you move it. Presets (Village, Suburb, Mid-rise, Downtown, Organic) set
the whole set at once.

| Rule | Effect |
| --- | --- |
| City extent | accepted road segments before the generator stops |
| Main branch chance | share of main roads that branch into another main road |
| Block spacing | road spacing (one lever moves block count, lot depth and city span) |
| Growth bias | simplex noise scale: low gives compact growth, high gives sprawl |
| Street width | carriageway width scale (200 → 8 m main, 5 m secondary) |
| Smallest block | blocks under this area are dropped as slivers |
| Garden above | blocks over this area stay gardens instead of becoming one mega-lot |
| Lot size | target footprint per building; blocks are subdivided toward this |
| Min footprint | smallest piece worth extruding (a 12 × 16 m stair core must fit) |
| Setback | distance from the lot line to the building |
| Alley between buildings | gap left between buildings split out of one block |
| Sidewalk | apron width, also the gap between the lot line and the kerb |
| Min / max floors | storey range; tall floors need a large footprint |
| Share of lots built | fraction of buildable lots that get a building |
| Skyline variance | noise in the height field |
| Core height bias | taller toward the middle of the road network |
| Greenery | planting density |
| Layers | buildings, blocks, roads, sidewalks & planting, markings — toggled without regenerating |

## Why the geometry no longer overlaps

Blocks used to come from chaining road side-lines with a parent/child pointer
scheme. In this geometry that chain links the wrong pairs, so it produced small
fragments around junctions instead of blocks — and neighbouring fragments
overlapped, which is what stacked buildings on top of each other.

Blocks are now the bounded faces of the planar graph formed by the road
centrelines (`plotGen.js`): every centreline is split at every intersection and at
every branch (side roads start at their parent's edge, so the end is stitched back
to the nearest centreline — inside the carriageway, never across a block), then
the half-edge cycles are walked to recover the faces. Faces are disjoint by
construction; each is inset to the lot line, cleaned of duplicate and collinear
vertices, and insets that would fold fall back to a scaling inset that cannot
self-intersect. Buildings are then set back from the lot line, subdivided toward
the lot size, given an alley between pieces, and capped in height by footprint
area and distance from the centre.

## Checks

```bash
node tools/city-check.mjs      # or: npm run check:cities
```

Asserts, across every preset and three seeds: no block overlaps another, every
building footprint lies inside its own block, no two footprints overlap, floors
stay inside the rule range, footprints stay above the minimum, and no NaN reaches
a mesh polygon (including the interior planner's output).

## License

MIT

## RV park mode

`docs/park.html` (open it from the same server: `/park.html`) is the RV /
motorhome park version of this generator. You define an area first — a
rectangle, an L-shape, an oval, or a boundary you trace by clicking corners on
the ground — and the generator fills it:

* **Sites** on a grid aligned to the area's minimum-area rectangle, in rows of
  one or two back-to-back, so each site fronts a drive aisle.
* **Facilities** in the entrance band: reception, amenity block, laundry and
  showers, pool, playground and dump station. Each is searched along the
  frontage and a little further in until it fits inside the boundary.
* **Gardens** between back-to-back rows, an allotment in the second bed, and a
  planted green edge inside the boundary.
* **Roads** as a single network: a perimeter drive inside the boundary, aisles
  that end on it, and an entrance drive through the planting edge onto it.
  `driveWidth` sets the loop width; `0` leaves the aisles as separate strips.
* **Footpaths** along every aisle and down the middle of each planting strip,
  each spanning the pad so it joins the perimeter drive at both ends. `pathWidth`
  sets the width, and the audit checks that no footpath crosses a site.
* **Cross paths** every few site columns (`crossEvery`), perpendicular to the
  aisles and running the full depth of the park, so the grid can be crossed
  without going round the perimeter. A corridor replaces a column of sites, so it
  costs capacity.
* **Facilities** are shuffled and scattered by the seed — different order,
  different point along the frontage, and up to two moved to the far edge — so
  the community blocks are not always stacked in the same corner.
* **Path rings** around every footprint, held off the walls with a spur into the
  aisle network, plus cross paths that bypass a building rather than stopping at
  it. The audit checks that no footpath cuts through a block on any seed.
* **Town square**: a paved plaza about 3:2 (`squareWidth`), ringed by its own
  street, with the reception on it facing the open centre and footways round the
  edge. The aisle, footway and bed strips are cut around the square block, so the
  grid meets the square instead of running through it.

Levers (`parkRules.js`): width, depth, rotation, green edge and perimeter drive; pitch width and
depth, gap, hardstanding inset, aisle width, rows per aisle, occupancy, site cap,
facility frontage, bed depth and planting. Four presets — Motorhome, Caravan,
Resort, Rustic — and seven layer toggles.

`npm run check:park` runs the layout over every preset and seed plus three
awkward drawn boundaries (an L, a concave wedge, a rotated strip) and asserts
that sites are pitch-sized and inside the area, and that sites, roads, facilities
and beds overlap by less than 0.01 m². Overlap is measured as intersection area,
not as a boolean edge test: clipped bands legitimately share an edge with the
rows they serve, and two rectangles of equal width have only collinear edges.

## Eco village (organic) layout

Pattern `village` switches the fill from the band engine to `villageGen.js`. The
row engine cannot produce this: bands are straight by construction, so no amount
of jitter makes a lane bend. The village engine works from curves instead:

* The **spine** is a Chaikin-smoothed polyline through jittered control points
  that leaves the entrance green and wanders across the site; the seed and the
  **street wander** lever move it.
* **Branches** peel off the spine and end in cul-de-sac heads.
* Roads are swept as **ribbons** — a quad per segment plus a disc at every joint
  — which is what makes a curve read as a curve rather than a chain of corners.
* Each **cluster** is a circle of cottages rotated individually to face a shared
  court, with a private plot behind. Clusters are found by walking a jittered
  lattice finer than the cluster footprint and keeping the positions the streets
  and the green leave free.
* Shared buildings are placed first, at the free spot nearest the green, then the
  veg garden (26 beds in a 3 × 5 grid), orchard, parking (painted bays off an access lane) and pond fill leftover
  space; footpaths run from each court to the nearest point on the spine and only
  the pieces that clear the cottages are kept.

The audit adds six village scenes (three seeds, an L-shaped drawn parcel, a
crowded 7-cluster layout and a rotated oval) to the 517 checks: 19–22 cottages in
4–5 clusters, five shared buildings, 15 allotment beds, ~80 footpath segments and
14–23 distinct street headings, with worst-case overlaps under 0.004 m².
