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

  // Stage (left)
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
  stageEl.appendChild(labelEl);

  // Text panel (right) — nav lives at top of this column
  textPanelEl = document.createElement('div');
  textPanelEl.className = 'tutorial-text-panel';

  navEl = document.createElement('div');
  navEl.className = 'tutorial-nav';
  buildNav();
  textPanelEl.appendChild(navEl);

  // Text content area (title + description go here)
  textContentEl = document.createElement('div');
  textContentEl.className = 'tutorial-text-content';
  textPanelEl.appendChild(textContentEl);

  wrapper.appendChild(stageEl);
  wrapper.appendChild(textPanelEl);
  containerEl.appendChild(wrapper);
}

function buildNav() {
  navEl.innerHTML = '';
  const total = TUTORIAL_SCENES.length;

  // Prev button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'tutorial-nav-btn';
  prevBtn.textContent = '←';
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
  nextBtn.textContent = '→';
  nextBtn.onclick = () => goToScene(currentSceneIndex + 1);
  navEl.appendChild(nextBtn);
}

function updateNav() {
  if (!navEl) return;
  const counter = navEl.querySelector('.tutorial-nav-counter');
  if (counter) counter.textContent = `${currentSceneIndex + 1} / ${TUTORIAL_SCENES.length}`;
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
    <h3 class="tutorial-scene-title">${scene.title}</h3>
    <div class="tutorial-scene-text">${scene.text}</div>
  `;

  // Place cards in slots
  if (scene.demo?.setup) {
    for (const { slot, card } of scene.demo.setup) {
      const el = slotElements[slot];
      if (!el) continue;
      const cardEl = renderCard(card, {
        showEffectSummary: true,
        useBaseStats: true,
        context: 'tooltip',
      });
      el.appendChild(cardEl);
      el.style.opacity = '0';
    }
  }

  startDemo(scene.demo);
}

// ============================================================================
// DEMO RUNNER
// ============================================================================

function stopDemo() {
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

function resetStage() {
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
  for (const step of steps) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await executeStep(step, signal);
  }
}

// ============================================================================
// STEP HANDLERS
// ============================================================================

async function executeStep(step, signal) {
  switch (step.type) {
    case 'fadeIn':
      return handleFadeIn(step);
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
      return handleLabel(step);
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
function handleFadeIn(step) {
  const targets = step.target === 'all' ? Object.values(slotElements) : [slotElements[step.target]];
  for (const slot of targets) {
    if (slot && slot.children.length > 0) {
      slot.style.transition = `opacity ${step.duration || 400}ms ease-out`;
      slot.style.opacity = '1';
    }
  }
  return wait(step.duration || 400);
}

// -- wait --
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
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
  document.body.appendChild(arrowSvg);
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
  document.body.appendChild(arrowSvg);
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
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('ai-attack-arrow', 'tutorial-arrow');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
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
  const toRect = toSlot.getBoundingClientRect();

  const ghost = fromCard.cloneNode(true);
  ghost.classList.add('tutorial-attack-ghost');
  ghost.style.cssText = `
    position: fixed;
    width: ${fromRect.width}px;
    height: ${fromRect.height}px;
    left: ${fromRect.left + fromRect.width / 2}px;
    top: ${fromRect.top + fromRect.height / 2}px;
    z-index: 1001;
    pointer-events: none;
    transform: translate(-50%, -50%);
  `;
  document.body.appendChild(ghost);
  removeArrow();

  const deltaX = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const deltaY = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

  const animation = ghost.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95 },
      { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.7 },
      {
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.95)`,
        opacity: 0.2,
      },
    ],
    { duration: step.duration || 420, easing: 'cubic-bezier(0.2, 0.85, 0.35, 1)' }
  );
  await animation.finished;
  ghost.remove();
}

// -- damagePop --
async function handleDamagePop(step, signal) {
  const slot = slotElements[step.target];
  if (!slot) return;

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

  const preyRect = preyCard.getBoundingClientRect();
  const predRect = predSlot.getBoundingClientRect();

  // Create ghost of prey
  const ghost = preyCard.cloneNode(true);
  ghost.style.cssText = `
    position: fixed;
    width: ${preyRect.width}px;
    height: ${preyRect.height}px;
    left: ${preyRect.left + preyRect.width / 2}px;
    top: ${preyRect.top + preyRect.height / 2}px;
    z-index: 1001;
    pointer-events: none;
    transform: translate(-50%, -50%);
  `;
  document.body.appendChild(ghost);

  // Hide original
  preySlot.style.opacity = '0';

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
    { duration: step.duration || 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
  );

  await animation.finished;
  ghost.remove();
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
