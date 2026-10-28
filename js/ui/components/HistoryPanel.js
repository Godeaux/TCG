import { getHistoryStream } from '../../game/historyEvents.js';
import { describeEvent } from '../history/describeEvent.js';
import { renderCard } from './Card.js';
import { getCardDefinitionById } from '../../cards/index.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const iconNode = (label) => {
  const paths = {
    ATK: 'M4 3l13 13M3 3l1 5 4-4-5-1M13 15l3-3M4 17L17 4M3 17l5-1-4-4-1 5M13 5l3 3',
    HP: 'M10 17S2 12 2 6a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11Z',
    NUT: 'M4 16C1 5 10 2 17 2c1 8-3 14-11 13M4 18l9-11',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('history-stat-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[label]);
  svg.append(path);
  return svg;
};
const mobile = () => window.matchMedia('(max-width: 767px)').matches;
const decisionActive = () =>
  document.querySelector('.overlay.active') ||
  document.body.classList.contains('targeting-active') ||
  document.querySelector('#selection-panel')?.childElementCount > 0;
const glyph = (kind) =>
  ({
    attack: '⚔',
    consume: '♧',
    summon: '→',
    play: '↓',
    heal: '♡',
    draw: '▤',
    turn: '↻',
    transform: '⇄',
    reaction: 'ϟ',
  })[kind] || '✦';
const portrait = (entity) => {
  const box = el('div', 'history-portrait');
  if (entity?.kind === 'card' && /^[a-z0-9_-]+$/i.test(entity.cardId || '')) {
    const img = el('img');
    img.src = `images/cards/${entity.cardId}.jpg`;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener(
      'error',
      () => {
        img.remove();
        box.classList.add('history-missing-art');
      },
      { once: true }
    );
    box.append(img);
  } else
    box.append(
      el(
        'span',
        'history-placeholder',
        entity?.kind === 'player' ? '♡' : entity?.kind === 'unknown' ? '?' : '◇'
      )
    );
  return box;
};
const name = (entity) =>
  entity?.name || (entity?.kind === 'unknown' ? 'Unknown card' : 'Empty slot');
const stats = (entity, before) => {
  const row = el('div', 'history-stats');
  const add = (label, value, prior) => {
    if (value === null || value === undefined) return;
    const delta = typeof prior === 'number' ? value - prior : 0;
    const stat = el('span', delta > 0 ? 'gain' : delta < 0 ? 'loss' : '');
    stat.setAttribute(
      'aria-label',
      `${label} ${value}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`
    );
    stat.append(iconNode(label), el('b', '', String(value)));
    if (delta) stat.append(el('small', '', `(${delta > 0 ? '+' : ''}${delta})`));
    row.append(stat);
  };
  if (entity.kind === 'player') add('HP', entity.hp, before?.hp);
  if (entity.kind === 'card') {
    add('ATK', entity.currentAtk, before?.currentAtk);
    add('NUT', entity.nutrition, before?.nutrition);
    add('HP', entity.currentHp, before?.currentHp);
  }
  return row;
};
const tile = (entity, before, event, isAfter) => {
  const box = el('div', 'history-tile');
  box.append(portrait(entity), el('div', 'history-name', name(entity)));
  // Use only a public historical identity, never a live card instance. The
  // catalogue supplies printed rules; recorded stats/keywords remain authoritative.
  const definition = entity.kind === 'card' && getCardDefinitionById(entity.cardId);
  if (definition) {
    const preview = renderCard(
      {
        ...definition,
        ...entity,
        id: entity.cardId,
        abilitiesCancelled: entity.statusFlags?.abilitiesCancelled === true,
      },
      { showEffectSummary: true }
    );
    preview.classList.add('history-card-face');
    box.classList.add('history-full-card');
    box.prepend(preview);
  }

  if (entity?.kind === 'card' || entity?.kind === 'player') box.append(stats(entity, before));
  if (entity?.statusFlags?.barrier) box.classList.add('history-barrier');
  const terminal = isAfter && event.facts.find((f) => f.entity === entity.identity && f.terminal);
  if (terminal) {
    box.append(
      el(
        'div',
        'history-terminal',
        `${terminal.terminal === 'consume' ? 'Consumed' : event.kind === 'destroy' ? 'Destroyed' : event.kind === 'exile' ? 'Exiled' : terminal.terminal === 'sacrifice' ? 'Sacrificed' : 'Slain'} → ${terminal.zoneTo === 'void' ? 'Removed' : terminal.zoneTo || ''}`
      )
    );
    if (entity.currentHp === 0 && terminal.terminal !== 'consume')
      box.append(el('span', 'history-skull', '☠'));
  } else if (
    isAfter &&
    entity.kind === 'card' &&
    before?.kind === 'empty' &&
    ['play', 'summon'].includes(event.kind)
  ) {
    box.append(el('div', 'history-terminal', event.kind === 'summon' ? 'Summoned' : 'Played'));
  } else if (isAfter && entity.zone && entity.zone !== 'field' && before?.zone !== entity.zone)
    box.append(el('div', 'history-terminal', `→ ${entity.zone}`));
  return box;
};

let panel, list, detail, layout, backdrop, trigger, closeButton;
let currentState,
  currentStream,
  selectedId = null,
  pinnedId = null,
  lastEvent = null;
let modal = false,
  focusBefore = null,
  inerted = [];
const rows = new Map();
const eventById = (id) => currentStream?.events.find((e) => e.id === id);

const showDetail = (id) => {
  const event = eventById(id);
  if (!event) return;
  selectedId = id;
  for (const [key, row] of rows) row.setAttribute('aria-pressed', String(key === id));
  if (lastEvent === event) return;
  lastEvent = event;
  detail.replaceChildren();
  detail.classList.toggle(
    'history-single',
    event.before.length === 1 && event.after.length === 1 && !['turn', 'draw'].includes(event.kind)
  );
  detail.append(
    el(
      'p',
      'history-moment',
      `Turn ${event.turn} · ${event.kind[0].toUpperCase() + event.kind.slice(1)}`
    )
  );
  const groups = [];
  if (event.before.length > 2)
    detail.append(
      el('p', 'history-more', `${event.before.length} entities · Scroll sideways to see all`)
    );
  if (event.before.length && !['turn', 'draw'].includes(event.kind))
    for (const [label, group, isAfter] of [
      ['Before', event.before, false],
      ['After', event.after, true],
    ]) {
      detail.append(el('h4', 'history-time-label', label));
      const grid = el('div', 'history-duel');
      if (
        event.after.some(
          (e) =>
            e.kind === 'card' &&
            [e.currentAtk, e.currentHp, e.nutrition].some((n) => Math.abs(n) >= 10)
        )
      )
        grid.classList.add('history-dense');
      grid.style.setProperty('--entities', group.length);
      if (group.length > 2) {
        grid.classList.add('history-multi');
        grid.tabIndex = 0;
        grid.setAttribute('aria-label', `${label}: ${group.length} entities, scroll horizontally`);
        grid.addEventListener('scroll', () => {
          for (const other of groups)
            if (other !== grid && other.scrollLeft !== grid.scrollLeft)
              other.scrollLeft = grid.scrollLeft;
        });
      }
      groups.push(grid);
      group.forEach((entity, i) =>
        grid.append(tile(entity, isAfter ? event.before[i] : null, event, isAfter))
      );
      detail.append(grid);
    }
  const copy = describeEvent(event);
  detail.append(el('p', 'history-headline', copy.headline));
  const text = el('div', 'history-description');
  for (const line of copy.details) text.append(el('p', '', `${line.name}: ${line.line}`));
  detail.append(text);
  detail.scrollTop = 0;
};
const restoreInert = () => {
  for (const [node, old] of inerted) node.inert = old;
  inerted = [];
};
const close = (restoreFocus = true) => {
  if (!panel) return;
  layout.classList.remove('show-history');
  layout.classList.toggle('history-hidden', mobile());
  panel.removeAttribute('aria-modal');
  panel.setAttribute('role', 'region');
  backdrop.hidden = true;
  modal = false;
  restoreInert();
  trigger?.setAttribute('aria-expanded', String(!mobile()));
  if (restoreFocus && focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
  focusBefore = null;
};
const open = () => {
  if (decisionActive()) return;
  focusBefore = document.activeElement;
  layout.classList.remove('history-hidden');
  layout.classList.add('show-history');
  trigger?.setAttribute('aria-expanded', 'true');
  if (!mobile()) return;
  modal = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  backdrop.hidden = false;
  // Inert siblings along the ancestry path, never an ancestor of this dialog.
  let branch = panel;
  while (branch && branch !== document.body) {
    for (const sibling of branch.parentElement?.children || [])
      if (
        sibling !== branch &&
        sibling !== backdrop &&
        !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)
      ) {
        inerted.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
    branch = branch.parentElement;
  }
  closeButton.focus({ preventScroll: true });
};
export const toggleHistoryPanel = () => {
  initializeHistory();
  if (!panel) return;
  if (!mobile()) return;
  const visible = layout.classList.contains('show-history');
  if (visible) close();
  else open();
};
const initializeHistory = () => {
  if (panel) return;
  panel = document.querySelector('.battlefield-right-column');
  if (!panel) return;
  layout = panel.closest('.battlefield-layout-two-column');
  trigger = document.getElementById('field-history-btn');
  closeButton = document.getElementById('close-history');
  panel.id = 'history-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Game history');
  trigger?.setAttribute('aria-controls', panel.id);
  trigger?.setAttribute('aria-expanded', String(!mobile()));
  const host = document.getElementById('game-history-log');
  host.classList.add('visual-history');
  list = el('div', 'history-events');
  list.setAttribute('aria-label', 'History events');
  detail = el('section', 'history-detail');
  detail.setAttribute('aria-label', 'Event details');
  detail.tabIndex = 0;
  host.replaceChildren(list, detail);
  backdrop = el('button', 'history-backdrop');
  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', 'Close history');
  layout.append(backdrop);
  closeButton.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (!modal || event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]),[tabindex="0"]')].filter(
      (node) => node.getClientRects().length
    );
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  list.addEventListener('pointerleave', () => {
    if (!mobile() && pinnedId) showDetail(pinnedId);
  });
  window.addEventListener('resize', () => {
    if (modal && !mobile()) close();
  });
  new MutationObserver(() => {
    if (modal && decisionActive()) close(false);
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });
};

export const renderHistoryPanel = (state) => {
  initializeHistory();
  if (!panel) return;
  const stream = getHistoryStream(state);
  if (stream === currentStream) return;
  const prior = currentStream;
  currentStream = stream;
  if (
    !prior ||
    state !== currentState ||
    stream.sequence < prior.sequence ||
    stream.matchGeneration !== prior.matchGeneration
  ) {
    selectedId = null;
    pinnedId = null;
    lastEvent = null;
    list.scrollTop = 0;
  }
  currentState = state;
  const following = list.scrollTop < 30 && !pinnedId;
  const oldHeight = list.scrollHeight,
    oldTop = list.scrollTop;
  const ids = new Set(stream.events.map((e) => e.id));
  for (const [id, row] of rows)
    if (!ids.has(id)) {
      row.remove();
      rows.delete(id);
    }
  if (!stream.events.length) {
    detail.classList.remove('history-single');
    detail.scrollTop = 0;
    list.replaceChildren();
    detail.replaceChildren(el('p', 'history-empty', 'Select an event to see what changed.'));
    const legacy = (state.log || []).filter(
      (entry) => typeof entry === 'string' && !entry.startsWith('[Easy AI]')
    );
    for (const entry of legacy.slice(0, 200)) list.append(el('p', 'history-legacy', entry));
    if (!legacy.length)
      list.append(el('p', 'history-empty', 'Your match history will appear here.'));
    return;
  }
  list.querySelectorAll('.history-legacy,.history-empty').forEach((node) => node.remove());
  for (const event of stream.events) {
    let row = rows.get(event.id);
    if (!row) {
      row = el('button', 'history-event');
      row.type = 'button';
      row.dataset.eventId = event.id;
      row.addEventListener('click', () => {
        pinnedId = event.id;
        showDetail(event.id);
      });
      row.addEventListener('focus', () => showDetail(event.id));
      row.addEventListener('pointerenter', () => {
        if (!mobile()) showDetail(event.id);
      });
      rows.set(event.id, row);
      list.prepend(row);
    }
    if (row.historyEvent !== event) {
      row.historyEvent = event;
      row.setAttribute('aria-label', `Turn ${event.turn}. ${describeEvent(event).headline}`);
      const source =
        event.before.find((e) => event.sourceIds.includes(e.identity)) || event.after[0];
      const target =
        event.after.find((e) => event.targetIds.includes(e.identity)) || event.after.at(-1);
      row.replaceChildren(
        portrait(source),
        event.kind === 'consume'
          ? iconNode('NUT')
          : el('span', 'history-action', glyph(event.kind)),
        portrait(target),
        el('span', 'history-turn', `T${event.turn}`)
      );
    }
  }
  list.scrollTop = following ? 0 : oldTop + list.scrollHeight - oldHeight;
  const evicted = pinnedId && !ids.has(pinnedId);
  if (evicted) pinnedId = null;
  if (following || !ids.has(selectedId)) showDetail(stream.events.at(-1).id);
  else showDetail(selectedId);
  if (evicted) {
    const notice = el(
      'p',
      'history-selection-notice',
      'The selected event is no longer retained. Showing the latest event.'
    );
    notice.setAttribute('role', 'status');
    detail.prepend(notice);
  }
};
