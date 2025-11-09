/**
 * Breakpoint constants for responsive design
 *
 * Note: Two different breakpoint systems are intentionally used:
 * 1. LAYOUT_BREAKPOINTS (640, 1024, 1536): For gallery column layout
 * 2. MOBILE_BREAKPOINT (768): Standard mobile/desktop detection
 *
 * Rationale:
 * - Small phones (<=640px) need 2 columns for readability
 * - Tablets (641-768px) can handle 3 columns but should still hide keyboard shortcuts
 * - This provides better UX than using a single breakpoint system
 */

// Mobile detection breakpoint (used for UI features like keyboard shortcuts)
export const MOBILE_BREAKPOINT = 768

// Gallery layout breakpoints (used for masonry column counts)
export const LAYOUT_BREAKPOINTS = {
  MOBILE: 640,     // 2 columns
  TABLET: 1024,    // 3 columns
  LAPTOP: 1536,    // 4 columns
  // Desktop: 5 columns (default)
} as const

// Responsive sizes for gallery thumbnails
// Matches the column layout: 2 cols (mobile) → 3 (tablet) → 4 (laptop) → 5 (desktop)
export const THUMBNAIL_SIZES = [
  `(max-width: ${LAYOUT_BREAKPOINTS.MOBILE}px) 50vw`,   // 2 columns on mobile
  `(max-width: ${LAYOUT_BREAKPOINTS.TABLET}px) 33vw`,  // 3 columns on tablet
  `(max-width: ${LAYOUT_BREAKPOINTS.LAPTOP}px) 25vw`,  // 4 columns on laptop
  '20vw'                                                 // 5 columns on desktop
].join(', ')

// Responsive sizes for lightbox images
// Explicitly cap mobile at 800px to ensure 800w srcset variant is selected
// even on high-DPR devices (prevents unnecessary download of original)
export const LIGHTBOX_SIZES = [
  `(max-width: ${MOBILE_BREAKPOINT}px) 800px`,  // Explicitly request 800w variant on mobile
  '90vw'                                          // Request based on viewport on desktop
].join(', ')

// Lazy loading root margins (how far ahead to prefetch)
export const LAZY_LOAD_ROOT_MARGINS = {
  MOBILE: '3000px 0px',   // More aggressive on mobile (users scroll faster)
  DESKTOP: '2000px 0px',  // Less aggressive on desktop
} as const
