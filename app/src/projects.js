// The Holons network. Lithium City is the only project with live data today;
// the other three are real slots in the network with terms still in formation.
export const NETWORK = {
  name: 'Holons',
  descriptor: 'A network of cohousing co-ops',
  promise: 'One owner record, many places to belong.',
  access: 'An owner record travels with you across the network. Each holon sets its own stay limits, dues, fees, land rights and membership contract, so access is always subject to that project and its availability.',
  reservation: 'A reservation records the project, membership type, land right and draft agreement you selected. It becomes a membership only after the co-op accepts it and the definitive documents are signed.',
};

export const PAYMENT_METHODS = [
  {
    id: 'ach',
    label: 'ACH bank transfer',
    provider: 'Plaid',
    detail: 'Lower-cost bank transfer. Secure account connection is not live yet; this saves your preference.',
  },
  {
    id: 'card',
    label: 'Debit or credit card',
    provider: 'Stripe',
    detail: 'Card checkout. Secure payment is not live yet; this saves your preference.',
  },
];

export const DATA_VIEWS = [
  { id: 'plan', title: 'Site plan', copy: 'The drawn village: parcels, lanes, community core, parking and utilities.' },
  { id: 'model', title: 'Calculator', copy: 'The live assumptions behind prices, dues, project cost and operations.' },
  { id: 'pl', title: 'Ten-year P&L', copy: 'The co-op pro forma year by year, with occupancy and rate overrides.' },
  { id: 'roadmap', title: 'Roadmap', copy: 'The gated path from site control to a reviewed first season.' },
  { id: 'deck', title: 'Slides', copy: 'The purchase and formation study as a native slide deck.' },
  { id: 'documents', title: 'Documents', copy: 'The incorporation packet, membership drafts and filing checklist.' },
  { id: 'team', title: 'Team', copy: 'The people behind the Holons network and the Lithium City study.' },
  { id: 'brief', title: 'Brief', copy: 'The full imported business plan, including its open questions.' },
];

export const PROJECTS = [
  {
    id: 'lithium-city',
    index: '01',
    name: 'Lithium City',
    location: 'Imperial Valley, California',
    region: 'Imperial County, CA',
    status: 'open',
    statusLabel: 'Reservation open',
    blurb: 'A tiny-home and RV cohousing village with a shared community core and a live parcel inventory.',
    image: 'assets/projects/lithium-city.jpg',
    imageAlt: 'Concept image: tents and a shared campfire among trees.',
    communityImage: 'assets/projects/lithium-city.jpg',
    communityImageAlt: 'Concept image: neighbors gathered around a shared campfire among trees.',
    description: 'Lithium City is the first active Holon: a resident-owned village on one co-op parcel in the Imperial Valley. The site plan and financial study are live, and reservations are open for the current parcel layout.',
    networkAccess: 'Lithium City owners can request time at other Holons projects under each project’s membership contract, availability, dues and local rules.',
    landRights: [
      {
        id: 'leasehold',
        label: 'Cooperative leasehold',
        status: 'included',
        summary: 'Exclusive use of your parcel while the co-op holds title to the land.',
        terms: 'Your membership includes an exclusive-use leasehold for the selected parcel. The co-op retains title to the land and improvements, and the lease terms, transfer rules and dues are set in the definitive membership documents.',
      },
      {
        id: 'undivided',
        label: 'Undivided land interest',
        status: 'review',
        summary: 'A fractional interest in the whole parcel, subject to counsel and DRE review.',
        terms: 'An undivided interest would give you a fractional title interest in the whole co-op parcel rather than a deed to one lot. This option is a study model only; it requires counsel, lender and DRE review before it can be reserved as a definitive land right.',
      },
      {
        id: 'deeded',
        label: 'Deeded parcel',
        status: 'future',
        summary: 'Not open for reservation; it needs separate feasibility and approvals.',
        terms: 'A deeded parcel is a separate legal product and is not part of this reservation. It requires subdivision, entitlement, financing and disclosure work before it can be offered.',
        disabled: true,
      },
    ],
  },
  {
    id: 'holon-02',
    index: '02',
    name: 'Holon 02',
    location: 'Site to be announced',
    region: 'Location in screening',
    status: 'coming-soon',
    statusLabel: 'Coming soon',
    blurb: 'A second cohousing cooperative is in site screening, with its own land and membership structure.',
    image: 'assets/projects/holon-02.jpg',
    imageAlt: 'Concept image: a canvas home opening onto a green valley.',
    communityImage: 'assets/network/shared-table.jpg',
    communityImageAlt: 'Concept image: a family sharing time outside a canvas home at dusk.',
    description: 'This Holon is still being shaped. The site, local membership terms and land rights will be published before reservations open.',
    planned: [
      'Land and water screening',
      'Local membership and land-right structure',
      'Reservation terms, dues and fees',
    ],
  },
  {
    id: 'holon-03',
    index: '03',
    name: 'Holon 03',
    location: 'Site to be announced',
    region: 'Location in screening',
    status: 'coming-soon',
    statusLabel: 'Coming soon',
    blurb: 'A third cohousing cooperative in the network, designed around a different landscape and member mix.',
    image: 'assets/projects/holon-03.jpg',
    imageAlt: 'Concept image: a tent beside a quiet lake at sunrise.',
    communityImage: 'assets/network/gathering.jpg',
    communityImageAlt: 'Concept image: a shared firepit and seating in a forest clearing.',
    description: 'This Holon is in concept development. Its membership types, land rights and reservation terms will be specific to the location.',
    planned: [
      'Site and entitlement review',
      'Membership and governance design',
      'Local pricing and reservation launch',
    ],
  },
  {
    id: 'holon-04',
    index: '04',
    name: 'Holon 04',
    location: 'Site to be announced',
    region: 'Location in screening',
    status: 'coming-soon',
    statusLabel: 'Coming soon',
    blurb: 'A fourth place in the network, planned to open after the first Holons prove the shared operating model.',
    image: 'assets/projects/holon-04.jpg',
    imageAlt: 'Concept image: a mountain ridge above open grassland.',
    communityImage: 'assets/network/network-hero.jpg',
    communityImageAlt: 'Concept image: two chairs facing a valley at sunset, set up for shared time.',
    description: 'This Holon is a future network slot. It will inherit the shared operating model while keeping its own local contract, dues and land rights.',
    planned: [
      'Network expansion review',
      'Local partnership and site search',
      'Membership and reservation terms',
    ],
  },
];

export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

export function projectById(id) {
  return PROJECT_BY_ID[id] || null;
}

export function isLiveProject(project) {
  return !!project && project.status === 'open';
}

export function landRightById(project, id) {
  return (project?.landRights || []).find((r) => r.id === id) || null;
}
