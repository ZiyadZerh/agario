// ===========================================================
// Main Game Code for Agar.io Clone with Splitting, Large Map,
// Numerous Food Pellets, Auto-Merging Player Cells, Smooth Growth,
// and Smarter Bot AI (calls routines from botAI.js)
// ===========================================================

/*
  Changes:
    - In the updateGame() function the global updateBotAI() (defined in botAI.js)
      is called to adjust bot behavior.
    - All other core mechanics (growth animation, merging, splitting, etc.) still apply.
*/

// ------------------------------
// GLOBAL VARIABLES & SETTINGS
// ------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;
canvas.width = canvasWidth;
canvas.height = canvasHeight;

// New huge map dimensions:
const MAP_WIDTH = 5000;
const MAP_HEIGHT = 5000;

let mouseX = canvasWidth / 2;
let mouseY = canvasHeight / 2;

// Increased spawns:
const FOOD_COUNT = 1000;
const AI_COUNT = 40;
const FOOD_MIN_RADIUS = 3;
const FOOD_MAX_RADIUS = 6;

// The minimum delay (ms) before any two player cells may merge
const MERGE_DELAY = 2500;

let foods = [];
let aiCells = [];
// Instead of one player cell, we now maintain an array of player-controlled cells.
let playerCells = [];
let gameOver = false;

// Global arrays for additional structures.
let hexagons = [];
let rainbowEffects = [];

/*
  Class: RotatingHexagon
  A structure that gives a bonus mass when eaten by a player.
  It rotates continuously and is drawn with a rainbow fill.
*/
class RotatingHexagon {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = size; // radius for drawing the hexagon.
    this.rotation = 0;
    this.rotationSpeed = randomRange(0.01, 0.05); // Rotation speed in radians per frame.
    // The bonus mass awarded when eaten.
    this.massBonus = this.size * this.size;
  }

  update() {
    this.rotation += this.rotationSpeed;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.beginPath();
    // Draw a hexagon (6 sides)
    for (let i = 0; i < 6; i++) {
      let angle = i * Math.PI / 3;
      let x = this.size * Math.cos(angle);
      let y = this.size * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    // Fill with a rainbow color based on current rotation.
    let hue = (this.rotation * 180 / Math.PI) % 360;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/*
  Class: RainbowEffect
  A temporary rainbow burst effect when a hexagon is eaten.
*/
class RainbowEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.maxLifetime = 1000; // in ms
    this.lifetime = this.maxLifetime;
    this.radius = 50; // initial radius of the effect.
  }

  update(delta) {
    this.lifetime -= delta;
  }

  draw(ctx) {
    let alpha = this.lifetime / this.maxLifetime;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Create a radial gradient for rainbow colors.
    let grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    grad.addColorStop(0, 'red');
    grad.addColorStop(0.17, 'orange');
    grad.addColorStop(0.34, 'yellow');
    grad.addColorStop(0.51, 'green');
    grad.addColorStop(0.68, 'blue');
    grad.addColorStop(0.85, 'indigo');
    grad.addColorStop(1, 'violet');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ------------------------------
// UTILITY FUNCTIONS
// ------------------------------
function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(val, max));
}

// Get average center of player's cells (for camera center)
function getPlayerCenter() {
  if (playerCells.length === 0)
    return { x: canvasWidth / 2, y: canvasHeight / 2 };
  let sumX = 0,
    sumY = 0;
  for (let cell of playerCells) {
    sumX += cell.x;
    sumY += cell.y;
  }
  return { x: sumX / playerCells.length, y: sumY / playerCells.length };
}

// ------------------------------
// CLASS: Cell (For Player, AI & Boss)
// ------------------------------
class Cell {
  /*
    A cell has a position (x,y), mass, a computed ideal radius,
    and a drawRadius used for smooth size animation.
    A color and control flag (player vs. bot) are stored, as well as extra
    velocity from splitting and a lastSplitTime property for merge delays.
    Boss cells are flagged with isBoss = true.
  */
  constructor(x, y, radius, color, isPlayer = false) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    // Mass is proportional to the area (we use radius^2)
    this.mass = Math.pow(radius, 2);
    this.color = color;
    this.isPlayer = isPlayer;
    // For AI cells: persistent velocity.
    this.vx = 0;
    this.vy = 0;
    // For player (and now bot-split cells): extra velocity (used on splitting).
    this.extraVX = 0;
    this.extraVY = 0;
    // drawRadius is used to animate growth. It starts equal to the initial radius.
    this.drawRadius = radius;
    // For bosses, this property will be set to true after creation.
    this.isBoss = false;
    if (this.isPlayer || !this.isPlayer) {
      // Set lastSplitTime on creation (used for merge delays and bot-split cooldown)
      this.lastSplitTime = performance.now();
    }
  }

  // Render the cell as a filled circle with a border.
  draw(ctx) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    // Use black outline if this is a boss; else use default "#333".
    if (this.isBoss) {
      ctx.strokeStyle = "#000";
    } else {
      ctx.strokeStyle = "#333";
    }
    ctx.lineWidth = 2;
    // Draw using drawRadius for smooth animation.
    ctx.arc(this.x, this.y, this.drawRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Increase mass and update the ideal radius instantly.
  // drawRadius is animated separately.
  grow(amount) {
    this.mass += amount;
    this.radius = Math.sqrt(this.mass);
  }

  // Update the cell's position.
  // If the cell is player-controlled, a "target" point is used.
  update(target) {
    if (this.isPlayer) {
      // Apply extra velocity (from splitting) and decay it.
      this.x += this.extraVX;
      this.y += this.extraVY;
      this.extraVX *= 0.95;
      this.extraVY *= 0.95;

      // Move toward the target.
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const angle = Math.atan2(dy, dx);
      // Movement speed decreases as the cell grows larger.
      const speed = clamp(4 - this.radius / 20, 1, 4);
      this.x += Math.cos(angle) * speed;
      this.y += Math.sin(angle) * speed;

      // Keep the cell inside the map boundaries.
      this.x = clamp(this.x, this.radius, MAP_WIDTH - this.radius);
      this.y = clamp(this.y, this.radius, MAP_HEIGHT - this.radius);
    } else {
      // For bot (AI) cells: include extraVX and extraVY so that splits are ejected.
      this.x += this.vx + this.extraVX;
      this.y += this.vy + this.extraVY;
      // Decay the splitting impulse over time.
      this.extraVX *= 0.95;
      this.extraVY *= 0.95;
      
      // Bounce off map boundaries.
      if (this.x - this.radius < 0 || this.x + this.radius > MAP_WIDTH) {
        this.vx *= -1;
      }
      if (this.y - this.radius < 0 || this.y + this.radius > MAP_HEIGHT) {
        this.vy *= -1;
      }
    }
    // Smoothly animate drawRadius toward the actual radius.
    this.drawRadius += (this.radius - this.drawRadius) * 0.1;
  }
}

// ------------------------------
// CLASS: Food (Pellets)
// ------------------------------
class Food {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------
// INITIALIZATION FUNCTIONS
// ------------------------------
function initFoods() {
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) {
    let x = randomRange(0, MAP_WIDTH);
    let y = randomRange(0, MAP_HEIGHT);
    let radius = randomRange(FOOD_MIN_RADIUS, FOOD_MAX_RADIUS);
    let color =
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0");
    foods.push(new Food(x, y, radius, color));
  }
}

function initAICells() {
  aiCells = [];
  for (let i = 0; i < AI_COUNT; i++) {
    // With a 50% chance, call spawnAICell() so that a boss cell MAY be created.
    // Otherwise, create a regular AI cell with the existing code.
    if (Math.random() < 0.5) {
      spawnAICell();
    } else {
      let x = randomRange(100, MAP_WIDTH - 100);
      let y = randomRange(100, MAP_HEIGHT - 100);
      // Weighted random: bias toward a smaller radius (range 10 to 25).
      let minRadius = 10;
      let maxRadius = 25;
      let radius = minRadius + (maxRadius - minRadius) * Math.pow(Math.random(), 2);
      let color =
        "#" +
        Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0");
      let ai = new Cell(x, y, radius, color, false);
      // Set a random initial direction and speed.
      const angle = randomRange(0, Math.PI * 2);
      ai.vx = Math.cos(angle) * randomRange(0.5, 2);
      ai.vy = Math.sin(angle) * randomRange(0.5, 2);
      aiCells.push(ai);
    }
  }
}

function initPlayer() {
  playerCells = [];
  // Place the player's initial cell at the center of the map.
  let startX = MAP_WIDTH / 2;
  let startY = MAP_HEIGHT / 2;
  let cell = new Cell(startX, startY, 20, "#00AA00", true);
  playerCells.push(cell);
}

// ------------------------------
// EVENT LISTENERS
// ------------------------------
canvas.addEventListener("mousemove", function (e) {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

// Add touch support for mobile: update target position based on the first touch.
canvas.addEventListener("touchmove", function (e) {
  e.preventDefault();  // Prevent scrolling
  const rect = canvas.getBoundingClientRect();
  let touch = e.touches[0];
  mouseX = touch.clientX - rect.left;
  mouseY = touch.clientY - rect.top;
}, { passive: false });

// Also support touchstart in case there's no movement.
canvas.addEventListener("touchstart", function (e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  let touch = e.touches[0];
  mouseX = touch.clientX - rect.left;
  mouseY = touch.clientY - rect.top;
}, { passive: false });

window.addEventListener("resize", function () {
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
});

// Restart game on canvas click if game over.
canvas.addEventListener("click", function () {
  if (gameOver) {
    startGame();
  }
});

// Listen for "Space" key to trigger splitting (for desktops).
window.addEventListener("keydown", function (event) {
  if (event.code === "Space") {
    splitPlayerCells();
  }
});

// Create mobile control buttons.
function createMobileButtons() {
  // Create a "Split" button.
  const splitButton = document.createElement("button");
  splitButton.id = "splitButton";
  splitButton.textContent = "Split";
  // Style: fixed position at bottom right.
  splitButton.style.position = "fixed";
  splitButton.style.right = "20px";
  splitButton.style.bottom = "20px";
  splitButton.style.padding = "15px 20px";
  splitButton.style.fontSize = "18px";
  splitButton.style.borderRadius = "8px";
  splitButton.style.border = "none";
  splitButton.style.background = "#00AA00";
  splitButton.style.color = "#FFF";
  splitButton.style.boxShadow = "0 4px 6px rgba(0,0,0,0.3)";
  splitButton.style.zIndex = 1000;
  document.body.appendChild(splitButton);
  
  // When tapped, call the player's split function.
  splitButton.addEventListener("click", function () {
    splitPlayerCells();
  });
}
// Create the mobile buttons once, after the document is loaded.
document.addEventListener("DOMContentLoaded", function () {
  createMobileButtons();
});

// ------------------------------
// COLLISION & GAME MECHANICS
// ------------------------------
function checkCollision(cellA, cellB) {
  return distance(cellA.x, cellA.y, cellB.x, cellB.y) < cellA.radius + cellB.radius;
}

// Merge overlapping player cells if they have waited long enough.
function mergePlayerCells() {
  const now = performance.now();
  for (let i = 0; i < playerCells.length; i++) {
    for (let j = i + 1; j < playerCells.length; j++) {
      let cellA = playerCells[i];
      let cellB = playerCells[j];
      if (distance(cellA.x, cellA.y, cellB.x, cellB.y) < cellA.radius + cellB.radius) {
        // Only merge if both cells have waited at least MERGE_DELAY milliseconds.
        if (now - cellA.lastSplitTime > MERGE_DELAY && now - cellB.lastSplitTime > MERGE_DELAY) {
          let totalMass = cellA.mass + cellB.mass;
          // Weighted average for new position.
          let newX = (cellA.x * cellA.mass + cellB.x * cellB.mass) / totalMass;
          let newY = (cellA.y * cellA.mass + cellB.y * cellB.mass) / totalMass;
          cellA.x = newX;
          cellA.y = newY;
          cellA.mass = totalMass;
          cellA.radius = Math.sqrt(totalMass);
          cellA.lastSplitTime = now;
          playerCells.splice(j, 1);
          j--;
        }
      }
    }
  }
}

// Update the game logic.
function updateGame() {
  if (gameOver) return;

  // Compute the target for player cells (centered around average position).
  const playerCenter = getPlayerCenter();
  const target = {
    x: playerCenter.x + (mouseX - canvasWidth / 2),
    y: playerCenter.y + (mouseY - canvasHeight / 2)
  };

  // Update player cells.
  for (let cell of playerCells) {
    cell.update(target);
  }

  // Update AI cells.
  for (let ai of aiCells) {
    ai.update();
  }

  // --- Newly added: call bot AI update routine ---
  if (typeof updateBotAI === "function") {
    updateBotAI();
  }
  // ----------------------------------------------

  // Check collisions: player cells & food.
  for (let cell of playerCells) {
    for (let i = foods.length - 1; i >= 0; i--) {
      let f = foods[i];
      if (distance(cell.x, cell.y, f.x, f.y) < cell.radius + f.radius) {
        cell.grow(Math.pow(f.radius, 2) * 0.5);
        foods.splice(i, 1);
        spawnFood();
      }
    }
  }

  // Check collisions: AI cells & food.
  for (let ai of aiCells) {
    for (let i = foods.length - 1; i >= 0; i--) {
      let f = foods[i];
      if (distance(ai.x, ai.y, f.x, f.y) < ai.radius + f.radius) {
        ai.grow(Math.pow(f.radius, 2) * 0.5);
        foods.splice(i, 1);
        spawnFood();
      }
    }
  }

  // Check collisions: player cells vs. AI cells.
  for (let i = aiCells.length - 1; i >= 0; i--) {
    let ai = aiCells[i];
    for (let j = playerCells.length - 1; j >= 0; j--) {
      let cell = playerCells[j];
      if (distance(cell.x, cell.y, ai.x, ai.y) < cell.radius + ai.radius) {
        if (cell.mass > ai.mass * 1.1) {
          cell.grow(ai.mass * 0.5);
          aiCells.splice(i, 1);
          // Spawn a new bot.
          spawnAICell();
          break;
        } else if (ai.mass > cell.mass * 1.1) {
          playerCells.splice(j, 1);
          if (playerCells.length === 0) {
            gameOver = true;
          }
          break;
        }
      }
    }
  }

  // Check collisions: AI cells vs. AI cells.
  for (let i = 0; i < aiCells.length; i++) {
    for (let j = i + 1; j < aiCells.length; j++) {
      let cellA = aiCells[i];
      let cellB = aiCells[j];
      if (distance(cellA.x, cellA.y, cellB.x, cellB.y) < cellA.radius + cellB.radius) {
        if (cellA.mass > cellB.mass * 1.1) {
          cellA.grow(cellB.mass * 0.5);
          aiCells.splice(j, 1);
          spawnAICell();
          j--;
        } else if (cellB.mass > cellA.mass * 1.1) {
          cellB.grow(cellA.mass * 0.5);
          aiCells.splice(i, 1);
          spawnAICell();
          i--;
          break;
        }
      }
    }
  }

  // Check collisions: player cells & hexagons.
  for (let cell of playerCells) {
    for (let i = hexagons.length - 1; i >= 0; i--) {
      let hex = hexagons[i];
      if (distance(cell.x, cell.y, hex.x, hex.y) < cell.radius + hex.size) {
        // Increase the player's cell mass by the hexagon's bonus.
        cell.grow(hex.massBonus * 1.5); // Adjust multiplier as desired.
        // Create a rainbow effect at the hexagon's location.
        rainbowEffects.push(new RainbowEffect(hex.x, hex.y));
        // Remove the hexagon.
        hexagons.splice(i, 1);
      }
    }
  }

  // Merge player cells if possible.
  mergePlayerCells();
}

function spawnFood() {
  // With a 10% chance, spawn a rotating hexagon instead of a normal food pellet.
  if (Math.random() < 0.1) {
    spawnHexagon();
  } else {
    let x = randomRange(0, MAP_WIDTH);
    let y = randomRange(0, MAP_HEIGHT);
    let radius = randomRange(FOOD_MIN_RADIUS, FOOD_MAX_RADIUS);
    let color =
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0");
    foods.push(new Food(x, y, radius, color));
  }
}

function spawnHexagon() {
  let x = randomRange(100, MAP_WIDTH - 100);
  let y = randomRange(100, MAP_HEIGHT - 100);
  let size = randomRange(10, 20); // size of the hexagon structure.
  hexagons.push(new RotatingHexagon(x, y, size));
}

// ------------------------------
// SPAWN FUNCTION FOR AI CELLS (and Bosses)
// ------------------------------
function spawnAICell() {
  let chance = Math.random();
  if (chance < 0.5) {
    // Spawn a boss: big size (radius between 50 and 70), dark blue interior.
    let x = randomRange(100, MAP_WIDTH - 100);
    let y = randomRange(100, MAP_HEIGHT - 100);
    let radius = randomRange(50, 70);
    let color = "#00008B"; // Dark blue inside.
    let boss = new Cell(x, y, radius, color, false);
    boss.isBoss = true;
    // Use lower speed for bosses.
    const angle = randomRange(0, Math.PI * 2);
    boss.vx = Math.cos(angle) * randomRange(0.3, 1);
    boss.vy = Math.sin(angle) * randomRange(0.3, 1);
    aiCells.push(boss);
  } else {
    // Normal AI cell spawn.
    let x = randomRange(100, MAP_WIDTH - 100);
    let y = randomRange(100, MAP_HEIGHT - 100);
    let minRadius = 10;
    let maxRadius = 25;
    let radius = minRadius + (maxRadius - minRadius) * Math.pow(Math.random(), 2);
    let color =
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0");
    let ai = new Cell(x, y, radius, color, false);
    const angle = randomRange(0, Math.PI * 2);
    ai.vx = Math.cos(angle) * randomRange(0.5, 2);
    ai.vy = Math.sin(angle) * randomRange(0.5, 2);
    aiCells.push(ai);
  }
}

// ------------------------------
// SPLIT MECHANIC FOR PLAYER CELLS
// ------------------------------
function splitPlayerCells() {
  const cellsToSplit = [...playerCells];
  const MAX_CELLS = 16;
  for (let cell of cellsToSplit) {
    if (playerCells.length >= MAX_CELLS) break;
    // Prevent splitting if the mass is too low to avoid creating very tiny cells.
    if (cell.mass < 80) continue;
    const newMass = cell.mass / 2;
    cell.mass = newMass;
    cell.radius = Math.sqrt(newMass);
    cell.lastSplitTime = performance.now();
    let newCell = new Cell(cell.x, cell.y, cell.radius, cell.color, true);
    newCell.mass = newMass;
    newCell.lastSplitTime = performance.now();
    const center = getPlayerCenter();
    const target = {
      x: center.x + (mouseX - canvasWidth / 2),
      y: center.y + (mouseY - canvasHeight / 2)
    };
    let angle = Math.atan2(target.y - cell.y, target.x - cell.x);
    let impulse = 10;
    newCell.extraVX = Math.cos(angle) * impulse;
    newCell.extraVY = Math.sin(angle) * impulse;
    newCell.x += newCell.extraVX;
    newCell.y += newCell.extraVY;
    cell.extraVX -= Math.cos(angle) * impulse * 0.5;
    cell.extraVY -= Math.sin(angle) * impulse * 0.5;
    playerCells.push(newCell);
  }
}

// ------------------------------
// RENDER FUNCTION
// ------------------------------
function drawGame() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  const center = getPlayerCenter();
  const offsetX = canvasWidth / 2 - center.x;
  const offsetY = canvasHeight / 2 - center.y;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  // Draw map boundaries.
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  // Draw food pellets.
  for (let f of foods) {
    f.draw(ctx);
  }
  // Draw hexagons.
  for (let hex of hexagons) {
    hex.draw(ctx);
  }
  // Draw AI cells.
  for (let ai of aiCells) {
    ai.draw(ctx);
  }
  // Draw player cells.
  for (let cell of playerCells) {
    cell.draw(ctx);
  }
  ctx.restore();
  // Draw rainbow effects over the top.
  for (let effect of rainbowEffects) {
    effect.draw(ctx);
  }
  // Display Game Over message.
  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#FFF";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", canvasWidth / 2, canvasHeight / 2);
    ctx.font = "24px sans-serif";
    ctx.fillText("Click to restart", canvasWidth / 2, canvasHeight / 2 + 40);
  }
}

// ------------------------------
// MAIN GAME LOOP
// ------------------------------
function gameLoop() {
  if (!gameOver) {
    updateGame();
    updateExtras();
  }
  drawGame();
  requestAnimationFrame(gameLoop);
}

// ------------------------------
// GAME INITIALIZATION
// ------------------------------
function startGame() {
  gameOver = false;
  initFoods();
  initAICells();
  initPlayer();
}

// Add updates for hexagons and rainbow effects.
function updateExtras() {
  for (let hex of hexagons) {
    hex.update();
  }
  // Here we use a fixed delta time (16ms) for simplicity.
  for (let i = rainbowEffects.length - 1; i >= 0; i--) {
    rainbowEffects[i].update(16);
    if (rainbowEffects[i].lifetime <= 0) {
      rainbowEffects.splice(i, 1);
    }
  }
}

canvas.addEventListener("touchend", function (e) {
  if (gameOver) {
    startGame();
  }
});

startGame();
gameLoop(); 
