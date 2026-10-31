const limits = () =>
  window.innerWidth <= 700 ? { min: 3, max: 5, key: 'mobile' } : { min: 2, max: 6, key: 'desktop' };
export function createCollectionDensity() {
  let anchor = null;
  const settings = {};
  const rows = () => {
    const l = limits();
    if (!settings[l.key]) {
      try {
        settings[l.key] = Number(localStorage.getItem(`tcg:collection-rows:${l.key}`)) || l.min;
      } catch {
        settings[l.key] = l.min;
      }
    }
    return Math.max(l.min, Math.min(l.max, settings[l.key]));
  };
  const capture = (grid) => {
    if (!grid) return;
    const left = grid.getBoundingClientRect().left;
    anchor =
      [...grid.querySelectorAll('[data-card]')].find(
        (el) => el.getBoundingClientRect().left >= left - 1
      )?.dataset.card || null;
  };
  const reset = () => {
    anchor = null;
  };
  const layout = (grid, nav) => {
    if (!grid || !nav) return;
    const count = rows();
    const height = Math.max(count * 44, window.innerHeight - grid.getBoundingClientRect().top - 86);
    const cardHeight = Math.floor((height - 8 - (count - 1) * 6) / count - 20);
    grid.dataset.artOnly = String(cardHeight / 1.4 < 180);
    grid.dataset.readableName = String(cardHeight / 1.4 >= 80);
    grid.style.setProperty('--collection-slot-width', `${Math.max(44, cardHeight / 1.4)}px`);
    grid.style.setProperty('--collection-rows', count);
    grid.style.setProperty('--collection-card-height', `${cardHeight}px`);
    grid.style.setProperty('--collection-card-width', `${cardHeight / 1.4}px`);
    grid.style.setProperty('--collection-scale', cardHeight / 294);
    grid.style.height = `${height}px`;
    const target = [...grid.querySelectorAll('[data-card]')].find(
      (el) => el.dataset.card === anchor
    );
    if (target)
      grid.scrollLeft +=
        target.getBoundingClientRect().left - grid.getBoundingClientRect().left - 4;
    nav.querySelector('[data-rows]').textContent = `${count} rows`;
    nav.querySelector('[data-pe="smaller-cards"]').disabled = count === limits().max;
    nav.querySelector('[data-pe="larger-cards"]').disabled = count === limits().min;
  };
  const change = (delta) => {
    const l = limits();
    settings[l.key] = Math.max(l.min, Math.min(l.max, rows() + delta));
    try {
      localStorage.setItem(`tcg:collection-rows:${l.key}`, settings[l.key]);
    } catch {
      /* Session preference still works. */
    }
  };
  return { rows, capture, reset, layout, change };
}
