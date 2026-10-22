// Diagnostic observations, NOT regression assertions. See docs/UI-RECOVERY-REVIEW-2026-10-21.md.
import { chromium } from '@playwright/test';
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
try {
  await page.goto(process.env.TCG_BASE || 'http://127.0.0.1:8123');
  await page.waitForFunction(() => !!window.__qa);
  console.log(
    JSON.stringify(
      await page.evaluate(async () => {
        const { createGameState } = await import('/js/state/gameState.js');
        const { createCardInstance } = await import('/js/cardTypes.js');
        const { getCardDefinitionById } = await import('/js/cards/registry.js');
        const { buildLobbySyncPayload, applyLobbySyncPayload } =
          await import('/js/network/serialization.js');
        const { GameController } = await import('/js/game/controller.js');
        const make = () => {
          const s = createGameState();
          s.phase = 'End';
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
        const h = card(s, 'bird-prey-hoatzin');
        s.endOfTurnQueue = [h];
        let t = restore(s);
        const before = t.players[1].hp;
        out.queueIdentity = t.endOfTurnQueue[0] === t.players[0].field[0];
        ctl(t).execute({ type: 'PROCESS_END_PHASE', payload: {} });
        out.restoredHoatzinDamage = before - t.players[1].hp;
        s = make();
        const b = card(s, 'bird-prey-white-bellbird');
        card(s, 'amphibian-prey-axolotl', 1);
        s.endOfTurnQueue = [b];
        let pending;
        ctl(s, (x) => (pending = x)).execute({ type: 'PROCESS_END_PHASE', payload: {} });
        t = restore(s);
        let resumed = false;
        out.interruptedSelection = {
          selectionOpened: !!pending,
          sourceQueue: s.endOfTurnQueue.length,
          sourceProcessing: s.endOfTurnProcessing,
          restoredQueue: t.endOfTurnQueue.length,
          restoredProcessing: t.endOfTurnProcessing,
          result: ctl(t, () => (resumed = true)).execute({
            type: 'PROCESS_END_PHASE',
            payload: {},
          }),
          selectionReopened: resumed,
        };
        const { renderSelectionPanel, clearSelectionPanel } =
          await import('/js/ui/components/SelectionPanel.js');
        renderSelectionPanel({ title: 'First', items: [], onConfirm: () => {} });
        document.querySelector('#selection-panel .hide-panel-btn').click();
        clearSelectionPanel();
        renderSelectionPanel({ title: 'Second', items: [], onConfirm: () => {} });
        out.nextSelection = {
          minimized: document.querySelector('#selection-panel').classList.contains('minimized'),
          button: document.querySelector('#selection-panel .hide-panel-btn').textContent,
          contentDisplay: getComputedStyle(
            document.querySelector('#selection-panel .selection-content')
          ).display,
        };
        const { showSettingsOverlay, hideSettingsOverlay } =
          await import('/js/ui/overlays/SettingsOverlay.js');
        const behind = document.createElement('button');
        behind.id = 'review-behind';
        document.body.append(behind);
        behind.focus();
        showSettingsOverlay();
        out.settingsFocus = {
          activeElement: document.activeElement.id,
          insideDialog: document
            .querySelector('#settings-floating-overlay')
            .contains(document.activeElement),
          dialogRole: document.querySelector('#settings-floating-overlay').getAttribute('role'),
        };
        hideSettingsOverlay();
        const { resolveEffectResult } = await import('/js/game/effects.js');
        s = make();
        const empowered = card(s, 'amphibian-prey-axolotl');
        resolveEffectResult(
          s,
          { empowerWithEndEffect: { creature: empowered, tokenId: 'token-blue-egg' } },
          { playerIndex: 0, opponentIndex: 1, card: empowered }
        );
        s.endOfTurnQueue = [empowered];
        t = restore(s);
        ctl(s).execute({ type: 'PROCESS_END_PHASE', payload: {} });
        ctl(t).execute({ type: 'PROCESS_END_PHASE', payload: {} });
        out.grantedSummon = {
          uninterruptedTokens: s.players[0].field.filter((c) => c?.id === 'token-blue-egg').length,
          restoredTokens: t.players[0].field.filter((c) => c?.id === 'token-blue-egg').length,
        };
        const { updateDragState } = await import('/js/ui/input/dragAndDrop.js');
        const { initTouchHandlers } = await import('/js/ui/input/touchHandlers.js');
        s = make();
        s.phase = 'Main 1';
        const hand = createCardInstance(getCardDefinitionById('amphibian-prey-axolotl'), 1);
        s.players[0].hand = [hand];
        updateDragState(s);
        document.body.innerHTML =
          '<div id="active-hand" style="position:fixed;left:0;top:0;width:390px;height:400px"><div class="card" style="position:absolute;left:30px;top:30px;width:100px;height:150px" data-instance-id="' +
          hand.instanceId +
          '">Axolotl</div></div><div class="player-field"></div>';
        initTouchHandlers();
        const el = document.querySelector('.card');
        const pt = new Touch({ identifier: 1, target: el, clientX: 80, clientY: 80 });
        el.dispatchEvent(
          new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [pt],
            changedTouches: [pt],
          })
        );
        const focusedBefore = el.classList.contains('hand-focus');
        el.dispatchEvent(
          new TouchEvent('touchcancel', {
            bubbles: true,
            cancelable: true,
            touches: [],
            changedTouches: [pt],
          })
        );
        out.touchCancel = { focusedBefore, focusedAfter: el.classList.contains('hand-focus') };
        return out;
      }),
      null,
      2
    )
  );
} finally {
  await browser.close();
}
