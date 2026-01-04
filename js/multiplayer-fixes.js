// Fix 1: Improve roll broadcasting with error handling and retry logic
const broadcastSetupRoll = async (state, playerIndex, rollValue) => {
  const maxRetries = 3;
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      // Ensure state is consistent before broadcasting
      if (state.setup?.rolls?.[playerIndex] !== rollValue) {
        console.warn(`Roll mismatch detected. Expected: ${rollValue}, Actual: ${state.setup?.rolls?.[playerIndex]}`);
        state.setup.rolls[playerIndex] = rollValue; // Force sync
      }
      
      const payload = buildLobbySyncPayload(state);
      console.log(`Broadcasting roll for Player ${playerIndex + 1}: ${rollValue}`, payload);
      
      sendLobbyBroadcast("sync_state", payload);
      
      // Also save to database as backup
      await saveGameStateToDatabase(state);
      
      console.log(`Roll broadcast successful for Player ${playerIndex + 1}`);
      return true;
    } catch (error) {
      attempts++;
      console.error(`Roll broadcast attempt ${attempts} failed:`, error);
      
      if (attempts < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 100));
      }
    }
  }
  
  console.error(`Failed to broadcast roll after ${maxRetries} attempts`);
  return false;
};

// Fix 2: Enhanced roll validation in sync payload
const validateAndApplyRolls = (state, payload) => {
  if (!Array.isArray(payload.setup?.rolls)) {
    console.warn("Invalid rolls data in payload:", payload.setup);
    return false;
  }
  
  let rollsUpdated = false;
  payload.setup.rolls.forEach((roll, index) => {
    // More thorough validation
    if (typeof roll === 'number' && roll >= 1 && roll <= 10) {
      if (state.setup.rolls[index] !== roll) {
        console.log(`Applying roll for Player ${index + 1}: ${roll}`);
        state.setup.rolls[index] = roll;
        rollsUpdated = true;
      }
    } else if (roll === null || roll === undefined) {
      // Valid "no roll yet" state
      if (state.setup.rolls[index] !== null) {
        console.log(`Clearing roll for Player ${index + 1}`);
        state.setup.rolls[index] = null;
        rollsUpdated = true;
      }
    } else {
      console.warn(`Invalid roll value for Player ${index + 1}:`, roll);
    }
  });
  
  return rollsUpdated;
};

// Fix 3: Add roll state consistency checker
const checkRollConsistency = (state) => {
  if (!state.setup || state.setup.stage !== "rolling") {
    return true;
  }
  
  const issues = [];
  
  // Check for invalid roll values
  state.setup.rolls.forEach((roll, index) => {
    if (roll !== null && (typeof roll !== 'number' || roll < 1 || roll > 10)) {
      issues.push(`Invalid roll for Player ${index + 1}: ${roll}`);
    }
  });
  
  // Check for stuck rolling state
  const hasValidRolls = state.setup.rolls.every(roll => roll === null || (typeof roll === 'number' && roll >= 1 && roll <= 10));
  if (!hasValidRolls) {
    issues.push("Roll array contains invalid data");
  }
  
  if (issues.length > 0) {
    console.error("Roll consistency issues detected:", issues);
    // Attempt to fix by resetting invalid rolls
    state.setup.rolls = state.setup.rolls.map(roll => 
      (typeof roll === 'number' && roll >= 1 && roll <= 10) ? roll : null
    );
    return false;
  }
  
  return true;
};

// Fix 4: Enhanced setup roll handler with validation
const safeRollSetupDie = (state, playerIndex) => {
  // Pre-roll validation
  if (!checkRollConsistency(state)) {
    console.warn("Roll consistency check failed, attempting to fix state");
  }
  
  const originalRoll = rollSetupDie(state, playerIndex);
  
  if (originalRoll === null) {
    console.error(`Failed to roll for Player ${playerIndex + 1}`);
    return null;
  }
  
  // Post-roll validation
  if (!checkRollConsistency(state)) {
    console.error("Roll consistency check failed after rolling");
    // Attempt recovery
    state.setup.rolls[playerIndex] = originalRoll;
  }
  
  return originalRoll;
};
