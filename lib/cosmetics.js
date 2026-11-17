// Cosmetics: per-account looks. Pure rules, no I/O.
//
// Name color (accounts.name_color, "#rrggbb" or NULL): shown on the user list
// and on room messages. For now only the first accounts ever created may set
// one (serial `id` <= NAME_COLOR_FREE_MAX_ID; deleted accounts do not free a
// slot). Later other accounts will unlock it as a purchase; that decision goes
// through nameColorAllowed() and nameColorSql() so every reader follows it.

export const NAME_COLOR_FREE_MAX_ID = 10;

// Names sit on dark rows and bubbles. #2a2a2a is the lightest of those
// backgrounds (active user row), so a color readable there is readable on all.
export const NAME_COLOR_BACKGROUND = "#2a2a2a";
export const NAME_COLOR_MIN_CONTRAST = 3;

/** Whether this account (needs `id`) may set and show a name color. */
export function nameColorAllowed(account) {
  const id = Number(account?.id);
  return Number.isInteger(id) && id >= 1 && id <= NAME_COLOR_FREE_MAX_ID;
}

/** SQL for the color as others should see it: NULL when the account may not use one. */
export function nameColorSql(alias) {
  return `CASE WHEN ${alias}.id <= ${NAME_COLOR_FREE_MAX_ID} THEN ${alias}.name_color END`;
}

/** "#abc" / "#AABBCC" -> "#aabbcc"; anything else -> null. */
export function normalizeNameColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return "#" + [...v.slice(1)].map(c => c + c).join("");
  return null;
}

function relativeLuminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two normalized "#rrggbb" colors (1 to 21). */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** null when the color is usable, else "format" or "contrast". */
export function nameColorProblem(value) {
  const hex = normalizeNameColor(value);
  if (!hex) return "format";
  if (contrastRatio(hex, NAME_COLOR_BACKGROUND) < NAME_COLOR_MIN_CONTRAST) return "contrast";
  return null;
}
