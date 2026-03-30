/**
 * Generic Selection UI Handler
 *
 * Detects and handles any selection panel that appears in the game UI.
 * Uses the LLM to make strategic choices between presented options.
 * Works for spell targets, Pistol Shrimp choices, or any card effect
 * that requires the player to choose from options.
 */

const OLLAMA_CHAT_URL = 'http://localhost:11434/api/chat';

/**
 * Ask the LLM to choose between options with full game context
 */
async function askLLMChoice(title, options, gameContext) {
  const optionList = options.map((o, i) => `  [${i}] ${o.name}`).join('\n');
  const prompt = `You are playing Food Chain TCG. A follow-up choice appeared after your action.

CURRENT BOARD STATE:
${gameContext}

CHOICE REQUIRED: "${title}"

Options:
${optionList}

Think about which option gives you the best strategic advantage (1-2 sentences), then reply with ONLY the number on the last line.`;

  try {
    const response = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.5:9b',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        keep_alive: '30m',
        think: false,
        options: { temperature: 0.3, num_predict: 100 },
      }),
    });
    const data = await response.json();
    const text = data.message?.content?.trim() || '0';
    const match = text.match(/(\d+)/);
    const chosen = match ? parseInt(match[1]) : 0;
    return Math.min(chosen, options.length - 1);
  } catch (e) {
    console.log(`  [SELECTION] LLM error: ${e.message}, defaulting to 0`);
    return 0;
  }
}

/**
 * Check for and handle any pending selection UI
 * @param {Page} page - Playwright page
 * @param {string} context - What triggered this (e.g., "spell:Harpoon", "play:PistolShrimp")
 * @param {string} gameContext - Brief game state for LLM context (e.g., "You 8hp, Rival 5hp")
 * @returns {Object} { handled: boolean, choice: string|null }
 */
async function handleSelectionUI(page, context = '', gameContext = '') {
  const panelInfo = await page.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel || panel.offsetHeight === 0) return { visible: false };

    const items = panel.querySelectorAll('.selection-list > *, .selection-item, .card');
    const options = [];

    for (const item of items) {
      if (item.offsetHeight === 0) continue;
      const nameEl = item.querySelector('[class*="name"], .card-name, strong');
      const name =
        nameEl?.textContent?.trim() || item.textContent?.trim()?.substring(0, 40) || 'Unknown';
      const instanceId =
        item.dataset?.instanceId || item.querySelector('.card')?.dataset?.instanceId;
      options.push({ index: options.length, name, instanceId });
    }

    const buttons = panel.querySelectorAll('button');
    const visibleButtons = Array.from(buttons).filter((b) => b.offsetHeight > 0);
    const title =
      panel.querySelector('.selection-header strong, .selection-title')?.textContent?.trim() || '';

    return {
      visible: true,
      title,
      optionCount: options.length,
      options: options.map((o) => ({ index: o.index, name: o.name, instanceId: o.instanceId })),
      hasConfirmButton: visibleButtons.some((b) => b.textContent.toLowerCase().includes('confirm')),
    };
  });

  if (!panelInfo.visible || panelInfo.optionCount === 0) {
    return { handled: false, choice: null };
  }

  console.log(
    `  [SELECTION] ${context}: "${panelInfo.title}" — ${panelInfo.optionCount} options: ${panelInfo.options.map((o) => o.name).join(', ')}`
  );

  // Ask LLM to choose
  const chosenIndex = await askLLMChoice(
    panelInfo.title,
    panelInfo.options,
    gameContext || context
  );

  // Click the chosen item
  const clicked = await page.evaluate((targetIndex) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return false;

    const items = panel.querySelectorAll('.selection-list > *, .selection-item');
    const visible = Array.from(items).filter((i) => i.offsetHeight > 0);
    if (visible[targetIndex]) {
      visible[targetIndex].click();
      return true;
    }

    const cards = panel.querySelectorAll('.card');
    const visibleCards = Array.from(cards).filter((c) => c.offsetHeight > 0);
    if (visibleCards[targetIndex]) {
      visibleCards[targetIndex].click();
      return true;
    }

    return false;
  }, chosenIndex);

  if (clicked) {
    await page.waitForTimeout(500);

    if (panelInfo.hasConfirmButton) {
      await page.evaluate(() => {
        const panel = document.getElementById('selection-panel');
        const buttons = panel?.querySelectorAll('button');
        for (const b of buttons || []) {
          if (b.textContent.toLowerCase().includes('confirm') && b.offsetHeight > 0) {
            b.click();
            return;
          }
        }
      });
      await page.waitForTimeout(300);
    }

    console.log(
      `  [SELECTION] LLM chose [${chosenIndex}]: ${panelInfo.options[chosenIndex]?.name}`
    );
    return { handled: true, choice: panelInfo.options[chosenIndex]?.name };
  }

  return { handled: false, choice: null };
}

/**
 * Check for and handle targeting mode (spell/effect target selection)
 * This is separate from the selection panel — targeting mode highlights
 * valid targets on the field and waits for a click.
 */
async function handleTargetingMode(page, context = '', gameContext = '') {
  const targetInfo = await page.evaluate(() => {
    if (!document.body.classList.contains('targeting-active')) return { active: false };

    // Get banner title
    const banner = document.getElementById('targeting-banner');
    const title = banner?.querySelector('span')?.textContent?.trim() || '';

    // Find all valid targets
    const targets = document.querySelectorAll('.effect-target');
    const options = [];
    for (const el of targets) {
      if (el.offsetHeight === 0) continue;
      const isCard = el.classList.contains('card');
      const isBadge = el.classList.contains('player-badge');

      if (isCard) {
        const nameEl = el.querySelector('[class*="name"], .card-name');
        const name = nameEl?.textContent?.trim() || 'Unknown';
        const instanceId = el.dataset.instanceId;
        options.push({ index: options.length, name, instanceId, type: 'creature' });
      } else if (isBadge) {
        const pIdx = el.dataset.playerIndex;
        options.push({
          index: options.length,
          name: `Player ${parseInt(pIdx) + 1}`,
          type: 'player',
          playerIndex: pIdx,
        });
      }
    }

    return { active: true, title, options };
  });

  if (!targetInfo.active || targetInfo.options.length === 0) {
    return { handled: false };
  }

  console.log(
    `  [TARGETING] ${context}: "${targetInfo.title}" — ${targetInfo.options.length} targets: ${targetInfo.options.map((o) => o.name).join(', ')}`
  );

  // Ask LLM to choose
  const chosenIndex = await askLLMChoice(
    targetInfo.title,
    targetInfo.options,
    gameContext || context
  );
  const chosen = targetInfo.options[chosenIndex];

  // Click the chosen target
  const clicked = await page.evaluate(({ type, instanceId, playerIndex }) => {
    if (type === 'creature' && instanceId) {
      const el = document.querySelector(`.card.effect-target[data-instance-id="${instanceId}"]`);
      if (el) {
        el.click();
        return true;
      }
    } else if (type === 'player' && playerIndex !== undefined) {
      const el = document.querySelector(
        `.player-badge.effect-target[data-player-index="${playerIndex}"]`
      );
      if (el) {
        el.click();
        return true;
      }
    }
    // Fallback: click first effect-target
    const first = document.querySelector('.effect-target');
    if (first) {
      first.click();
      return true;
    }
    return false;
  }, chosen);

  if (clicked) {
    console.log(`  [TARGETING] LLM chose [${chosenIndex}]: ${chosen.name}`);
    await page.waitForTimeout(500);
    return { handled: true, choice: chosen.name };
  }

  return { handled: false };
}

module.exports = { handleSelectionUI, handleTargetingMode };
