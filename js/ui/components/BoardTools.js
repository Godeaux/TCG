// Keep one set of live pile controls/counts and move it at the board breakpoint.
let initialized = false;
export function initBoardTools() {
  if (initialized) return;
  const menu = document.querySelector('.board-diagnostics');
  const piles = document.querySelector('.piles-grid');
  const section = document.querySelector('.piles-section');
  const panel = menu?.querySelector('.board-tools-panel');
  if (!menu || !piles || !section || !panel) return;
  initialized = true;
  const mobile = window.matchMedia('(max-width: 767px)');
  const place = () => {
    menu.open = false;
    (mobile.matches ? panel : section).prepend(piles);
  };
  place();
  mobile.addEventListener('change', place);
  piles.addEventListener('click', () => {
    menu.open = false;
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
}
