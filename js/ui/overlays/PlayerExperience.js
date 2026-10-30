import { createCollectionDensity } from '../collectionDensity.js';
import { applyServerEconomy } from '../../network/serverEconomy.js';
import { craftCost, extraDust } from '../../network/dustEconomy.js';
import { CARD_ART_IDS } from '../../cardArtIds.js';
import { getAllCards } from '../../cards/index.js';
import { renderCard } from '../components/Card.js';
import { showCardTooltip } from '../components/CardTooltip.js';
import {
  renderStyledName,
  NAME_EFFECTS,
  NAME_FONTS,
  NAME_COLORS,
} from '../components/StyledName.js';
import { RARITIES, RARITY_COLORS, RARITY_LABELS } from '../../packs/packConfig.js';
import {
  profileAppearance,
  withProfileAppearance,
  collectionOwnership,
  filterCollection,
} from '../playerExperienceModel.js';
import {
  getDustEconomyClient,
  fetchFriendships,
  fetchPublicProfile,
  searchUserByUsername,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriendship,
  subscribeToFriendships,
  unsubscribeFromFriendships,
  updateProfileNameStyle,
} from '../../network/supabaseApi.js';
import { isUserOnline, subscribeToOnlineStatus } from '../../network/presenceManager.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const displayCount = (value) =>
  Number(value) > 9999
    ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 0 }).format(value)
    : String(value);
const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const swords = icon(
  'M4 3l16 17M3 3l1 6 5-5-6-1m11 13 4-4m-2 8 4-4M20 3 4 19m17-16-1 6-5-5 6-1M10 16l-4-4m2 8-4-4'
);
const hammer = icon('M14 3l7 7-4 4-3-3-8 10-3-3 10-8-3-3 4-4');
const recycleIcon = icon('M5 8a8 8 0 0 1 14-2l2 3M21 3v6h-6M19 16a8 8 0 0 1-14 2l-2-3M3 21v-6h6');
const density = createCollectionDensity();
let crafting = false;
let filtersOpen = false;
const filterIcon = icon('M3 5h18l-7 8v6l-4 2v-8L3 5');
let craftCard = null;
const person = icon('M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2');
const defaults = () => ({
  query: '',
  ownership: 'owned',
  animal: 'all',
  rarity: 'all',
  sort: 'name',
  page: 0,
});
let state,
  callbacks,
  root,
  page,
  accountId,
  epoch = 0;
let stage = null,
  publicProfile = null,
  publicCollection = false,
  filters = defaults(),
  selectedId = null,
  inspected = false;
let friends = { accepted: [], incoming: [], outgoing: [] },
  friendsLoading = false,
  friendsLoaded = false,
  friendError = '';
let channel,
  offPresence,
  showOffline = false,
  notice = '',
  busy = false,
  profileLoading = false;
let dialog,
  dialogTrigger,
  artDraft,
  pickerField = null,
  pickerQuery = '',
  pickerPage = 0;
const catalog = () => getAllCards().filter((c) => !c.isToken);
const validIds = () =>
  new Set(
    catalog()
      .filter((c) => CARD_ART_IDS.has(c.id))
      .map((c) => c.id)
  );
const appearance = (profile) => profileAppearance(profile?.name_style, validIds());
const image = (id) => `images/cards/${encodeURIComponent(id)}.jpg`;
const own = () => state?.menu?.profile;
const target = () => publicProfile || own();
const ownership = () => collectionOwnership(target()?.ownedCards);
const btn = (action, label, cls = '', extra = '') =>
  `<button type="button" class="${cls}" data-pe="${action}" ${extra}>${label}</button>`;
const empty = (text) => `<p class="pe-empty" role="status">${esc(text)}</p>`;
const visible = () => ['profile', 'collection', 'friends'].includes(state?.menu?.stage);

export function resetPlayerExperience() {
  epoch++;
  clearInterval(friendsRefreshTimer);
  friendsRefreshTimer = null;
  if (channel) unsubscribeFromFriendships(channel);
  offPresence?.();
  channel = null;
  offPresence = null;
  accountId = null;
  friends = { accepted: [], incoming: [], outgoing: [] };
  friendsLoading = false;
  friendsPromise = null;
  friendsLoaded = false;
  friendError = '';
  publicProfile = null;
  publicCollection = false;
  stage = null;
  filters = defaults();
  density.reset();
  crafting = false;
  filtersOpen = false;
  craftCard = null;
  selectedId = null;
  inspected = false;
  busy = false;
  profileLoading = false;
  notice = '';
  closeDialog();
  root?.classList.remove('active');
}
function go(next) {
  closeDialog();
  publicProfile = null;
  publicCollection = false;
  inspected = false;
  notice = '';
  callbacks.onNavigate?.(next);
}
function redraw() {
  if (visible()) draw();
}
let friendsPromise = null;
let friendsRefreshTimer = null;
function loadFriends() {
  if (!accountId) return Promise.resolve();
  if (friendsPromise) return friendsPromise;
  const token = epoch,
    id = accountId;
  const previous = JSON.stringify(friends);
  const hadError = Boolean(friendError);
  const initial = !friendsLoaded;
  friendsLoading = true;
  friendError = '';
  if (initial) redraw();
  friendsPromise = (async () => {
    try {
      const data = await fetchFriendships({ profileId: id });
      if (token !== epoch) return;
      friends = data;
      friendsLoaded = true;
    } catch (error) {
      if (token === epoch) friendError = error.message || 'Unable to load friends.';
    } finally {
      if (token === epoch) {
        friendsLoading = false;
        friendsPromise = null;
        const changed = previous !== JSON.stringify(friends);
        if (initial || changed || hadError || friendError) redraw();
        if (changed && dialog?.open && dialog.getAttribute('aria-label') === 'Friend requests')
          requestsDialog();
      }
    }
  })();
  return friendsPromise;
}
function setupAccount() {
  const id = own()?.id || null;
  if (accountId === id) return;
  resetPlayerExperience();
  accountId = id;
  if (!id) return;
  offPresence = subscribeToOnlineStatus(() => redraw());
  channel = subscribeToFriendships({ profileId: id, onUpdate: () => loadFriends() });
  // Realtime can be unavailable or miss an event during reconnect. Reconcile only
  // while a player screen is visible, without requiring a manual page refresh.
  friendsRefreshTimer = setInterval(() => {
    if (visible() && !document.hidden && !busy) loadFriends();
  }, 10000);
}
function shell() {
  return `<header class="pe-top"><div class="pe-brand">FOOD CHAIN<small>TRADING CARD GAME</small></div><nav>${btn('home', '← Home', 'pe-quiet')}${btn('profile', person, 'pe-icon pe-quiet', 'aria-label="Your profile"')}</nav></header><div class="pe-page"></div>`;
}
export function renderPlayerExperience(nextState, nextCallbacks = {}) {
  state = nextState;
  callbacks = nextCallbacks;
  if (!root) {
    root = document.createElement('section');
    root.id = 'player-experience';
    root.className = 'overlay';
    root.setAttribute('aria-label', 'Player screens');
    document.body.append(root);
    root.addEventListener('click', handleClick);
    document.addEventListener('duel-invite-received', closeDialog);
    root.addEventListener('input', handleInput);
    root.addEventListener('change', handleChange);
    window.addEventListener('resize', () => {
      density.capture(root.querySelector('.pe-density-grid'));
      redraw();
    });
    document.addEventListener('keydown', (e) => {
      if (!visible() || e.key !== 'Escape' || dialog?.open) return;
      if (filtersOpen) {
        filtersOpen = false;
        draw();
        root.querySelector('[data-pe="toggle-filters"]')?.focus();
        return;
      }
      if (inspected) {
        inspected = false;
        draw();
      } else if (publicCollection) {
        publicCollection = false;
        draw();
      } else if (publicProfile) {
        publicProfile = null;
        draw();
      }
    });
  }
  setupAccount();
  const active = visible();
  root.classList.toggle('active', active);
  root.setAttribute('aria-hidden', String(!active));
  root.inert = !active;
  if (!active) {
    closeDialog();
    stage = null;
    return;
  }
  if (stage !== state.menu.stage) {
    stage = state.menu.stage;
    publicProfile = null;
    publicCollection = false;
    inspected = false;
    notice = '';
    if (stage === 'collection' && !own()) filters.ownership = 'all';
    if (stage === 'friends' && accountId) loadFriends();
  }
  draw();
}
function footer(message = '') {
  return `<footer class="pe-foot"><span>${esc(message)}</span><span class="pe-notice" role="status">${esc(notice)}</span></footer>`;
}
function tile(card, rarity, chosen = false, compact = false) {
  const color = RARITY_COLORS[rarity] || '#54727a';
  const count =
    target()?.cardFinishes?.find((f) => f.card_id === card.id && RARITIES[f.rarity_rank] === rarity)
      ?.quantity ?? (rarity ? 1 : 0);
  return `<button type="button" class="pe-tile ${chosen ? 'selected' : ''} ${rarity ? '' : 'unowned'}" data-card="${esc(card.id)}" aria-label="Inspect ${esc(card.name)}${compact ? `, ${esc(RARITY_LABELS[rarity] || 'not collected')}, ${count} owned` : ''}" style="--rarity:${color}"><span class="pe-card" data-render="${esc(card.id)}" data-finish="${esc(rarity || '')}"></span><span class="pe-rarity"><i></i>${compact ? displayCount(count) : esc(RARITY_LABELS[rarity] || 'Not collected')}</span></button>`;
}
function options(values, chosen) {
  return values
    .map(
      ([id, label]) =>
        `<option value="${esc(id)}" ${id === chosen ? 'selected' : ''}>${esc(label)}</option>`
    )
    .join('');
}
function collection() {
  const owned = ownership();
  const list = filterCollection(catalog(), owned, filters);
  const selected = list.find((c) => c.id === selectedId) || list[0];
  selectedId = selected?.id || null;
  const slice = list;
  const signed = Boolean(own()?.id);
  const readOnly = publicCollection;
  const unloaded = signed && !readOnly && own().ownedCards === undefined;
  return `<div class="pe-heading"><div><h1>${readOnly ? `${esc(publicProfile.username)}’s collection` : 'My Cards'}</h1></div>${readOnly ? btn('public-back', '← Profile', 'pe-quiet') : `<nav class="pe-tabs">${btn('decks', 'Decks', 'pe-quiet')}${btn('collection', 'Collection', 'selected pe-quiet')}</nav>`}</div>
  <div class="pe-collection pe-dense-collection"><section class="pe-browser">${!readOnly ? craftingToolbar() : ''}<div class="pe-tools"><input id="pe-search" type="search" aria-label="Search cards or keywords" placeholder="Search cards" value="${esc(filters.query)}">${btn('toggle-filters', filterIcon, 'pe-filter-toggle pe-icon', `aria-label="Filter cards" aria-expanded="${filtersOpen}" aria-controls="pe-filter-options"`)}${!readOnly ? btn(signed ? 'packs' : 'login', signed ? `Packs <b>${Number(own().packs) || 0}</b>` : 'Log in', '', signed && !(own().packs > 0) && !own().pendingPackOpening ? 'disabled' : '') : ''}</div>
  <div id="pe-filter-options" class="pe-filters ${filtersOpen ? 'is-open' : ''}"><select id="pe-ownership" aria-label="Ownership">${options(
    [
      ['owned', 'Owned'],
      ['all', 'All cards'],
    ],
    filters.ownership
  )}</select><select id="pe-animal" aria-label="Animal category">${options(
    [
      ['all', 'All animals'],
      ['fish', 'Fish'],
      ['bird', 'Bird'],
      ['mammal', 'Mammal'],
      ['reptile', 'Reptile'],
      ['amphibian', 'Amphibian'],
    ],
    filters.animal
  )}</select><select id="pe-rarity" aria-label="Rarity">${options([['all', 'All rarities'], ...Object.entries(RARITY_LABELS)], filters.rarity)}</select><select id="pe-sort" aria-label="Sort cards">${options(
    [
      ['name', 'Name A–Z'],
      ['rarity', 'Rarity'],
    ],
    filters.sort
  )}</select></div>
  ${unloaded ? empty(state.menu.collectionError || 'Loading your collection…') + (state.menu.collectionError ? btn('retry-collection', 'Retry') : '') : ''}<div class="pe-grid pe-density-grid">${!unloaded && slice.length ? slice.map((c) => tile(c, owned.get(c.id), c.id === selectedId, true)).join('') : !unloaded ? empty('No cards match. Try All cards or reset the filters.') + btn('reset-filters', 'Reset filters', 'pe-quiet') : ''}</div>
  <div class="pe-pagination"><span data-rows>${density.rows()} rows</span><div>${btn('smaller-cards', '−', 'pe-icon', 'aria-label="Smaller cards"')}${btn('larger-cards', '+', 'pe-icon', 'aria-label="Larger cards"')}${btn('prev-page', '←', 'pe-icon', 'aria-label="Previous cards"')}${btn('next-page', '→', 'pe-icon', 'aria-label="Next cards"')}</div></div></section></div>${footer(readOnly ? 'Read-only collection' : !signed ? 'Log in to save a collection.' : '')}
  ${inspected && selected ? `<section class="pe-mobile-inspection"><div class="pe-inspection-top">${btn('close-inspect', '← Collection', 'pe-quiet')}<span>${esc(RARITY_LABELS[owned.get(selected.id)] || 'Not collected')}</span></div>${inspector(selected, owned.get(selected.id))}<div class="pe-inspect-nav">${btn('prev-card', '← Previous', 'pe-quiet')}${btn('next-card', 'Next →', 'pe-quiet')}</div></section>` : ''}`;
}
function craftingToolbar() {
  const enabled = Array.isArray(own()?.cardFinishes);
  const extras = extraDust(own()?.cardFinishes);
  let pending = false;
  try {
    pending = own()?.id && getDustEconomyClient().pending(own().id);
  } catch {
    /* surfaced on action */
  }
  return `<div class="pe-craft-toolbar"><div>${btn('browse-tab', 'Browse', crafting ? '' : 'selected')}${btn('craft-tab', hammer + ' Craft', crafting ? 'selected' : '', enabled ? '' : 'disabled title="Crafting requires a server-verified collection"')}</div><div><span class="pe-dust" aria-label="Dust balance: ${Number(own()?.dust) || 0}" title="${Number(own()?.dust) || 0} dust">✧ ${displayCount(Number(own()?.dust) || 0)}</span>${btn('recycle-extras', recycleIcon + ` +${displayCount(extras)}`, 'pe-recycle', `aria-label="Recycle extras for ${extras} dust" title="Recycle extras — keep one of every finish" ${!enabled || busy || !extras || pending ? 'disabled' : ''}`)}${pending ? btn('recover-dust', 'Retry', '', busy ? 'disabled' : '') : ''}</div></div>`;
}
function openCraft(id, rank) {
  craftCard = id;
  const card = catalog().find((c) => c.id === id);
  if (!card || !Array.isArray(own()?.cardFinishes)) return;
  const counts = RARITIES.map(
    (_, i) => own().cardFinishes.find((f) => f.card_id === id && f.rarity_rank === i)?.quantity || 0
  );
  rank =
    rank ??
    Math.max(
      0,
      counts.findIndex((n) => n === 0)
    );
  showDialog(
    card.name,
    `<div class="pe-craft-content"><div class="pe-craft-preview"></div><div class="pe-craft-finishes"><div class="pe-craft-labels"><span>Finish</span><span>Owned</span><span title="${own().dust} dust">✧ ${displayCount(own().dust)}</span></div>${RARITIES.map((r, i) => `<div class="pe-craft-row">${btn('preview-finish', `<i style="background:${RARITY_COLORS[r]}"></i>${RARITY_LABELS[r]}`, 'pe-finish-name', `data-rank="${i}" aria-pressed="${rank === i}"`)}<span title="${counts[i]} owned">${displayCount(counts[i])}</span>${counts[i] ? '<span class="pe-finish-owned">✓ Owned</span>' : btn('craft-finish', hammer + craftCost(i), 'pe-craft-price', `data-rank="${i}" aria-label="Craft ${RARITY_LABELS[r]} for ${craftCost(i)} dust" ${busy || own().dust < craftCost(i) ? 'disabled' : ''}`)}</div>`).join('')}</div></div>`
  );
  dialog.classList.add('pe-crafting-dialog');
  dialog
    .querySelector('.pe-craft-preview')
    .append(
      renderCard(
        { ...card, rarity: RARITIES[rank] },
        { showEffectSummary: true, useBaseStats: true }
      )
    );
}
async function runDust(action, button) {
  if (busy || !Array.isArray(own()?.cardFinishes)) return;
  const profile = own(),
    token = epoch,
    client = getDustEconomyClient();
  const id = craftCard,
    rank = Number(button.dataset.rank);
  busy = true;
  button.disabled = true;
  dialog?.querySelectorAll('[data-pe="craft-finish"]').forEach((b) => (b.disabled = true));
  redraw();
  try {
    const result = await (action === 'craft-finish'
      ? client.craft(profile.id, id, rank)
      : action === 'recycle-extras'
        ? client.recycle(profile.id)
        : client.recover(profile.id));
    if (token !== epoch || own() !== profile) return;
    applyServerEconomy(profile, result.economy);
    client.finish(profile.id, result.receipt.operation_id);
    notice =
      result.receipt.action === 'recycle' ? `+${result.receipt.dust_delta} dust` : 'Finish crafted';
    busy = false;
    if (dialog?.open && action === 'craft-finish') openCraft(id, rank);
  } catch (error) {
    if (token === epoch) fail(error);
  } finally {
    if (token === epoch) {
      busy = false;
      if (dialog?.open)
        dialog
          .querySelectorAll('[data-pe="craft-finish"]')
          .forEach((b) => (b.disabled = own().dust < craftCost(Number(b.dataset.rank))));
      redraw();
    }
  }
}
function inspector(card, rarity) {
  return `<div class="pe-full-card" style="--rarity:${RARITY_COLORS[rarity] || '#54727a'}" data-render="${esc(card.id)}" data-finish="${esc(rarity || '')}"></div><div class="pe-card-detail"><h2>${esc(card.name)}</h2><p>Best owned rarity · ${esc(RARITY_LABELS[rarity] || 'Not collected')}</p><p>${esc(card.flavorText || '')}</p></div>`;
}
function relation(id) {
  return [...friends.accepted, ...friends.incoming, ...friends.outgoing].find(
    (f) => f.friendId === id
  );
}
function profileScreen(profile, mine) {
  if (!profile)
    return `<h1>Your profile</h1>${empty('Log in to save your collection and personalize your profile.')}${btn('login', 'Log in', 'primary')}`;
  const art = appearance(profile);
  const stats = profile.stats || {};
  const played = Math.max(0, Number(stats.gamesPlayed) || 0),
    won = Math.max(0, Number(stats.gamesWon) || 0);
  const rel = !mine ? relation(profile.id) : null;
  const accepted = rel?.status === 'accepted';
  const cards = catalog();
  const owned = collectionOwnership(profile.ownedCards);
  const preview = filterCollection(cards, owned, { ...defaults(), sort: 'rarity' }).slice(0, 3);
  const fav = cards.find((c) => c.id === stats.favoriteCard || c.name === stats.favoriteCard);
  const action = mine
    ? btn('appearance', 'Edit appearance')
    : accepted
      ? btn(
          'invite',
          `${swords} Invite to play`,
          'primary',
          `data-friend="${esc(profile.id)}" ${!isUserOnline(profile.id) || busy ? 'disabled' : ''}`
        )
      : rel?.status === 'pending'
        ? btn('requests', rel.isRequester ? 'Request sent' : 'Respond to request')
        : btn('add-profile', 'Add friend', 'primary');
  return `<div class="pe-public-back">${!mine ? btn('public-back', '← Friends', 'pe-quiet') : ''}</div><section class="pe-hero"><img class="pe-banner" src="${image(art.bannerArt)}" alt=""><div class="pe-hero-wash"></div><div class="pe-profile-identity"><img class="pe-avatar" src="${image(art.avatarArt)}" alt=""><div><h1 data-styled-name></h1>${!mine ? `<p class="pe-presence ${isUserOnline(profile.id) ? 'online' : ''}">${isUserOnline(profile.id) ? 'Online' : 'Offline'}</p>` : ''}</div></div></section>
  <div class="pe-profile-actions"><span>${mine ? 'Your profile' : accepted ? '✓ Friends' : rel?.status === 'pending' ? 'Request pending' : ''}</span><div>${action}${!mine && accepted ? btn('friend-menu', '…', 'pe-icon pe-quiet', `data-friend="${esc(profile.id)}" aria-label="Friend options"`) : ''}</div></div>
  <div class="pe-profile-body"><section class="pe-career"><h2>Career</h2><div class="pe-stats"><div><strong>${played}</strong><span>Played</span></div><div><strong>${won}</strong><span>Won</span></div><div><strong>${played ? Math.round((won / played) * 100) : '—'}${played ? '%' : ''}</strong><span>Win rate</span></div></div>${fav ? `<div class="pe-favorite"><img src="${image(fav.id)}" alt=""><div><span>Favorite card</span><p>${esc(fav.name)}</p></div></div>` : ''}<div class="pe-favorite"><img src="${image(art.favoriteArt)}" alt=""><div><span>Favorite art</span><p>${esc(cards.find((c) => c.id === art.favoriteArt)?.name || 'Orca')}</p></div></div>${mine ? btn('history', 'Match history →', 'pe-quiet') : ''}</section>
  <section class="pe-profile-collection"><div class="pe-heading"><h2>Collection</h2>${btn(mine ? 'collection' : 'public-collection', 'View all →', 'pe-quiet')}</div><div class="pe-grid pe-showcase">${preview.length ? preview.map((c) => tile(c, owned.get(c.id))).join('') : empty('No cards collected yet.')}</div></section></div>
  ${mine ? `<div class="pe-account">${btn('logout', 'Log out', 'pe-quiet')}</div>` : ''}${footer()}`;
}
function friendRow(friend) {
  const art = profileAppearance(friend.friendStyle, validIds());
  const online = isUserOnline(friend.friendId);
  return `<div class="pe-friend"><button class="pe-friend-identity pe-quiet" data-pe="view-friend" data-friend="${esc(friend.friendId)}"><img class="pe-avatar" src="${image(art.avatarArt)}" alt=""><span><strong>${esc(friend.friendUsername)}</strong><small class="pe-presence ${online ? 'online' : ''}">${online ? 'Online' : 'Offline'}</small></span></button><div class="pe-friend-actions">${online ? btn('invite', `${swords}<span class="pe-invite-label">Invite</span>`, '', `data-friend="${esc(friend.friendId)}" aria-label="Invite ${esc(friend.friendUsername)} to play" ${busy ? 'disabled' : ''}`) : ''}${btn('friend-menu', '…', 'pe-icon pe-quiet', `data-friend="${esc(friend.friendId)}" aria-label="Options for ${esc(friend.friendUsername)}"`)}</div></div>`;
}
function friendsScreen() {
  const online = friends.accepted.filter((f) => isUserOnline(f.friendId));
  const offline = friends.accepted.filter((f) => !isUserOnline(f.friendId));
  return `<div class="pe-heading"><div><h1>Play with Friends</h1><p class="pe-muted">Invite someone. Start a match.</p></div>${accountId ? btn('add-friend', '+ Add friend', 'pe-quiet') : btn('login', 'Log in', 'primary')}</div>
  ${!accountId ? empty('Log in to add friends and send invitations. You can also play using a room code.') : `<div class="pe-friend-tools"><span>Friends ${friends.accepted.length}</span>${btn('requests', `Requests ${friends.incoming.length + friends.outgoing.filter((f) => f.status === 'pending').length}`, 'pe-quiet')}</div>${friendsLoading && !friendsLoaded ? empty('Loading friends…') : ''}${friendError ? empty(friendError) + btn('reload-friends', 'Retry') : ''}${!friendsLoading && !friendError && !friends.accepted.length ? empty('Your friends will appear here. Add someone by username to get started.') : ''}<div class="pe-friend-list">${online.length ? '<h2 class="pe-section-label">Online</h2>' : ''}${online.map(friendRow).join('')}${offline.length ? btn('offline', `Offline · ${offline.length} ${showOffline ? '▴' : '▾'}`, 'pe-quiet') : ''}${showOffline ? offline.map(friendRow).join('') : ''}</div>`}
  <div class="pe-code-entry"><span>Playing with someone not on your list?</span>${btn('room-code', 'Use a room code →', 'pe-quiet')}</div>${footer()}`;
}
function draw() {
  if (!root || !visible()) return;
  const focus = root.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focus?.id;
  const start = focus?.selectionStart,
    end = focus?.selectionEnd;
  if (!root.querySelector('.pe-page')) root.innerHTML = shell();
  page = root.querySelector('.pe-page');
  page.className = `pe-page ${state.menu.stage === 'friends' && !publicProfile ? 'pe-friends-page' : ''} ${publicProfile || state.menu.stage === 'profile' ? 'pe-profile-page' : ''}`;
  density.capture(page.querySelector('.pe-density-grid'));
  page.innerHTML =
    publicCollection || state.menu.stage === 'collection'
      ? collection()
      : publicProfile
        ? profileScreen(publicProfile, false)
        : state.menu.stage === 'friends'
          ? friendsScreen()
          : profileScreen(own(), true);
  if (profileLoading) page.insertAdjacentHTML('afterbegin', empty('Loading profile…'));
  page.querySelectorAll('[data-render]').forEach((el) => {
    const card = catalog().find((c) => c.id === el.dataset.render);
    if (!card) return;
    el.append(
      renderCard(
        { ...card, rarity: el.dataset.finish || undefined },
        { showEffectSummary: true, useBaseStats: true }
      )
    );
  });
  page.querySelectorAll('.pe-density-grid .canonical-card').forEach((card) => {
    const source =
      card.querySelector('.card-image') || card.querySelector('.card-image-placeholder');
    if (!source) return;
    const art = document.createElement('div');
    art.className = 'pe-art-face';
    art.setAttribute('aria-hidden', 'true');
    const label = card.querySelector('.card-name')?.textContent || '';
    art.innerHTML = `<div class="pe-missing-content"><span class="pe-missing-symbol">🎨</span><span class="pe-missing-name">${esc(label)}</span></div>`;
    if (source.tagName === 'IMG') {
      const photo = source.cloneNode(true);
      photo.className = 'pe-thumbnail-image';
      photo.removeAttribute('style');
      photo.removeAttribute('onerror');
      photo.addEventListener('error', () => photo.remove());
      art.append(photo);
    }
    card.append(art);
  });
  const toolsRow = page.querySelector('.pe-tools');
  const filterPanel = page.querySelector('.pe-filters');
  if (toolsRow && filterPanel)
    filterPanel.style.setProperty(
      '--filter-top',
      `${toolsRow.offsetTop + toolsRow.offsetHeight + 6}px`
    );
  density.layout(page.querySelector('.pe-density-grid'), page.querySelector('.pe-pagination'));
  const name = page.querySelector('[data-styled-name]');
  if (name)
    name.append(renderStyledName(target()?.username || 'Player', target()?.name_style || {}));
  if (focusId) {
    const next = document.getElementById(focusId);
    next?.focus();
    if (next?.type === 'search' && start !== null) next.setSelectionRange(start, end);
  }
}
function closeDialog() {
  if (dialog) {
    dialog.close();
    dialog.remove();
    dialog = null;
    if (dialogTrigger?.isConnected) dialogTrigger.focus();
    else if (craftCard)
      [...root.querySelectorAll('[data-card]')]
        .find((el) => el.dataset.card === craftCard)
        ?.focus();
  }
  pickerField = null;
}
function showDialog(title, body) {
  closeDialog();
  dialogTrigger = document.activeElement;
  dialog = document.createElement('dialog');
  dialog.className = 'pe-dialog';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `<div class="pe-dialog-head"><h2>${esc(title)}</h2>${btn('close-dialog', '×', 'pe-icon pe-quiet', 'aria-label="Close"')}</div><div class="pe-dialog-body">${body}</div><p class="pe-dialog-error" role="alert"></p>`;
  dialog.addEventListener('click', handleClick);
  dialog.addEventListener('input', handleInput);
  dialog.addEventListener('change', handleChange);
  dialog.addEventListener('cancel', () => {
    pickerField = null;
    setTimeout(() => {
      if (craftCard)
        [...root.querySelectorAll('[data-card]')]
          .find((el) => el.dataset.card === craftCard)
          ?.focus();
    }, 0);
  });
  document.body.append(dialog);
  dialog.showModal();
}
function fail(error) {
  const text = error?.message || String(error);
  if (dialog?.open) dialog.querySelector('.pe-dialog-error').textContent = text;
  else {
    notice = text;
    redraw();
  }
}
async function operate(fn) {
  if (busy) return;
  busy = true;
  const token = epoch;
  try {
    await fn();
  } catch (error) {
    if (token === epoch) fail(error);
  } finally {
    if (token === epoch) {
      busy = false;
      redraw();
    }
  }
}
async function openProfile(id) {
  const token = epoch;
  profileLoading = true;
  redraw();
  try {
    const data = await fetchPublicProfile({ profileId: id });
    if (token !== epoch) return;
    publicProfile = data;
    notice = '';
    publicCollection = false;
    inspected = false;
    selectedId = null;
    closeDialog();
  } catch (error) {
    if (token === epoch) fail(error);
  } finally {
    if (token === epoch) {
      profileLoading = false;
      redraw();
    }
  }
}
function requestsDialog() {
  const incoming = friends.incoming
    .map(
      (f) =>
        `<div class="pe-request"><span>${esc(f.friendUsername)}</span>${btn('accept', 'Accept', 'primary', `data-relation="${esc(f.id)}"`)}${btn('reject', 'Decline', 'pe-quiet', `data-relation="${esc(f.id)}"`)}</div>`
    )
    .join('');
  const outgoing = friends.outgoing
    .map(
      (f) =>
        `<div class="pe-request"><span>${esc(f.friendUsername)}<small>${esc(f.status === 'pending' ? 'Request sent' : 'Request declined')}</small></span>${btn('cancel-request', 'Cancel', 'pe-quiet', `data-relation="${esc(f.id)}"`)}</div>`
    )
    .join('');
  showDialog('Friend requests', incoming + outgoing || empty('No pending requests.'));
}
function appearanceDialog() {
  if (!artDraft) artDraft = { ...own()?.name_style, appearance: appearance(own()) };
  const choices = [
    ['favoriteArt', 'Favorite art'],
    ['bannerArt', 'Banner'],
    ['avatarArt', 'Profile picture'],
  ];
  showDialog(
    'Edit appearance',
    `<p class="pe-muted">Choose card artwork for each part of your profile.</p><div class="pe-art-choices">${choices.map(([key, label]) => `<button data-pe="pick-art" data-field="${key}"><img src="${image(artDraft.appearance[key])}" alt=""><span>${label}</span></button>`).join('')}</div><details><summary>Name style</summary>${[
      ['effect', NAME_EFFECTS],
      ['font', NAME_FONTS],
      ['color', NAME_COLORS],
    ]
      .map(
        ([key, values]) =>
          `<label>${key}<select data-style="${key}">${options([['', 'Default'], ...Object.entries(values).map(([id, v]) => [id, v.label])], artDraft[key] || '')}</select></label>`
      )
      .join(
        ''
      )}</details><div class="pe-dialog-actions">${btn('discard-appearance', 'Cancel', 'pe-quiet')}${btn('save-appearance', 'Save appearance', 'primary')}</div>`
  );
}
function paintPicker() {
  const list = catalog().filter(
    (c) => CARD_ART_IDS.has(c.id) && c.name.toLowerCase().includes(pickerQuery.toLowerCase())
  );
  const count = 24;
  const pages = Math.max(1, Math.ceil(list.length / count));
  pickerPage = Math.min(pickerPage, pages - 1);
  const grid = dialog.querySelector('.pe-art-grid');
  grid.innerHTML =
    list
      .slice(pickerPage * count, (pickerPage + 1) * count)
      .map(
        (c) =>
          `<button data-pe="choose-art" data-art="${esc(c.id)}" aria-label="Choose ${esc(c.name)}" class="${artDraft.appearance[pickerField] === c.id ? 'selected' : ''}"><img src="${image(c.id)}" alt=""><span>${esc(c.name)}</span></button>`
      )
      .join('') || empty('No matching artwork.');
  dialog.querySelector('.pe-picker-pages').innerHTML =
    `${btn('art-prev', '←', '', pickerPage === 0 ? 'disabled' : '')}<span>${pickerPage + 1} / ${pages}</span>${btn('art-next', '→', '', pickerPage + 1 >= pages ? 'disabled' : '')}`;
}
function artPicker(field) {
  showDialog(
    'Choose artwork',
    `<input id="pe-art-search" type="search" placeholder="Search artwork" aria-label="Search artwork"><div class="pe-art-grid"></div><div class="pe-picker-pages"></div>${btn('art-back', '← Appearance', 'pe-quiet')}`
  );
  pickerField = field;
  pickerQuery = '';
  pickerPage = 0;
  paintPicker();
}
function inspectSelectedCard() {
  const list = filterCollection(catalog(), ownership(), filters);
  const index = list.findIndex((card) => card.id === selectedId);
  const card = list[index];
  const anchor = [...root.querySelectorAll('[data-card]')].find(
    (el) => el.dataset.card === selectedId
  );
  if (!card || !anchor) return;
  const change = (delta) => {
    const next = (index + delta + list.length) % list.length;
    selectedId = list[next].id;
    draw();
    if (crafting && !publicCollection && Array.isArray(own()?.cardFinishes)) openCraft(selectedId);
    else inspectSelectedCard();
  };
  showCardTooltip({ ...card, rarity: ownership().get(card.id) }, anchor, {
    context: 'collection',
    modal: true,
    onPrevious: list.length > 1 ? () => change(-1) : null,
    onNext: list.length > 1 ? () => change(1) : null,
  });
}
async function handleClick(event) {
  if (filtersOpen && !event.target.closest('.pe-filters, [data-pe="toggle-filters"]')) {
    filtersOpen = false;
    root.querySelector('.pe-filters')?.classList.remove('is-open');
    root.querySelector('[data-pe="toggle-filters"]')?.setAttribute('aria-expanded', 'false');
  }
  const tileNode = event.target.closest('[data-card]');
  if (tileNode) {
    selectedId = tileNode.dataset.card;
    if (publicProfile && !publicCollection) {
      publicCollection = true;
      filters = defaults();
      filters.sort = 'rarity';
    } else if (state.menu.stage === 'profile') {
      go('collection');
    }
    inspected = false;
    tileNode.focus();
    if (crafting && !publicCollection && Array.isArray(own()?.cardFinishes)) openCraft(selectedId);
    else inspectSelectedCard();
    return;
  }
  const button = event.target.closest('[data-pe]');
  if (!button || button.disabled) return;
  const action = button.dataset.pe;
  if (action === 'toggle-filters') {
    filtersOpen = !filtersOpen;
    draw();
    if (filtersOpen) root.querySelector('#pe-ownership')?.focus();
    else root.querySelector('[data-pe="toggle-filters"]')?.focus();
    return;
  }
  const id = button.dataset.friend;
  const rel = relation(id);
  if (['home', 'profile', 'friends', 'collection'].includes(action)) {
    go(action === 'home' ? 'main' : action);
    return;
  }
  if (action === 'retry-collection') {
    await callbacks.onReloadCollection?.();
    draw();
    return;
  }
  if (action === 'decks') {
    closeDialog();
    callbacks.onDecks?.();
    return;
  }
  if (action === 'login') {
    go('login');
    return;
  }
  if (action === 'close-dialog') {
    closeDialog();
    return;
  }
  if (action === 'public-back') {
    if (publicCollection) {
      publicCollection = false;
      inspected = false;
    } else {
      publicProfile = null;
    }
    draw();
    return;
  }
  if (action === 'public-collection') {
    publicCollection = true;
    filters = defaults();
    filters.sort = 'rarity';
    draw();
    return;
  }
  if (action === 'close-inspect') {
    inspected = false;
    draw();
    return;
  }
  if (action === 'reset-filters') {
    filters = { ...defaults(), ownership: 'all' };
    draw();
    return;
  }
  if (action === 'prev-page' || action === 'next-page') {
    const grid = page.querySelector('.pe-density-grid');
    grid.scrollBy({
      left: grid.clientWidth * (action === 'prev-page' ? -1 : 1),
      behavior: 'smooth',
    });
    return;
  }
  if (action === 'smaller-cards' || action === 'larger-cards') {
    density.capture(page.querySelector('.pe-density-grid'));
    density.change(action === 'smaller-cards' ? 1 : -1);
    density.layout(page.querySelector('.pe-density-grid'), page.querySelector('.pe-pagination'));
    return;
  }
  if (action === 'craft-tab' || action === 'browse-tab') {
    crafting = action === 'craft-tab';
    draw();
    return;
  }
  if (['craft-finish', 'recycle-extras', 'recover-dust'].includes(action)) {
    await runDust(action, button);
    return;
  }
  if (action === 'preview-finish') {
    openCraft(craftCard, Number(button.dataset.rank));
    return;
  }
  if (action === 'prev-card' || action === 'next-card') {
    const list = filterCollection(catalog(), ownership(), filters);
    const index = list.findIndex((c) => c.id === selectedId);
    selectedId = list[(index + (action === 'next-card' ? 1 : list.length - 1)) % list.length]?.id;
    draw();
    return;
  }
  if (action === 'room-code') {
    closeDialog();
    callbacks.onRoomCode?.();
    return;
  }
  if (action === 'packs') {
    await operate(async () => {
      await callbacks.onOpenPack?.();
    });
    return;
  }
  if (action === 'logout') {
    showDialog(
      'Log out?',
      `<p>Your saved cards and appearance stay on your account.</p><div class="pe-dialog-actions">${btn('close-dialog', 'Stay logged in')}${btn('confirm-logout', 'Log out', 'primary')}</div>`
    );
    return;
  }
  if (action === 'confirm-logout') {
    closeDialog();
    callbacks.onLogout?.();
    return;
  }
  if (action === 'offline') {
    showOffline = !showOffline;
    draw();
    return;
  }
  if (action === 'reload-friends') {
    await loadFriends();
    return;
  }
  if (action === 'view-friend') {
    await openProfile(id);
    return;
  }
  if (action === 'friend-menu') {
    showDialog(
      rel?.friendUsername || publicProfile?.username || 'Friend',
      `${btn('view-friend', 'View profile', '', `data-friend="${esc(id)}"`)}${rel?.status === 'accepted' ? btn('confirm-remove', 'Remove friend', 'pe-danger', `data-relation="${esc(rel.id)}"`) : ''}`
    );
    return;
  }
  if (action === 'confirm-remove') {
    showDialog(
      'Remove friend?',
      `<p>You can send another friend request later.</p><div class="pe-dialog-actions">${btn('close-dialog', 'Keep friend')}${btn('remove', 'Remove friend', 'pe-danger', `data-relation="${esc(button.dataset.relation)}"`)}</div>`
    );
    return;
  }
  if (action === 'remove' || action === 'cancel-request') {
    await operate(async () => {
      await removeFriendship({ friendshipId: button.dataset.relation, profileId: accountId });
      closeDialog();
      await loadFriends();
    });
    return;
  }
  if (action === 'requests') {
    await loadFriends();
    requestsDialog();
    return;
  }
  if (action === 'accept' || action === 'reject') {
    await operate(async () => {
      await respondToFriendRequest({
        friendshipId: button.dataset.relation,
        addresseeId: accountId,
        response: action === 'accept' ? 'accepted' : 'rejected',
      });
      await loadFriends();
    });
    return;
  }
  if (action === 'invite') {
    if (!isUserOnline(id)) {
      notice = 'This friend is offline.';
      draw();
      return;
    }
    closeDialog();
    await operate(async () => {
      await callbacks.onChallengeFriend?.(id, rel?.friendUsername || publicProfile?.username);
    });
    return;
  }
  if (action === 'add-friend') {
    showDialog(
      'Add a friend',
      `<label>Username<input id="pe-add-username" autocomplete="off" maxlength="80"></label>${btn('find-player', 'Find player', 'primary')}`
    );
    return;
  }
  if (action === 'find-player') {
    const username = dialog.querySelector('#pe-add-username').value.trim();
    await operate(async () => {
      if (!username) throw Error('Enter a username.');
      const found = await searchUserByUsername(username);
      if (!found) throw Error('No player found with that username.');
      if (found.id === accountId) throw Error('That is your own profile.');
      await openProfile(found.id);
    });
    return;
  }
  if (action === 'add-profile') {
    await operate(async () => {
      await sendFriendRequest({ requesterId: accountId, addresseeId: publicProfile.id });
      notice = 'Friend request sent.';
      await loadFriends();
    });
    return;
  }
  if (action === 'appearance') {
    artDraft = { ...own().name_style, appearance: appearance(own()) };
    appearanceDialog();
    return;
  }
  if (action === 'pick-art') {
    artPicker(button.dataset.field);
    return;
  }
  if (action === 'choose-art') {
    artDraft.appearance[pickerField] = button.dataset.art;
    appearanceDialog();
    return;
  }
  if (action === 'art-back') {
    appearanceDialog();
    return;
  }
  if (action === 'art-prev' || action === 'art-next') {
    pickerPage += action === 'art-prev' ? -1 : 1;
    paintPicker();
    return;
  }
  if (action === 'discard-appearance') {
    artDraft = null;
    closeDialog();
    return;
  }
  if (action === 'save-appearance') {
    const id = accountId,
      token = epoch;
    button.disabled = true;
    await operate(async () => {
      const style = withProfileAppearance(artDraft, artDraft.appearance, validIds());
      const saved = await updateProfileNameStyle({ profileId: id, nameStyle: style });
      if (token !== epoch) return;
      callbacks.onStyleChange?.(saved.name_style || style);
      artDraft = null;
      closeDialog();
      notice = 'Appearance saved.';
    });
    if (button.isConnected) button.disabled = false;
    return;
  }
  if (action === 'history') {
    showDialog(
      'Match history',
      (own()?.matches || [])
        .map(
          (m) =>
            `<div class="pe-match"><strong>${m.won ? 'Win' : 'Loss'}</strong><span>vs ${esc(m.opponent || 'Opponent')}</span><span>${esc(m.playerHp ?? 0)} – ${esc(m.opponentHp ?? 0)}</span></div>`
        )
        .join('') || empty('No completed matches yet.')
    );
    return;
  }
}
function handleInput(event) {
  if (event.target.id === 'pe-search') {
    page.querySelector('.pe-density-grid')?.scrollTo(0, 0);
    density.reset();
    filters.query = event.target.value;
    filters.page = 0;
    draw();
  }
  if (event.target.id === 'pe-art-search') {
    pickerQuery = event.target.value;
    pickerPage = 0;
    paintPicker();
  }
}
function handleChange(event) {
  const keys = {
    'pe-ownership': 'ownership',
    'pe-animal': 'animal',
    'pe-rarity': 'rarity',
    'pe-sort': 'sort',
  };
  if (keys[event.target.id]) {
    page.querySelector('.pe-density-grid')?.scrollTo(0, 0);
    density.reset();
    filters[keys[event.target.id]] = event.target.value;
    filters.page = 0;
    draw();
  }
  if (event.target.dataset.style && artDraft)
    artDraft[event.target.dataset.style] = event.target.value || null;
}
