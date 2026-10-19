// WCAG 2 relative luminance and contrast ratio, used by the tests and by the tint picker.
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
// Move a colour toward white (t > 0) or black (t < 0) by a fraction, keeping its hue.
export function mix(hex, t) {
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgbToHex(hexToRgb(hex).map((v) => v + (target - v) * k));
}
// The first tint of the accent that reads at the ratio on the ground: lighter on dark, darker on light.
export function tintFor(accent, ground, minRatio = 4.5) {
  const towardWhite = luminance(ground) < 0.5;
  for (let t = 0; t <= 1; t += 0.02) {
    const c = mix(accent, towardWhite ? t : -t);
    if (contrast(c, ground) >= minRatio) return c;
  }
  return towardWhite ? '#ffffff' : '#000000';
}
