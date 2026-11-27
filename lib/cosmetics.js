// Cosmetics: per-account looks. Pure rules, no I/O.
//
// Name color (accounts.name_color, "#rrggbb" or NULL): shown on the user list
// and on room messages. For now only the first NAME_COLOR_FREE_ACCOUNTS
// accounts that exist, in signup order (serial `id`), may set and show one.
// Owner's decision of 2026-11-26: counted over real rows, not the raw id,
// because the id sequence has gaps (ids burned by failed signups), so id 13
// was the 9th account. A deleted account frees its place: the next account in
// signup order moves up. Later other accounts will unlock it as a purchase;
// that decision goes through nameColorAllowed(), nameColorAllowedSql() and
// nameColorSql() so every reader follows it.

export const NAME_COLOR_FREE_ACCOUNTS = 20;

// Names sit on dark rows and bubbles. #2a2a2a is the lightest of those
// backgrounds (active user row), so a color readable there is readable on all.
export const NAME_COLOR_BACKGROUND = "#2a2a2a";
// Only colors that are practically invisible are refused (owner, 2026-11-26:
// 3:1 refused readable colors like #c11c84, 2.57:1). 1.5:1 still refuses
// near-black, navy, deep indigo and dark grey (#444 = 1.47:1).
export const NAME_COLOR_MIN_CONTRAST = 1.5;

/**
 * SQL for the highest id allowed: the id of the NAME_COLOR_FREE_ACCOUNTS-th
 * account by id, or every id while there are fewer accounts. Uncorrelated, so
 * Postgres runs it once per query (primary-key index).
 */
export function nameColorCutoffSql() {
  return `COALESCE((SELECT nc.id FROM accounts nc ORDER BY nc.id OFFSET ${NAME_COLOR_FREE_ACCOUNTS - 1} LIMIT 1), 2147483647)`;
}

/** SQL for a boolean column `name_color_allowed` of the row aliased `alias`. */
export function nameColorAllowedSql(alias) {
  return `(${alias}.id <= ${nameColorCutoffSql()}) AS name_color_allowed`;
}

/** Whether this account may set and show a name color (needs the `name_color_allowed` column). */
export function nameColorAllowed(account) {
  return account?.name_color_allowed === true;
}

/** SQL for the color as others should see it: NULL when the account may not use one. */
export function nameColorSql(alias) {
  return `CASE WHEN ${alias}.id <= ${nameColorCutoffSql()} THEN ${alias}.name_color END`;
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
