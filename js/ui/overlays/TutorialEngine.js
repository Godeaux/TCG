/* global AbortController, DOMException */
/**
 * TutorialEngine — Animated visual tutorial system
 *
 * Renders paginated tutorial scenes with real card visuals and
 * looping animation demonstrations of game mechanics.
 */

import { renderCard } from '../components/Card.js';
import { TUTORIAL_SCENES } from './tutorialScenes.js';

// ============================================================================
// STATE
// ============================================================================

let containerEl = null;
let stageEl = null;
let textPanelEl = null;
let labelEl = null;
let navEl = null;
let textContentEl = null;
let currentSceneIndex = 0;
let loopAbort = null;
const slotElements = {};
let arrowSvg = null;
let keyHandler = null;

// ============================================================================
// PUBLIC API
// ============================================================================

export const TutorialEngine = {
  init(container) {
    containerEl = container;
    containerEl.innerHTML = '';
    buildLayout();
    goToScene(0);

    // Keyboard navigation
    keyHandler = (e) => {
      if (e.key === 'ArrowRight') {
        goToScene(currentSceneIndex + 1);
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft') {
        goToScene(currentSceneIndex - 1);
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', keyHandler);
  },

  destroy() {
    stopDemo();
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    removeArrow();
    if (containerEl) containerEl.innerHTML = '';
    containerEl = null;
    stageEl = null;
    textPanelEl = null;
    labelEl = null;
    navEl = null;
    arrowSvg = null;
    Object.keys(slotElements).forEach((k) => delete slotElements[k]);
  },
};

// ============================================================================
// LAYOUT
// ============================================================================

function buildLayout() {
  // Main content wrapper (side-by-side)
  const wrapper = document.createElement('div');
  wrapper.className = 'tutorial-engine';

  // Demo and its caption have separate space, so labels cannot cover cards.
  const demoPanel = document.createElement('div');
  demoPanel.className = 'tutorial-demo';
  stageEl = document.createElement('div');
  stageEl.className = 'tutorial-stage';

  for (const name of ['left', 'center', 'right']) {
    const slot = document.createElement('div');
    slot.className = `tutorial-stage-slot tutorial-slot-${name}`;
    slot.dataset.slot = name;
    stageEl.appendChild(slot);
    slotElements[name] = slot;
  }

  labelEl = document.createElement('div');
  labelEl.className = 'tutorial-stage-label';
  const toolbar = document.createElement('div');
  toolbar.className = 'tutorial-demo-toolbar';
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'WORKED EXAMPLE';
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'tutorial-replay';
  replay.textContent = '↻ Replay';
  replay.setAttribute('aria-label', 'Replay this demonstration');
  replay.onclick = () => goToScene(currentSceneIndex);
  toolbar.append(eyebrow, replay);
  demoPanel.appendChild(toolbar);
  demoPanel.appendChild(stageEl);
  demoPanel.appendChild(labelEl);

  // Text panel (right on desktop); navigation spans the bottom of the pane.
  textPanelEl = document.createElement('div');
  textPanelEl.className = 'tutorial-text-panel';

  navEl = document.createElement('div');
  navEl.className = 'tutorial-nav';
  buildNav();

  // Text content area (title + description go here)
  textContentEl = document.createElement('div');
  textContentEl.className = 'tutorial-text-content';
  textPanelEl.appendChild(textContentEl);

  wrapper.appendChild(demoPanel);
  wrapper.appendChild(textPanelEl);
  wrapper.appendChild(navEl);
  containerEl.appendChild(wrapper);
}

function buildNav() {
  navEl.innerHTML = '';
  const total = TUTORIAL_SCENES.length;

  // Prev button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'tutorial-nav-btn';
  prevBtn.textContent = '← Back';
  prevBtn.setAttribute('aria-label', 'Previous lesson');
  prevBtn.onclick = () => goToScene(currentSceneIndex - 1);
  navEl.appendChild(prevBtn);

  // Page counter
  const counter = document.createElement('span');
  counter.className = 'tutorial-nav-counter';
  counter.textContent = `${currentSceneIndex + 1} / ${total}`;
  navEl.appendChild(counter);

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'tutorial-nav-btn';
  nextBtn.textContent = 'Next →';
  nextBtn.onclick = () => {
    if (currentSceneIndex === TUTORIAL_SCENES.length - 1) {
      document.getElementById('tutorial-close')?.click();
    } else goToScene(currentSceneIndex + 1);
  };
  navEl.appendChild(nextBtn);
}

function updateNav() {
  if (!navEl) return;
  const counter = navEl.querySelector('.tutorial-nav-counter');
  if (counter) counter.textContent = `${currentSceneIndex + 1} / ${TUTORIAL_SCENES.length}`;
  const [previous, next] = navEl.querySelectorAll('button');
  previous.disabled = currentSceneIndex === 0;
  next.textContent = currentSceneIndex === TUTORIAL_SCENES.length - 1 ? 'Done' : 'Next →';
  next.setAttribute(
    'aria-label',
    currentSceneIndex === TUTORIAL_SCENES.length - 1 ? 'Finish tutorial' : 'Next lesson'
  );
}

// ============================================================================
// SCENE NAVIGATION
// ============================================================================

function goToScene(index) {
  if (index < 0 || index >= TUTORIAL_SCENES.length) return;
  stopDemo();
  currentSceneIndex = index;
  updateNav();
  const scene = TUTORIAL_SCENES[index];
  if (!scene) return;

  stageEl.querySelector('.tutorial-flow-grid')?.remove();
  stageEl.querySelector('.tutorial-diagram')?.remove();
  stageEl.dataset.scene = scene.id;

  // Clear stage
  for (const slot of Object.values(slotElements)) {
    slot.innerHTML = '';
    slot.style.opacity = '0';
    slot.style.transform = '';
    slot.classList.remove('ai-attacker-selected', 'ai-target-considering');
  }
  labelEl.textContent = '';
  labelEl.style.opacity = '0';
  removeArrow();

  // Render text content
  textContentEl.innerHTML = `
    <h3 class="tutorial-scene-title">${scene.title.replace(/^\d+\.\s*/, '')}</h3>
    <div class="tutorial-scene-text">${scene.text}</div>
  `;

  stageEl.style.setProperty(
    '--tutorial-slot-count',
    String(Math.max(1, scene.demo?.setup?.length || 0))
  );

  if (scene.demo?.flow) {
    const flow = document.createElement('div');
    flow.className = 'tutorial-flow-grid';
    const isTurn = scene.id === 'turn-flow';
    if (isTurn) {
      flow.classList.add('tutorial-turn-sequence');
      flow.innerHTML =
        '<div class="tutorial-phase-eyebrow">YOUR TURN</div><div class="tutorial-phase-name"></div><div class="tutorial-phase-position"></div><div class="tutorial-phase-track" role="list" aria-label="Turn phases"></div>';
    }
    flow.style.setProperty('--flow-columns', String(scene.demo.flow.length === 2 ? 2 : 3));
    scene.demo.flow.forEach((text, index) => {
      const item = document.createElement('div');
      item.className = 'tutorial-flow-step';
      item.textContent = isTurn ? String(index + 1) : `${index + 1}. ${text}`;
      if (isTurn) {
        item.setAttribute('role', 'listitem');
        item.setAttribute('aria-label', `${index + 1}. ${text}`);
        item.dataset.phase = text;
      }
      (flow.querySelector('.tutorial-phase-track') || flow).appendChild(item);
    });
    stageEl.appendChild(flow);
  }

  if (scene.demo.diagram) {
    const diagram = document.createElement('div');
    diagram.className = `tutorial-diagram tutorial-diagram-${scene.demo.diagram}`;
    const zones =
      scene.demo.diagram === 'zones'
        ? [
            ['field', 'FIELD', '3 creature slots'],
            ['hand', 'HAND', 'Private · no limit'],
            ['carrion', 'CARRION', 'Slain / eaten'],
            ['exile', 'EXILE', 'Used / removed'],
          ]
        : [
            ['hand', 'IN YOUR HAND', 'Wait for a trigger'],
            ['trigger', 'RIVAL ACTION', 'Response window'],
            ['resolve', 'YOUR CHOICE', 'Activate and resolve'],
            ['exile', 'EXILE', 'Used trap leaves hand'],
          ];
    zones.forEach(([id, title, detail]) => {
      const zone = document.createElement('div');
      zone.className = 'tutorial-zone';
      zone.dataset.zone = id;
      zone.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
      if (id === 'field')
        zone.innerHTML += '<div class="tutorial-field-spaces"><i></i><i></i><i></i></div>';
      diagram.appendChild(zone);
    });
    stageEl.appendChild(diagram);
  }

  startDemo(scene.demo);
}

// ============================================================================
// DEMO RUNNER
// ============================================================================

function stopDemo() {
  stageEl?.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  stageEl?.querySelectorAll('.tutorial-attack-ghost').forEach((ghost) => ghost.remove());
  if (loopAbort) {
    loopAbort.abort();
    loopAbort = null;
  }
}

async function startDemo(demo) {
  if (!demo?.steps) return;
  loopAbort = new AbortController();
  const signal = loopAbort.signal;

  while (!signal.aborted) {
    resetStage(demo);
    try {
      await runSteps(demo.steps, signal);
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('[TutorialEngine] Demo error:', e);
      return;
    }
  }
}

function resetStage(demo) {
  for (const slot of Object.values(slotElements)) {
    slot.innerHTML = '';
    slot.className = `tutorial-stage-slot tutorial-slot-${slot.dataset.slot}`;
    delete slot.dataset.hp;
    delete slot.dataset.atk;
    delete slot.dataset.nut;
    delete slot.dataset.focusStat;
  }
  for (const item of demo.setup) {
    const slot = slotElements[item.slot];
    if (item.card) {
      slot.appendChild(renderCard(item.card, { showEffectSummary: true, context: 'tooltip' }));
      if (item.card.hp !== undefined) slot.dataset.hp = String(item.card.hp);
      if (item.card.atk !== undefined) slot.dataset.atk = String(item.card.atk);
      if (item.card.nutrition !== undefined) slot.dataset.nut = String(item.card.nutrition);
    } else if (item.entity) {
      const box = document.createElement('div');
      box.className = 'tutorial-entity';
      box.innerHTML = `<span class="tutorial-entity-title">${item.entity.title}</span><strong class="tutorial-entity-value">${item.entity.value}</strong><span class="tutorial-entity-detail">${item.entity.detail}</span>`;
      slot.appendChild(box);
      if (item.entity.title === 'RIVAL') slot.dataset.hp = item.entity.value;
    }
    if (item.role) {
      const role = document.createElement('div');
      role.className = 'tutorial-slot-role';
      role.textContent = item.role;
      slot.appendChild(role);
    }
    const note = document.createElement('div');
    note.className = 'tutorial-slot-note';
    slot.appendChild(note);
  }
  stageEl.dataset.cycle = String(Number(stageEl.dataset.cycle || 0) + 1);

  for (const slot of Object.values(slotElements)) {
    slot.style.opacity = '0';
    slot.style.transform = '';
    slot.classList.remove('ai-attacker-selected', 'ai-target-considering');
    // Remove status overlays
    slot.querySelectorAll('.status-overlay').forEach((o) => o.remove());
    // Remove keyword flash classes
    const card = slot.querySelector('.card');
    if (card) {
      card.classList.remove(
        'keyword-ambush',
        'keyword-barrier',
        'keyword-toxic',
        'keyword-neurotoxic',
        'keyword-haste',
        'keyword-lure',
        'keyword-scavenge'
      );
    }
  }
  labelEl.style.opacity = '0';
  labelEl.textContent = '';
  removeArrow();
}

async function runSteps(steps, signal) {
  for (const [index, step] of steps.entries()) {
    stageEl.dataset.step = String(index);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await executeStep(step, signal);
  }
}

// ============================================================================
// STEP HANDLERS
// ============================================================================

async function executeStep(step, signal) {
  switch (step.type) {
    case 'parallel':
      return Promise.all(step.steps.map((child) => executeStep(child, signal)));
    case 'note':
      return handleNote(step);
    case 'entityValue': {
      const slot = slotElements[step.target];
      slot.querySelector('.tutorial-entity-value').textContent = step.text;
      if (step.detail) slot.querySelector('.tutorial-entity-detail').textContent = step.detail;
      return;
    }
    case 'dim':
      slotElements[step.target].classList.add('tutorial-unavailable');
      return;
    case 'depart':
      removeArrow();
      slotElements[step.target].classList.add('tutorial-departed');
      slotElements[step.target].style.opacity = '1';
      return handleNote({ ...step, text: `→ ${step.destination}` });
    case 'focusStat':
      stageEl
        .querySelectorAll('[data-focus-stat]')
        .forEach((slot) => delete slot.dataset.focusStat);
      slotElements[step.target].dataset.focusStat = step.stat;
      return;
    case 'keyword': {
      const card = slotElements[step.target].querySelector('.card');
      const tags = card.querySelector('.card-keywords-text');
      if (step.remove) {
        tags?.querySelectorAll('.keyword-tag').forEach((tag) => {
          if (tag.textContent.trim() === step.keyword) tag.remove();
        });
      } else {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag';
        tag.textContent = step.keyword;
        if (tags) tags.appendChild(tag);
        else {
          const row = document.createElement('div');
          row.className = 'card-keywords-text';
          row.appendChild(tag);
          card.querySelector('.card-stats-row')?.after(row);
        }
      }
      return;
    }
    case 'zone':
      stageEl
        .querySelectorAll('.tutorial-zone')
        .forEach((zone) => zone.classList.toggle('is-current', zone.dataset.zone === step.target));
      return;
    case 'fadeIn':
      return handleFadeIn(step, signal);
    case 'wait':
      return wait(step.duration, signal);
    case 'highlightAttacker':
      return handleHighlightAttacker(step);
    case 'highlightTarget':
      return handleHighlightTarget(step);
    case 'clearHighlights':
      return handleClearHighlights();
    case 'arrow':
      return handleArrow(step, signal);
    case 'label':
      handleLabel(step);
      return step.duration ? wait(step.duration, signal) : undefined;
    case 'clearLabel':
      return handleClearLabel();
    case 'keywordFlash':
      return handleKeywordFlash(step, signal);
    case 'attack':
      return handleAttack(step, signal);
    case 'damagePop':
      return handleDamagePop(step, signal);
    case 'healPop':
      return handleHealPop(step, signal);
    case 'death':
      return handleDeath(step, signal);
    case 'applyStatus':
      return handleApplyStatus(step);
    case 'removeStatus':
      return handleRemoveStatus(step);
    case 'consumeInto':
      return handleConsumeInto(step, signal);
    case 'highlight':
      return handleHighlight(step, signal);
    case 'pulsestat':
      return handlePulseStat(step, signal);
    case 'buffPop':
      return handleBuffPop(step, signal);
    case 'arrowFizzle':
      return handleArrowFizzle(step, signal);
    case 'spellEffect':
      return handleSpellEffect(step, signal);
    default:
      console.warn('[TutorialEngine] Unknown step type:', step.type);
  }
}

// -- fadeIn --
function handleFadeIn(step, signal) {
  const targets = step.target === 'all' ? Object.values(slotElements) : [slotElements[step.target]];
  for (const slot of targets) {
    if (slot && slot.children.length > 0) {
      slot.style.transition = `opacity ${step.duration || 400}ms ease-out`;
      slot.style.opacity = '1';
    }
  }
  return wait(step.duration || 400, signal);
}

// -- wait --
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function handleNote(step) {
  const slot = slotElements[step.target];
  slot.querySelector('.tutorial-slot-note').textContent = step.text;
}

function setStat(slot, stat, value) {
  slot.dataset[stat] = String(value);
  const node = slot.querySelector(`.stat-${stat}`);
  if (node) {
    node.lastChild.textContent = ` ${value}`;
    node.setAttribute('aria-label', `${stat === 'hp' ? 'Health' : 'Attack'} ${value}`);
    node.classList.add('tutorial-stat-changed');
  }
  if (stat === 'hp' && slot.querySelector('.tutorial-entity-value')) {
    slot.querySelector('.tutorial-entity-value').textContent = String(value);
  }
}

// -- highlightAttacker / highlightTarget --
function handleHighlightAttacker(step) {
  const slot = slotElements[step.target];
  if (slot) slot.classList.add('ai-attacker-selected');
}

function handleHighlightTarget(step) {
  const slot = slotElements[step.target];
  if (slot) slot.classList.add('ai-target-considering');
}

function handleClearHighlights() {
  for (const slot of Object.values(slotElements)) {
    slot.classList.remove('ai-attacker-selected', 'ai-target-considering');
  }
  removeArrow();
}

// -- arrow --
async function handleArrow(step, signal) {
  removeArrow();
  const fromEl = slotElements[step.from];
  const toEl = slotElements[step.to];
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  const from = { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 };
  const to = { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 };

  arrowSvg = createArrowSvg(from, to, step.color);
  stageEl.appendChild(arrowSvg);
  requestAnimationFrame(() => arrowSvg?.classList.add('visible'));

  await wait(step.duration || 600, signal);
}

// -- arrowFizzle (arrow draws then fades/breaks) --
async function handleArrowFizzle(step, signal) {
  removeArrow();
  const fromEl = slotElements[step.from];
  const toEl = slotElements[step.to];
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  const from = { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 };
  // Stop short of the target
  const to = {
    x:
      fromRect.left +
      fromRect.width / 2 +
      (toRect.left + toRect.width / 2 - fromRect.left - fromRect.width / 2) * 0.6,
    y:
      fromRect.top +
      fromRect.height / 2 +
      (toRect.top + toRect.height / 2 - fromRect.top - fromRect.height / 2) * 0.6,
  };

  arrowSvg = createArrowSvg(from, to, 'red');
  stageEl.appendChild(arrowSvg);
  requestAnimationFrame(() => arrowSvg?.classList.add('visible'));

  await wait(400, signal);
  // Fizzle — fade out with red
  if (arrowSvg) {
    arrowSvg.style.transition = 'opacity 0.3s ease-out';
    arrowSvg.style.opacity = '0';
  }
  await wait(300, signal);
  removeArrow();
}

function createArrowSvg(from, to, color) {
  const bounds = stageEl.getBoundingClientRect();
  from = { x: from.x - bounds.left, y: from.y - bounds.top };
  to = { x: to.x - bounds.left, y: to.y - bounds.top };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('ai-attack-arrow', 'tutorial-arrow');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none; z-index: 1000; overflow: visible;
  `;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const arcDirection = dy > 0 ? 1 : -1;
  const arcIntensity = Math.min(distance * 0.3, 80);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const perpX = (-dy / distance) * arcIntensity * arcDirection;
  const perpY = (dx / distance) * arcIntensity * arcDirection;
  const controlX = midX + perpX;
  const controlY = midY + perpY;

  const strokeColor = color === 'red' ? 'rgba(255, 69, 0, 0.9)' : 'rgba(255, 165, 0, 0.9)';
  const fillColor = color === 'red' ? 'rgba(255, 69, 0, 0.95)' : 'rgba(255, 165, 0, 0.95)';

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`);
  path.classList.add('ai-arrow-path');
  if (color) path.style.stroke = strokeColor;

  const tangentX = 2 * (to.x - controlX);
  const tangentY = 2 * (to.y - controlY);
  const angle = Math.atan2(tangentY, tangentX);
  const headLength = 16;
  const headWidth = 10;
  const baseX = to.x - headLength * Math.cos(angle);
  const baseY = to.y - headLength * Math.sin(angle);
  const leftX = baseX - headWidth * Math.cos(angle - Math.PI / 2);
  const leftY = baseY - headWidth * Math.sin(angle - Math.PI / 2);
  const rightX = baseX - headWidth * Math.cos(angle + Math.PI / 2);
  const rightY = baseY - headWidth * Math.sin(angle + Math.PI / 2);

  const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  arrowhead.setAttribute('points', `${to.x},${to.y} ${leftX},${leftY} ${rightX},${rightY}`);
  arrowhead.classList.add('ai-arrow-head');
  if (color) arrowhead.style.fill = fillColor;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.id = 'tutorial-arrow-glow';
  filter.setAttribute('x', '-50%');
  filter.setAttribute('y', '-50%');
  filter.setAttribute('width', '200%');
  filter.setAttribute('height', '200%');
  const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '4');
  blur.setAttribute('result', 'coloredBlur');
  const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
  const mn1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mn1.setAttribute('in', 'coloredBlur');
  const mn2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mn2.setAttribute('in', 'SourceGraphic');
  merge.appendChild(mn1);
  merge.appendChild(mn2);
  filter.appendChild(blur);
  filter.appendChild(merge);
  defs.appendChild(filter);
  path.style.filter = 'url(#tutorial-arrow-glow)';
  arrowhead.style.filter = 'url(#tutorial-arrow-glow)';

  svg.appendChild(defs);
  svg.appendChild(path);
  svg.appendChild(arrowhead);
  return svg;
}

function removeArrow() {
  if (arrowSvg) {
    arrowSvg.remove();
    arrowSvg = null;
  }
  document.querySelectorAll('.tutorial-arrow').forEach((el) => el.remove());
}

// -- label / clearLabel --
function handleLabel(step) {
  labelEl.textContent = step.text;
  stageEl.querySelectorAll('.tutorial-flow-step').forEach((item, index) => {
    item.classList.toggle('is-current', index === step.node);
    item.classList.toggle('is-complete', index < step.node);
    if (index === step.node && item.dataset.phase) {
      stageEl.querySelector('.tutorial-phase-name').textContent = item.dataset.phase;
      stageEl.querySelector('.tutorial-phase-position').textContent =
        `PHASE ${index + 1} OF ${stageEl.querySelectorAll('.tutorial-flow-step').length}`;
      stageEl
        .querySelector('.tutorial-phase-track')
        .style.setProperty(
          '--phase-progress',
          String(index / (stageEl.querySelectorAll('.tutorial-flow-step').length - 1))
        );
      item.setAttribute('aria-current', 'step');
    } else {
      item.removeAttribute('aria-current');
    }
  });
  labelEl.style.transition = 'opacity 0.3s ease-out';
  labelEl.style.opacity = '1';
}

function handleClearLabel() {
  labelEl.style.opacity = '0';
}

// -- keywordFlash --
async function handleKeywordFlash(step, signal) {
  const slot = slotElements[step.target];
  const card = slot?.querySelector('.card');
  if (!card) return;
  const className = `keyword-${step.keyword}`;
  card.classList.add(className);
  await wait(step.duration || 500, signal);
  card.classList.remove(className);
}

// -- attack (ghost card flies from→to) --
async function handleAttack(step, signal) {
  const fromSlot = slotElements[step.from];
  const toSlot = slotElements[step.to];
  if (!fromSlot || !toSlot) return;

  const fromCard = fromSlot.querySelector('.card');
  if (!fromCard) return;

  const fromRect = fromCard.getBoundingClientRect();
  const bounds = stageEl.getBoundingClientRect();
  const toRect = toSlot.children.length
    ? toSlot.getBoundingClientRect()
    : {
        left: bounds.left + bounds.width * 0.85,
        top: fromRect.top + fromRect.height / 2,
        width: 0,
        height: 0,
      };

  const ghost = fromCard.cloneNode(true);
  ghost.classList.add('tutorial-attack-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText = `
    position: absolute;
    width: ${fromRect.width}px;
    height: ${fromRect.height}px;
    left: ${fromRect.left - bounds.left + fromRect.width / 2}px;
    top: ${fromRect.top - bounds.top + fromRect.height / 2}px;
    z-index: 1001;
    pointer-events: none;
    transform: translate(-50%, -50%);
  `;
  stageEl.appendChild(ghost);
  removeArrow();

  const deltaX = (toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)) * 0.35;
  const deltaY = (toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2)) * 0.35;

  const animation = ghost.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95 },
      { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 1, offset: 0.7 },
      {
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.95)`,
        opacity: 0.2,
      },
    ],
    {
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 1
        : step.duration || 420,
      easing: 'cubic-bezier(0.2, 0.85, 0.35, 1)',
    }
  );
  const cancel = () => animation.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    await animation.finished;
  } finally {
    signal?.removeEventListener('abort', cancel);
    ghost.remove();
  }
}

// -- damagePop --
async function handleDamagePop(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

  if (slot.dataset.hp !== undefined)
    setStat(slot, 'hp', Math.max(0, Number(slot.dataset.hp) - step.amount));
  const pop = document.createElement('div');
  pop.className = 'tutorial-damage-pop';
  pop.textContent = `-${step.amount}`;
  slot.appendChild(pop);

  const card = slot.querySelector('.card');
  if (card) {
    card.classList.add('damage-shake');
    setTimeout(() => card.classList.remove('damage-shake'), 500);
  }

  await wait(step.duration || 500, signal);
  pop.remove();
}

// -- healPop --
async function handleHealPop(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

  const pop = document.createElement('div');
  pop.className = 'tutorial-heal-pop';
  pop.textContent = `+${step.amount}`;
  slot.appendChild(pop);

  const card = slot.querySelector('.card');
  if (card) {
    card.classList.add('heal-glow');
    setTimeout(() => card.classList.remove('heal-glow'), 600);
  }

  await wait(step.duration || 600, signal);
  pop.remove();
}

// -- buffPop ("+X/+X" nutrition style) --
async function handleBuffPop(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

  if (step.atk !== undefined) setStat(slot, 'atk', Number(slot.dataset.atk) + step.atk);
  if (step.hp !== undefined) setStat(slot, 'hp', Number(slot.dataset.hp) + step.hp);
  const pop = document.createElement('div');
  pop.className = 'tutorial-buff-pop';
  pop.textContent = step.text || `+${step.atk}/${step.hp}`;
  slot.appendChild(pop);

  await wait(step.duration || 800, signal);
  pop.remove();
}

// -- death --
async function handleDeath(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

  slot.style.transition = `opacity ${step.duration || 700}ms ease-in, transform ${step.duration || 700}ms ease-in`;
  slot.style.opacity = '0';
  slot.style.transform = 'scale(0.7)';

  await wait(step.duration || 700, signal);
  slot.style.transform = '';
}

// -- applyStatus (inject overlay DOM onto card) --
function handleApplyStatus(step) {
  const slot = slotElements[step.target];
  const cardEl = slot?.querySelector('.card');
  if (!cardEl) return;

  // Remove existing overlay of this type
  cardEl.querySelector(`.${step.status}-overlay`)?.remove();

  const overlay = document.createElement('div');
  overlay.className = `status-overlay ${step.status}-overlay`;

  switch (step.status) {
    case 'paralysis':
      setStat(slot, 'atk', 0);
      cardEl.querySelector('.card-keywords').innerHTML =
        '<div class="card-keywords-text"><span class="keyword-tag">Harmless</span></div>';
      cardEl.querySelector('.card-effect')?.remove();
      for (let i = 0; i < 4; i++) {
        const spark = document.createElement('div');
        spark.className = `electric-spark spark-${i + 1}`;
        overlay.appendChild(spark);
      }
      break;
    case 'frozen':
      [
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
        'top-center',
        'left-center',
        'right-center',
      ].forEach((pos) => {
        const icicle = document.createElement('div');
        icicle.className = `icicle icicle-${pos}`;
        overlay.appendChild(icicle);
      });
      const frost = document.createElement('div');
      frost.className = 'frost-crystals';
      overlay.appendChild(frost);
      break;
    case 'barrier':
      // Simple golden glow overlay
      break;
    case 'webbed':
      ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach((pos) => {
        const strand = document.createElement('div');
        strand.className = `web-strand web-${pos}`;
        overlay.appendChild(strand);
      });
      break;
    case 'hidden':
      for (let i = 0; i < 3; i++) {
        const wave = document.createElement('div');
        wave.className = `hidden-wave wave-${i + 1}`;
        overlay.appendChild(wave);
      }
      break;
    case 'invisible':
      ['top', 'right', 'bottom', 'left'].forEach((pos) => {
        const prism = document.createElement('div');
        prism.className = `prism-edge prism-${pos}`;
        overlay.appendChild(prism);
      });
      break;
    case 'lure':
      for (let i = 0; i < 3; i++) {
        const ring = document.createElement('div');
        ring.className = `lure-ring ring-${i + 1}`;
        overlay.appendChild(ring);
      }
      ['top', 'right', 'bottom', 'left'].forEach((pos) => {
        const arr = document.createElement('div');
        arr.className = `lure-arrow arrow-${pos}`;
        overlay.appendChild(arr);
      });
      break;
    case 'venom':
      ['left-1', 'left-2', 'right-1', 'right-2'].forEach((pos, i) => {
        const drip = document.createElement('div');
        drip.className = `venom-drip drip-${pos}`;
        drip.style.animationDelay = `${i * 0.4}s`;
        overlay.appendChild(drip);
      });
      const pool = document.createElement('div');
      pool.className = 'venom-pool';
      overlay.appendChild(pool);
      break;
  }

  cardEl.appendChild(overlay);
}

// -- removeStatus --
function handleRemoveStatus(step) {
  const slot = slotElements[step.target];
  const cardEl = slot?.querySelector('.card');
  if (!cardEl) return;
  cardEl.querySelector(`.${step.status}-overlay`)?.remove();
}

// -- consumeInto (prey shrinks into predator) --
async function handleConsumeInto(step, signal) {
  const preySlot = slotElements[step.from];
  const predSlot = slotElements[step.to];
  if (!preySlot || !predSlot) return;

  const preyCard = preySlot.querySelector('.card');
  if (!preyCard) return;

  const bounds = stageEl.getBoundingClientRect();
  const preyRect = preyCard.getBoundingClientRect();
  const predRect = predSlot.getBoundingClientRect();

  // Create ghost of prey
  const ghost = preyCard.cloneNode(true);
  ghost.classList.add('tutorial-attack-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText = `
    position: absolute;
    width: ${preyRect.width}px;
    height: ${preyRect.height}px;
    left: ${preyRect.left - bounds.left + preyRect.width / 2}px;
    top: ${preyRect.top - bounds.top + preyRect.height / 2}px;
    z-index: 1001;
    pointer-events: none;
    transform: translate(-50%, -50%);
  `;
  stageEl.appendChild(ghost);

  removeArrow();
  // Keep the source position visible as a labelled destination after consumption.
  preySlot.classList.add('tutorial-departed');

  const deltaX = predRect.left + predRect.width / 2 - (preyRect.left + preyRect.width / 2);
  const deltaY = predRect.top + predRect.height / 2 - (preyRect.top + preyRect.height / 2);

  const animation = ghost.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, filter: 'brightness(1)' },
      {
        transform: 'translate(-50%, -50%) scale(0.8)',
        opacity: 0.9,
        filter: 'brightness(1.2)',
        offset: 0.3,
      },
      {
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.1)`,
        opacity: 0,
        filter: 'brightness(0.5)',
      },
    ],
    {
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 1
        : step.duration || 600,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    }
  );

  const cancel = () => animation.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    await animation.finished;
  } finally {
    signal?.removeEventListener('abort', cancel);
    ghost.remove();
  }
}

// -- highlight (glow ring around a specific element) --
async function handleHighlight(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

  slot.classList.add('tutorial-highlight');
  await wait(step.duration || 1500, signal);
  slot.classList.remove('tutorial-highlight');
}

// -- pulsestat (NUT or stat value breathing animation) --
async function handlePulseStat(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

  slot.classList.add('tutorial-pulse-stat');
  await wait(step.duration || 1500, signal);
  slot.classList.remove('tutorial-pulse-stat');
}

// -- spellEffect (visual burst on target) --
async function handleSpellEffect(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

  const burst = document.createElement('div');
  burst.className = `tutorial-spell-burst tutorial-spell-${step.style || 'default'}`;
  slot.appendChild(burst);

  await wait(step.duration || 600, signal);
  burst.remove();
}
