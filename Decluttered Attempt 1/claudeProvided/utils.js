// utils.js - Shared utility functions
const Canvas = require('canvas');
const path = require('path');

// Function to load a tile texture
async function loadTileTexture(layer, tileType) {
  // Create a unique key for the cache
  const cacheKey = `${layer}_${tileType}`;
  
  // Check if tile is already cached
  if (global.tileCache[cacheKey]) {
    return global.tileCache[cacheKey];
  }

  // Path to tile textures folder (organized by layer)
  const tilePath = path.join(__dirname, 'tiles', layer, `${tileType}.png`);
  
  try {
    // Load the image
    const image = await Canvas.loadImage(tilePath);
    // Cache the texture
    global.tileCache[cacheKey] = image;
    return image;
  } catch (error) {
    console.error(`Failed to load tile texture ${layer}/${tileType}:`, error);
    // Return a default texture or placeholder for the appropriate layer
    const defaultTile = await Canvas.loadImage(path.join(__dirname, 'tiles', layer, 'default.png'));
    return defaultTile;
  }
}

// Function to generate a layered grid image from multiple 2D arrays with different scales
async function generateLayeredGridFromArrays(gridData, tileSize = 32) {
  // Extract grid dimensions from environment layer (base layer)
  const environmentGrid = gridData[global.LAYERS.ENVIRONMENT] || [];
  if (!environmentGrid.length) {
    throw new Error('Environment layer is required');
  }
  
  // Base canvas dimensions (determined by the environment layer)
  const baseGridHeight = environmentGrid.length;
  const baseGridWidth = environmentGrid[0].length;
  
  const canvasWidth = baseGridWidth * tileSize;
  const canvasHeight = baseGridHeight * tileSize;
  
  // Create a canvas
  const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');
  
  // Fill background (optional)
  context.fillStyle = '#222222';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Process each layer in order (environment first, then mines, then players)
  const layerOrder = [global.LAYERS.ENVIRONMENT, global.LAYERS.MINES, global.LAYERS.PLAYERS];
  
  for (const layer of layerOrder) {
    if (!gridData[layer]) continue;
    
    const layerGrid = gridData[layer].grid || gridData[layer];
    const layerScale = gridData[layer].scale || 1;
    
    // Skip if the layer doesn't exist
    if (!layerGrid.length) continue;
    
    // Calculate scaled tile size for this layer
    const scaledTileSize = tileSize / layerScale;
    
    // Get the dimensions of this layer's grid
    const layerGridHeight = layerGrid.length;
    const layerGridWidth = layerGrid[0].length;
    
    // Draw each tile in the current layer
    for (let y = 0; y < layerGridHeight; y++) {
      for (let x = 0; x < layerGridWidth; x++) {
        const tileType = layerGrid[y][x];
        
        // Skip empty tiles (use -1 or null to indicate empty tile)
        if (tileType === -1 || tileType === null) continue;
        
        // Calculate the position on the canvas based on the scale
        const canvasX = (x * canvasWidth) / layerGridWidth;
        const canvasY = (y * canvasHeight) / layerGridHeight;
        
        // Load tile texture
        const tileImage = await loadTileTexture(layer, tileType.toString());
        
        // Draw the tile with the scaled size
        context.drawImage(
          tileImage, 
          canvasX, 
          canvasY, 
          canvasWidth / layerGridWidth, 
          canvasHeight / layerGridHeight
        );
      }
    }
  }
  
  // Optionally add grid lines
  if (gridData.showGrid) {
    context.strokeStyle = 'rgba(80, 80, 80, 0.5)';
    
    for (let y = 0; y <= baseGridHeight; y++) {
      context.beginPath();
      context.moveTo(0, y * tileSize);
      context.lineTo(canvasWidth, y * tileSize);
      context.stroke();
    }
    
    for (let x = 0; x <= baseGridWidth; x++) {
      context.beginPath();
      context.moveTo(x * tileSize, 0);
      context.lineTo(x * tileSize, canvasHeight);
      context.stroke();
    }
  }
  
  return canvas.toBuffer();
}

// Function to parse layered grid data from a message
function parseLayeredGridData(content) {
  try {
    // For message commands
    if (typeof content === 'string') {
      // Remove command prefix and get the data part
      const dataText = content.substring(content.indexOf(' ') + 1);
      return JSON.parse(dataText);
    } 
    // For slash commands (already parsed)
    return content;
  } catch (error) {
    console.error('Failed to parse layered grid data:', error);
    throw new Error('Invalid grid format. Please use a valid JSON format with environment, mines, and players layers.');
  }
}

module.exports = {
  loadTileTexture,
  generateLayeredGridFromArrays,
  parseLayeredGridData
};