// Diagnostic only: observations are NOT desired-outcome assertions. See docs/RESKIN-READINESS-REVIEW-2026-10-21.md.
import { chromium } from '@playwright/test';
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(process.env.TCG_BASE || 'http://127.0.0.1:8123');
  await page.waitForFunction(() => !!window.__qa);
  const out = await page.evaluate(async () => {
    const { createGameState } = await import('/js/state/gameState.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/registry.js');
    const { GameController } = await import('/js/game/controller.js');
    const { resolveEffectResult } = await import('/js/game/effects.js');
    const { buildLobbySyncPayload, applyLobbySyncPayload } =
      await import('/js/network/serialization.js');
    const make = () => {
      const s = createGameState();
      s.phase = 'Combat';
      s.turn = 4;
      s.activePlayerIndex = 0;
      s.setup.stage = 'complete';
      s.deckSelection.stage = 'complete';
      return s;
    };
    const card = (s, id, p = 0, slot = 0) =>
      (s.players[p].field[slot] = createCardInstance(getCardDefinitionById(id), 1));
    const ctl = (s, selection = () => {}) =>
      new GameController(
        s,
        { pendingConsumption: null },
        { onStateChange: () => {}, onBroadcast: () => {}, onSelectionNeeded: selection }
      );
    const restore = (s) => {
      const t = make();
      applyLobbySyncPayload(t, JSON.parse(JSON.stringify(buildLobbySyncPayload(s))), {
        forceApply: true,
      });
      return t;
    };
    const out = {};
    let s = make();
    let a = card(s, 'amphibian-prey-axolotl');
    let d = card(s, 'reptile-prey-solomons-coral-snake', 1);
    let c = ctl(s);
    const attack = c.execute({
      type: 'RESOLVE_ATTACK',
      payload: { attacker: a, target: { type: 'creature', card: d } },
    });
    const afterCombat = {
      success: attack.success,
      hp: a.currentHp,
      paralyzed: a.paralyzed,
      deadline: a.paralyzedUntilTurn,
      turn: s.turn,
    };
    c.execute({ type: 'ADVANCE_PHASE', payload: {} });
    c.execute({ type: 'ADVANCE_PHASE', payload: {} });
    let steps = 0;
    while (s.phase === 'End' && !s.endOfTurnFinalized && steps++ < 5)
      c.execute({ type: 'PROCESS_END_PHASE', payload: {} });
    out.paralysis = {
      afterCombat,
      atEnd: {
        phase: s.phase,
        finalized: s.endOfTurnFinalized,
        stillOnField: s.players[0].field.includes(a),
        hp: a.currentHp,
      },
    };
    s = make();
    s.phase = 'Main 1';
    a = card(s, 'bird-prey-mockingbird');
    d = card(s, 'bird-prey-hoatzin', 0, 1);
    const context = { playerIndex: 0, opponentIndex: 1, card: a };
    resolveEffectResult(s, { copyAbilities: { target: a, source: d } }, context);
    resolveEffectResult(s, { returnToHand: { card: a } }, context);
    out.bounceCopied = {
      inHand: s.players[0].hand.includes(a),
      copiedFromId: a.copiedFromId,
      hasPrintedOnPlay: !!a.effects?.onPlay,
      hasCopiedOnEnd: !!a.effects?.onEnd,
      expectedPrintedOnPlay: !!getCardDefinitionById(a.id).effects?.onPlay,
    };
    s = make();
    a = card(s, 'bird-prey-mockingbird');
    d = card(s, 'bird-prey-hoatzin', 0, 1);
    const b = card(s, 'bird-prey-mexican-violetear', 0, 2);
    resolveEffectResult(
      s,
      { copyAbilities: { target: a, source: d } },
      { playerIndex: 0, opponentIndex: 1, card: a }
    );
    resolveEffectResult(s, { killCreature: a }, { playerIndex: 0, opponentIndex: 1, card: d });
    ctl(s).cleanupDestroyed();
    let copyChoice;
    const copyController = ctl(s, (x) => (copyChoice = x));
    copyController.execute({
      type: 'TRIGGER_EFFECT',
      payload: {
        card: b,
        effectType: 'onPlay',
        context: {
          player: s.players[0],
          opponent: s.players[1],
          creature: b,
          playerIndex: 0,
          opponentIndex: 1,
          card: b,
        },
      },
    });
    if (!copyChoice?.selectTarget) throw new Error('Expected real carrion-copy choice');
    const candidates =
      typeof copyChoice.selectTarget.candidates === 'function'
        ? copyChoice.selectTarget.candidates()
        : copyChoice.selectTarget.candidates;
    const choice = candidates.find(
      (x) => (x.value?.creature ?? x.creature)?.instanceId === a.instanceId
    );
    if (!choice) throw new Error('Copied Mockingbird absent from actual carrion choices');
    copyChoice.onSelect(choice.value ?? choice);
    let t = restore(s);
    out.copyOfCopy = {
      beforeOnEnd: b.effects?.onEnd ?? null,
      afterOnEnd: t.players[0].field[2].effects?.onEnd ?? null,
      copiedFromId: b.copiedFromId,
    };
    s = make();
    s.phase = 'End';
    a = card(s, 'bird-prey-white-bellbird');
    card(s, 'amphibian-prey-axolotl', 1);
    s.endOfTurnQueue = [a];
    let pending;
    ctl(s, (x) => (pending = x)).execute({ type: 'PROCESS_END_PHASE', payload: {} });
    t = restore(s);
    let reopened = false;
    const rr = ctl(t, () => (reopened = true)).execute({ type: 'PROCESS_END_PHASE', payload: {} });
    out.inflightEnd = {
      promptOpened: !!pending,
      restoredQueue: t.endOfTurnQueue.length,
      result: rr,
      reopened,
    };
    const { validateAction } = await import('/js/network/actionValidator.js');
    const { serializeAction, deserializeAction } = await import('/js/network/actionSerializer.js');
    s = make();
    s.menu.mode = 'online';
    s.menu.lobby = { id: 1, host_id: 'host', guest_id: 'guest' };
    s.menu.profile = { id: 'host' };
    s.activePlayerIndex = 1;
    const hostCreature = card(s, 'bird-prey-hoatzin', 0);
    card(s, 'amphibian-prey-axolotl', 1);
    const wire = JSON.parse(
      JSON.stringify(
        serializeAction({
          type: 'RESOLVE_ATTACK',
          payload: { attacker: hostCreature, target: { type: 'player', playerIndex: 0 } },
        })
      )
    );
    const action = deserializeAction(wire, s);
    const validity = validateAction(action, 'guest', s);
    const hp = s.players[0].hp;
    const execution = validity.valid ? ctl(s).execute(action) : null;
    out.opponentAttacker = {
      validation: validity,
      execution,
      hostHpBefore: hp,
      hostHpAfter: s.players[0].hp,
      attackerOwner: 0,
      senderSeat: 1,
    };
    s = make();
    s.activePlayerIndex = 1;
    s.phase = 'End';
    s.endOfTurnFinalized = true;
    card(s, 'reptile-prey-phantastic-leaf-tailed-gecko', 0);
    const kakapo = card(s, 'bird-prey-kakapo', 1);
    resolveEffectResult(
      s,
      { damageCreature: { creature: kakapo, amount: 1 } },
      { playerIndex: 0, opponentIndex: 1 }
    );
    c = ctl(s);
    const transition = c.execute({ type: 'END_TURN', payload: {} });
    out.startPhaseDeath = {
      transition,
      active: s.activePlayerIndex,
      phase: s.phase,
      kakapoInCarrion: s.players[1].carrion.some((x) => x.instanceId === kakapo.instanceId),
      feathersInHand: s.players[1].hand.filter((x) => x.id === 'token-kakapo-feathers').length,
    };
    const { updateDragState } = await import('/js/ui/input/dragAndDrop.js');
    const { initTouchHandlers } = await import('/js/ui/input/touchHandlers.js');
    s = make();
    a = card(s, 'amphibian-prey-axolotl');
    updateDragState(s);
    document.body.innerHTML =
      '<div id="active-hand"></div><div class="player-field" style="position:fixed;left:0;top:0;width:390px;height:400px"><div class="card" style="position:absolute;left:30px;top:30px;width:100px;height:150px" data-instance-id="' +
      a.instanceId +
      '">Axolotl</div></div><button id="audit-opener">Open settings</button>';
    initTouchHandlers();
    const el = document.querySelector('.card');
    const touch = (type) => {
      const p = new Touch({ identifier: 1, target: el, clientX: 80, clientY: 80 });
      el.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchstart' ? [p] : [],
          changedTouches: [p],
        })
      );
    };
    touch('touchstart');
    const focused = el.classList.contains('hand-focus');
    touch('touchend');
    out.fieldRelease = {
      focusedOnStart: focused,
      focusedAfterRelease: el.classList.contains('hand-focus'),
    };
    const { showSettingsOverlay } = await import('/js/ui/overlays/SettingsOverlay.js');
    const opener = document.querySelector('#audit-opener');
    window.__backgroundClicks = 0;
    opener.addEventListener('click', () => window.__backgroundClicks++);
    opener.focus();
    showSettingsOverlay();
    return out;
  });
  // Native browser keyboard input, not dispatchEvent(new KeyboardEvent('Tab')).
  const nativeFocus = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    nativeFocus.push(
      await page.evaluate(() => ({
        id: document.activeElement.id,
        inside: document
          .querySelector('#settings-floating-overlay')
          .contains(document.activeElement),
      }))
    );
  }
  out.settingsNativeTab = {
    allInside: nativeFocus.every((x) => x.inside),
    distinctFocusedElements: [...new Set(nativeFocus.map((x) => x.id))],
  };
  await page.evaluate(() => document.querySelector('#audit-opener').focus());
  await page.keyboard.press('Enter');
  out.settingsEscapedFocus = await page.evaluate(() => ({
    modalOpen: document.querySelector('#settings-floating-overlay').classList.contains('active'),
    backgroundActivations: window.__backgroundClicks,
  }));
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
