/**
 * Locked-in print defaults (validated on real EM5823H paper):
 * pure Fusion Pixel at 1.35x (= 24px, 2x integer multiple of the 12px grid),
 * hard threshold 120 for crisp pixel strokes.
 */
export const DEFAULT_FONT_PROFILE = 'pixel';
export const DEFAULT_FONT_SCALE = 1.35;
export const DEFAULT_ALGORITHM = 'threshold' as const;
export const DEFAULT_GAMMA = 1.1;
export const DEFAULT_THRESHOLD = 120;
