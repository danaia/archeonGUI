import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCanvasStore = defineStore('canvas', () => {
  // Canvas viewport state
  const viewportWidth = ref(window.innerWidth)
  const viewportHeight = ref(window.innerHeight)
  
  // Camera position in world coordinates (center of viewport)
  const cameraX = ref(0)
  const cameraY = ref(0)
  
  // Zoom level (1 = 100%)
  const zoom = ref(1)
  const minZoom = ref(0.1)
  const maxZoom = ref(5)
  
  // Panning state
  const isPanning = ref(false)
  const isSpacePressed = ref(false)
  
  // Grid configuration - tile is 2 units high, 6 units wide
  const tileHeight = ref(80) // Base height in pixels at zoom 1
  const tileWidth = computed(() => tileHeight.value * 3) // 6:2 = 3:1 ratio (6w x 2h)
  const gridGap = ref(8) // Gap between tiles in pixels at zoom 1
  
  // Computed scaled dimensions
  const scaledTileWidth = computed(() => tileWidth.value * zoom.value)
  const scaledTileHeight = computed(() => tileHeight.value * zoom.value)
  const scaledGridGap = computed(() => gridGap.value * zoom.value)
  const cellWidth = computed(() => tileWidth.value + gridGap.value)
  const cellHeight = computed(() => tileHeight.value + gridGap.value)
  const scaledCellWidth = computed(() => cellWidth.value * zoom.value)
  const scaledCellHeight = computed(() => cellHeight.value * zoom.value)
  
  // Convert screen coordinates to world coordinates
  function screenToWorld(screenX, screenY) {
    const worldX = (screenX - viewportWidth.value / 2) / zoom.value + cameraX.value
    const worldY = (screenY - viewportHeight.value / 2) / zoom.value + cameraY.value
    return { x: worldX, y: worldY }
  }
  
  // Convert world coordinates to screen coordinates
  function worldToScreen(worldX, worldY) {
    const screenX = (worldX - cameraX.value) * zoom.value + viewportWidth.value / 2
    const screenY = (worldY - cameraY.value) * zoom.value + viewportHeight.value / 2
    return { x: screenX, y: screenY }
  }
  
  // Get grid cell from world coordinates
  function worldToGrid(worldX, worldY) {
    const col = Math.floor(worldX / cellWidth.value)
    const row = Math.floor(worldY / cellHeight.value)
    return { col, row }
  }
  
  // Get world coordinates from grid cell
  function gridToWorld(col, row) {
    const x = col * cellWidth.value
    const y = row * cellHeight.value
    return { x, y }
  }
  
  // Zoom at a specific screen point
  function zoomAt(screenX, screenY, delta) {
    const worldBefore = screenToWorld(screenX, screenY)
    
    // Apply zoom with bounds
    const newZoom = Math.max(minZoom.value, Math.min(maxZoom.value, zoom.value * (1 - delta * 0.001)))
    zoom.value = newZoom
    
    const worldAfter = screenToWorld(screenX, screenY)
    
    // Adjust camera to keep the point under cursor stationary
    cameraX.value += worldBefore.x - worldAfter.x
    cameraY.value += worldBefore.y - worldAfter.y
  }
  
  // Pan the camera
  function pan(deltaX, deltaY) {
    cameraX.value -= deltaX / zoom.value
    cameraY.value -= deltaY / zoom.value
  }
  
  // Update viewport size
  function updateViewport(width, height) {
    viewportWidth.value = width
    viewportHeight.value = height
  }
  
  // Get visible bounds in world coordinates
  const visibleBounds = computed(() => {
    const halfWidth = viewportWidth.value / 2 / zoom.value
    const halfHeight = viewportHeight.value / 2 / zoom.value
    return {
      left: cameraX.value - halfWidth,
      right: cameraX.value + halfWidth,
      top: cameraY.value - halfHeight,
      bottom: cameraY.value + halfHeight
    }
  })
  
  // Get visible grid range (with padding for smooth scrolling)
  const visibleGridRange = computed(() => {
    const bounds = visibleBounds.value
    const padding = 2 // Extra tiles around the viewport
    
    return {
      minCol: Math.floor(bounds.left / cellWidth.value) - padding,
      maxCol: Math.ceil(bounds.right / cellWidth.value) + padding,
      minRow: Math.floor(bounds.top / cellHeight.value) - padding,
      maxRow: Math.ceil(bounds.bottom / cellHeight.value) + padding
    }
  })
  
  return {
    // State
    viewportWidth,
    viewportHeight,
    cameraX,
    cameraY,
    zoom,
    minZoom,
    maxZoom,
    isPanning,
    isSpacePressed,
    tileHeight,
    tileWidth,
    gridGap,
    
    // Computed
    scaledTileWidth,
    scaledTileHeight,
    scaledGridGap,
    cellWidth,
    cellHeight,
    scaledCellWidth,
    scaledCellHeight,
    visibleBounds,
    visibleGridRange,
    
    // Methods
    screenToWorld,
    worldToScreen,
    worldToGrid,
    gridToWorld,
    zoomAt,
    pan,
    updateViewport
  }
})
