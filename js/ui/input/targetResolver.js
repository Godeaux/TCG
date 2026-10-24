/** Shared hit geometry only. GameController and existing legality checks decide actions. */
export const resolveDropTarget = (element, { allowField = false } = {}) => {
  if (!element?.closest) return null;
  if (
    element.closest(
      '.overlay,.history-backdrop,.battlefield-right-column,.card-hover-tooltip,[inert]'
    )
  )
    return null;
  // Buttons inside an identity strip are controls, not face targets.
  if (element.closest('button,a,input,select,textarea')) return null;
  return element.closest(
    allowField
      ? '.card,.field-slot,.player-badge[data-player-index],.player-field'
      : '.card,.field-slot,.player-badge[data-player-index]'
  );
};
