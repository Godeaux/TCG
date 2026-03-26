/**
 * Generic Selection UI Handler
 * 
 * Detects and handles any selection panel that appears in the game UI.
 * Works for spell targets, Pistol Shrimp choices, or any card effect
 * that requires the player to choose from options.
 * 
 * Flow:
 * 1. Check if selection panel is visible
 * 2. Read available options (name, stats, type)
 * 3. Pick the best option (heuristic: prefer opponent creatures, highest value)
 * 4. Click the chosen option
 */

/**
 * Check for and handle any pending selection UI
 * @param {Page} page - Playwright page
 * @param {string} context - What triggered this (e.g., "spell:Harpoon", "effect:PistolShrimp")
 * @returns {Object} { handled: boolean, choice: string|null }
 */
async function handleSelectionUI(page, context = '') {
  // Check if selection panel is visible with options
  const panelInfo = await page.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel || panel.offsetHeight === 0) return { visible: false };
    
    // Find all clickable items in the panel
    const items = panel.querySelectorAll('.selection-list > *, .selection-item, .card');
    const options = [];
    
    for (const item of items) {
      if (item.offsetHeight === 0) continue; // Skip hidden
      
      // Try to extract card info
      const nameEl = item.querySelector('[class*="name"], .card-name, strong');
      const name = nameEl?.textContent?.trim() || item.textContent?.trim()?.substring(0, 30) || 'Unknown';
      const instanceId = item.dataset?.instanceId || item.querySelector('.card')?.dataset?.instanceId;
      
      options.push({
        index: options.length,
        name,
        instanceId,
        element: true, // marker that this came from DOM
      });
    }
    
    // Also check for standalone buttons (confirm, cancel, etc.)
    const buttons = panel.querySelectorAll('button');
    const visibleButtons = Array.from(buttons).filter(b => b.offsetHeight > 0);
    
    // Get title
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
  
  // Pick the first option (simple heuristic — can be upgraded to LLM choice later)
  // Click the first item in the selection list
  const clicked = await page.evaluate((targetIndex) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return false;
    
    const items = panel.querySelectorAll('.selection-list > *, .selection-item');
    const visible = Array.from(items).filter(i => i.offsetHeight > 0);
    
    if (visible[targetIndex]) {
      visible[targetIndex].click();
      return true;
    }
    
    // Fallback: click any visible card
    const cards = panel.querySelectorAll('.card');
    const visibleCards = Array.from(cards).filter(c => c.offsetHeight > 0);
    if (visibleCards[targetIndex]) {
      visibleCards[targetIndex].click();
      return true;
    }
    
    return false;
  }, 0); // Always pick first option for now
  
  if (clicked) {
    await page.waitForTimeout(500);
    
    // Check if a confirm button needs to be clicked
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
    
    console.log(`  [SELECTION] Chose: ${panelInfo.options[0]?.name}`);
    return { handled: true, choice: panelInfo.options[0]?.name };
  }
  
  return { handled: false, choice: null };
}

module.exports = { handleSelectionUI };
