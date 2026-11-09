// Shared capacity for the study. The site plan is the source of truth for how
// many spaces the parcel can hold; the calculator and the overview read this
// instead of assuming the 20-space filing base case.
let program = { spaces: 20, acres: 5.07, parking: 28 };
const listeners = new Set();

export function getProgram() {
  return { ...program };
}

export function setProgram(stats = {}) {
  const raw = stats.sites ?? stats.lots;
  if (raw == null || !Number.isFinite(Number(raw))) return getProgram();
  const spaces = Math.max(0, Math.round(Number(raw)));
  const acres = Number(stats.acres) > 0 ? Number(stats.acres) : program.acres;
  const parking = Number(stats.parking) >= 0 ? Number(stats.parking) : program.parking;
  const changed = spaces !== program.spaces || acres !== program.acres || parking !== program.parking;
  program = { spaces, acres, parking };
  if (changed) {
    for (const fn of listeners) {
      try {
        fn(getProgram());
      } catch {
        /* a listener must not be able to break the plan */
      }
    }
  }
  return getProgram();
}

export function onProgram(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
