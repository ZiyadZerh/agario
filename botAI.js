/*
  This file contains smarter AI behavior for bot cells.
  It loops over all AI-controlled cells (in the global aiCells array) and:
    • If the bot is "small" (i.e. sees opponents larger than itself by >10% within a danger range),
      it steers away to avoid being eaten.
    • If the bot is "big" enough, it seeks out smaller opponents (players or bots) within a prey range.
    • If a target you're chasing is very small and is close, the bot will split with full force.
      Boss cells split on targets that are less than 45% of their mass.
*/

function updateBotAI() {
  const now = performance.now();
  const dangerDistance = 300;
  const preyDistance = 400;
  const splitDistance = 150;
  // Loop through every bot.
  for (let bot of aiCells) {
    let steerX = 0;
    let steerY = 0;
    let count = 0;

    // For boss cells, extend the chasing (prey) range.
    let effectivePreyDistance = preyDistance;
    if (bot.isBoss) {
      effectivePreyDistance = 600;
    }

    // Create a combined opponent list (players plus other bots).
    let opponents = [...playerCells];
    for (let other of aiCells) {
      if (other !== bot) {
        opponents.push(other);
      }
    }

    // Apply rules for each opponent.
    for (let op of opponents) {
      let d = distance(bot.x, bot.y, op.x, op.y);
      if (d === 0) continue;
      // Danger: if the opponent is larger than 110% of bot mass, steer away.
      if (op.mass > bot.mass * 1.1 && d < dangerDistance) {
        steerX -= (op.x - bot.x) / d;
        steerY -= (op.y - bot.y) / d;
        count++;
      }
      // Prey: if the opponent is smaller (less than 90% of bot mass) steer toward it.
      if (op.mass < bot.mass * 0.9 && d < effectivePreyDistance) {
        steerX += (op.x - bot.x) / d;
        steerY += (op.y - bot.y) / d;
        count++;
        // Boss splitting condition: if the opponent is less than 45% of bot's mass,
        // or the regular condition for non-boss (less than 1/3) apply splitting logic.
        if (
          ((bot.isBoss && op.mass < bot.mass * 0.45) || (!bot.isBoss && op.mass < bot.mass / 3)) &&
          d < splitDistance &&
          now - bot.lastSplitTime > MERGE_DELAY
        ) {
          splitBot(bot, 20); // using 20 as the full-force impulse.
          // To avoid multiple splits in one update, break after splitting.
          break;
        }
      }
    }
    if (count > 0) {
      // Average out the steering vector.
      steerX /= count;
      steerY /= count;
      // Normalize the steering vector.
      let mag = Math.sqrt(steerX * steerX + steerY * steerY);
      if (mag > 0) {
        steerX /= mag;
        steerY /= mag;
      }
      // Choose a new speed (between 0.5 and 2).
      // Boss cells are now faster, so we don't reduce their speed.
      let speed = randomRange(0.5, 2);
      bot.vx = steerX * speed;
      bot.vy = steerY * speed;
    }
  }
}

// Modified splitting function for bots. Now accepts an impulse parameter
// (defaulting to 10 if not provided). When the full-force split condition is met,
// a larger impulse (e.g., 20) can be applied.
function splitBot(bot, impulse = 10) {
  // Only allow splitting if the bot mass is large enough.
  if (bot.mass < 40) return;
  const newMass = bot.mass / 2;
  bot.mass = newMass;
  bot.radius = Math.sqrt(newMass);
  bot.lastSplitTime = performance.now();
  let angle = Math.atan2(bot.vy, bot.vx);
  
  // Instead of always creating a new bot, you can reuse one from a botPool.
  // For brevity, this sample just creates a new bot as before.
  let newBot = new Cell(bot.x, bot.y, bot.radius, bot.color, false);
  
  newBot.mass = newMass;
  newBot.radius = Math.sqrt(newMass);
  newBot.lastSplitTime = performance.now();
  newBot.extraVX = Math.cos(angle) * impulse;
  newBot.extraVY = Math.sin(angle) * impulse;
  newBot.x += newBot.extraVX;
  newBot.y += newBot.extraVY;
  bot.extraVX -= Math.cos(angle) * impulse * 0.5;
  bot.extraVY -= Math.sin(angle) * impulse * 0.5;
  aiCells.push(newBot);
}