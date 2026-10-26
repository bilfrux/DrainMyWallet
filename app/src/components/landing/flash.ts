// Kept apart from scene.ts so the page can read them without pulling three.js
// into the main bundle: the scene itself is loaded on demand.

/** Progress of the flash as the camera crosses the door; the page overlay uses the same value */
export const FLASH_AT = 0.934
export const FLASH_WIDTH = 0.03
