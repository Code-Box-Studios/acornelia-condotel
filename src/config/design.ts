/**
 * Guest website design directions from the November 12, 2026 comparison. Sample copy and imagery apply only to
 * synthetic local content; approved owner content always wins.
 * The user selected D-07 Bright resort on November 19, 2026. The owner's approval is still pending;
 * set `siteDesign` to 'warm' to return to D-06 Warm boutique.
 */
export const siteDesigns={
  warm:{id:'D-06',name:'Warm boutique',sample:{tagline:'Your own little pause',headline:'A stay that\nfeels like',headlineAccent:'home.',description:'Slow mornings. Time together. The simple pleasure of somewhere that feels like yours.',heroFile:'acornelia-warm-boutique-v1.webp',heroAlt:'Concept bedroom with warm linen, olive details and soft daylight'}},
  bright:{id:'D-07',name:'Bright resort',sample:{tagline:'Make room for a little escape',headline:'A little escape.',headlineAccent:'A brighter day.',description:'Somewhere to switch off, settle in, and enjoy a little more time together.',heroFile:'acornelia-bright-escape-v1.webp',heroAlt:'Bright bedroom concept with pale linens and green accents'}},
} as const
export type SiteDesign=keyof typeof siteDesigns
export const siteDesign:SiteDesign='bright'
