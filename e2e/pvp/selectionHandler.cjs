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
 * Ask the LLM to choose between options
 */
async function askLLMChoice(title, options, gameContext) {
  const optionList = options.map((o, i) => `  [${i}] ${o.name}`).join('\n');
  const prompt = `You are playing Food Chain TCG. A choice appeared:

"${title}"

Options:
${optionList}

Game context: ${gameContext}

Pick the best option. Reply with ONLY the number (e.g. 0, 1, 2).`;

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
        options: { temperature: 0.1, num_predict: 20 },
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
      const name = nameEl?.textContent?.trim() || item.textContent?.trim()?.substring(0, 40) || 'Unknown';
      const instanceId = item.dataset?.instanceId || item.querySelector('.card')?.dataset?.instanceId;
      options.push({ index: options.length, name, instanceId });
    }
    
    const buttons = panel.querySelectorAll('button');
    const visibleButtons = Array.from(buttons).filter(b => b.offsetHeight > 0);
    const title = panel.querySelector('.selection-header strong, .selection-title')?.textContent?.trim() || '';
    
    return {
      visible: true,
      title,
      optionCount: options.length,
      options: options.map(o => ({ index: o.index, name: o.name, instanceId: o.instanceId })),
      hasConfirmButton: visibleButtons.some(b => b.textContent.toLowerCase().includes('confirm')),
    };
  });
  
  if (!panelInfo.visible || panelInfo.optionCount === 0) {
    return { handled: false, choice: null };
  }
  
  console.log(`  [SELECTION] ${context}: "${panelInfo.title}" — ${panelInfo.optionCount} options: ${panelInfo.options.map(o => o.name).join(', ')}`);
  
  // Ask LLM to choose
  const chosenIndex = await askLLMChoice(panelInfo.title, panelInfo.options, gameContext || context);
  
  // Click the chosen item
  const clicked = await page.evaluate((targetIndex) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return false;
    
    const items = panel.querySelectorAll('.selection-list > *, .selection-item');
    const visible = Array.from(items).filter(i => i.offsetHeight > 0);
    if (visible[targetIndex]) { visible[targetIndex].click(); return true; }
    
    const cards = panel.querySelectorAll('.card');
    const visibleCards = Array.from(cards).filter(c => c.offsetHeight > 0);
    if (visibleCards[targetIndex]) { visibleCards[targetIndex].click(); return true; }
    
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
            b.click(); return;
          }
        }
      });
      await page.waitForTimeout(300);
    }
    
    console.log(`  [SELECTION] LLM chose [${chosenIndex}]: ${panelInfo.options[chosenIndex]?.name}`);
    return { handled: true, choice: panelInfo.options[chosenIndex]?.name };
  }
  
  return { handled: false, choice: null };
}

module.exports = { handleSelectionUI };
