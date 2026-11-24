/**
 * The polyhedral dice, as filled silhouettes in Lucide's 24-unit box. Each die comes twice:
 * `dg-die-d20` with its face number knocked out of the shape, and `dg-die-d20-plain` as the
 * bare silhouette, for where the number is written beside it instead.
 *
 * Registered by `registerGameIcons` through the same scaling as the rest, so they need no
 * files shipped beside the plugin. The numerals are cut with an SVG mask, whose id is the
 * die's own: the same icon drawn twice on a page repeats an identical definition, which is
 * harmless.
 */

export const DICE: Record<string, string> = {
  "dg-die-d4": `<mask id="m-d4" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g stroke="#000" stroke-width="1.75" fill="none"><path transform="translate(10.50 11.80) scale(1)" d="M0 0V3H3M2.5 0V6" vector-effect="non-scaling-stroke"/></g></mask><path d="M12 3 21.5 20.5H2.5Z" fill="currentColor" mask="url(#m-d4)"/>`,
  "dg-die-d4-plain": `<path d="M12 3 21.5 20.5H2.5Z" fill="currentColor"/>`,
  "dg-die-d6": `<mask id="m-d6" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g stroke="#000" stroke-width="1.75" fill="none"><path transform="translate(10.00 8.00) scale(1.3333333333333333)" d="M3 0H0V6H3V3H0" vector-effect="non-scaling-stroke"/></g></mask><path d="M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z" fill="currentColor" mask="url(#m-d6)"/>`,
  "dg-die-d6-plain": `<path d="M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z" fill="currentColor"/>`,
  "dg-die-d8": `<mask id="m-d8" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g stroke="#000" stroke-width="1.75" fill="none"><path transform="translate(10.25 8.50) scale(1.1666666666666667)" d="M0 0H3V6H0ZM0 3H3" vector-effect="non-scaling-stroke"/></g></mask><path d="M12 2 22 12 12 22 2 12Z" fill="currentColor" mask="url(#m-d8)"/>`,
  "dg-die-d8-plain": `<path d="M12 2 22 12 12 22 2 12Z" fill="currentColor"/>`,
  "dg-die-d10": `<mask id="m-d10" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g stroke="#000" stroke-width="1.75" fill="none"><path transform="translate(8.95 9.00) scale(1)" d="M0 1.5L1.5 0V6" vector-effect="non-scaling-stroke"/><path transform="translate(12.05 9.00) scale(1)" d="M0 0H3V6H0Z" vector-effect="non-scaling-stroke"/></g></mask><path d="M12 4.5 22 12 12 19.5 2 12Z" fill="currentColor" mask="url(#m-d10)"/>`,
  "dg-die-d10-plain": `<path d="M12 4.5 22 12 12 19.5 2 12Z" fill="currentColor"/>`,
  "dg-die-d12": `<mask id="m-d12" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g stroke="#000" stroke-width="1.75" fill="none"><path transform="translate(8.75 9.40) scale(1.0666666666666667)" d="M0 1.5L1.5 0V6" vector-effect="non-scaling-stroke"/><path transform="translate(12.05 9.40) scale(1.0666666666666667)" d="M0 0H3V3H0V6H3" vector-effect="non-scaling-stroke"/></g></mask><path d="M12 2.5 21.5 9.4 17.9 20.6H6.1L2.5 9.4Z" fill="currentColor" mask="url(#m-d12)"/>`,
  "dg-die-d12-plain": `<path d="M12 2.5 21.5 9.4 17.9 20.6H6.1L2.5 9.4Z" fill="currentColor"/>`,
  "dg-die-d20": `<mask id="m-d20" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g stroke="#000" stroke-width="1.75" fill="none"><path transform="translate(7.95 8.80) scale(1.0666666666666667)" d="M0 0H3V3H0V6H3" vector-effect="non-scaling-stroke"/><path transform="translate(12.85 8.80) scale(1.0666666666666667)" d="M0 0H3V6H0Z" vector-effect="non-scaling-stroke"/></g></mask><path d="M12 2 20.7 7V17L12 22 3.3 17V7Z" fill="currentColor" mask="url(#m-d20)"/>`,
  "dg-die-d20-plain": `<path d="M12 2 20.7 7V17L12 22 3.3 17V7Z" fill="currentColor"/>`,
};
