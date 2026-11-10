// One route table for every pane, project, reserve flow and document.
// Hash routes keep deep links working on static hosting without rewrites.
import { projectById } from './projects.js';

export const DEFAULT_PROJECT = 'lithium-city';

const TAB_SLUG = {
  plan: 'plan',
  model: 'calculator',
  pl: 'pnl',
  roadmap: 'roadmap',
  deck: 'slides',
  documents: 'documents',
  team: 'team',
  brief: 'brief',
};

const GLOBAL_SLUG = {
  about: 'about',
  mission: 'mission',
  technology: 'technology',
};

const SLUG_TAB = Object.fromEntries(Object.entries(TAB_SLUG).map(([tab, slug]) => [slug, tab]));
const LEGACY_TAB = {
  plan: 'plan',
  model: 'model',
  pl: 'pl',
  roadmap: 'roadmap',
  deck: 'deck',
  documents: 'documents',
  team: 'team',
  brief: 'brief',
};

const cleanId = (id) => encodeURIComponent(String(id || '').trim());
const knownProject = (id) => (projectById(id) ? id : DEFAULT_PROJECT);

export function projectPath(id = DEFAULT_PROJECT, leaf = '', docId = '') {
  const base = `#/projects/${cleanId(knownProject(id))}`;
  if (!leaf) return base;
  return `${base}/${leaf}${docId ? `/${cleanId(docId)}` : ''}`;
}

export function propertyPath(id) {
  return `#/property/${cleanId(id)}`;
}

export function reservePath(id = null) {
  return id ? `${projectPath(id)}/reserve` : '#/reserve';
}

export function purchasePath(id = DEFAULT_PROJECT, parcelNumber = '') {
  return projectPath(id, 'purchase', parcelNumber);
}

export function routeFor(tab, projectId = null, { docId = null } = {}) {
  if (tab === 'home') return '#/';
  if (GLOBAL_SLUG[tab]) return `#/${GLOBAL_SLUG[tab]}`;
  if (tab === 'team' && !projectId) return '#/team';
  if (tab === 'project') return projectPath(projectId || DEFAULT_PROJECT);
  if (tab === 'reserve') return reservePath(projectId);
  if (tab === 'purchase') return purchasePath(projectId || DEFAULT_PROJECT, docId || '');
  if (tab === 'documents') return projectPath(projectId || DEFAULT_PROJECT, 'documents', docId || '');
  const slug = TAB_SLUG[tab];
  if (!slug) return '#/';
  return projectPath(projectId || DEFAULT_PROJECT, slug);
}

export function parseRoute(hash = '') {
  const path = String(hash || '').replace(/^#/, '').split('?')[0];
  const parts = path.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (!parts.length || parts[0] === 'home') return { tab: 'home', projectId: null, docId: null };
  if (parts[0] === 'about' || parts[0] === 'mission' || parts[0] === 'technology' || parts[0] === 'team') {
    return { tab: parts[0], projectId: null, docId: null };
  }
  if (parts[0] === 'reserve') return { tab: 'reserve', projectId: null, docId: null };
  if (parts[0] === 'projects') {
    const projectId = knownProject(parts[1]);
    const leaf = parts[2] || '';
    if (!leaf) return { tab: 'project', projectId, docId: null };
    if (leaf === 'reserve') return { tab: 'reserve', projectId, docId: null };
    if (leaf === 'purchase') return { tab: 'purchase', projectId, docId: parts[3] || null };
    if (leaf === 'documents') return { tab: 'documents', projectId, docId: parts[3] || null };
    const tab = SLUG_TAB[leaf];
    if (tab) return { tab, projectId, docId: null };
    return { tab: 'project', projectId, docId: null };
  }
  if (parts[0] === 'documents') {
    return { tab: 'documents', projectId: DEFAULT_PROJECT, docId: parts[1] || null };
  }
  if (parts[0] === 'property') {
    return { tab: 'property', projectId: null, docId: null, propertyId: parts[1] || null };
  }
  if (parts[0] === 'project') {
    return { tab: 'project', projectId: knownProject(parts[1]), docId: null };
  }
  if (LEGACY_TAB[parts[0]]) {
    return {
      tab: LEGACY_TAB[parts[0]],
      projectId: DEFAULT_PROJECT,
      docId: parts[0] === 'documents' ? parts[1] || null : null,
    };
  }
  return { tab: 'home', projectId: null, docId: null };
}
