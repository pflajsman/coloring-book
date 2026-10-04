// Fillability rules for generated pages, measured on the app's own render
// (1200x800, white stripped). "big" = areas a child can fill (>= 1500 px),
// "small" = 60..1499 px, "tiny" = 4..59 px specks that make Fill look patchy.
// `kind` is true for games, 'writing' for handwriting sheets: those are
// traced, not filled, so dashes crossing the guide lines may leave specks.

export function checkEntry(m, kind) {
  const isGame = kind === true || kind === 'writing';
  const maxTiny = kind === 'writing' ? 24 : isGame ? 12 : 3;
  const problems = [];
  if (m.tiny > maxTiny) problems.push(`${m.id}: ${m.tiny} specks`);
  if (m.ink > 16) problems.push(`${m.id}: ink ${m.ink}% too heavy`);
  if (!isGame) {
    if (m.big < 3) problems.push(`${m.id}: only ${m.big} fillable areas (open outline?)`);
    if (m.small > 12) problems.push(`${m.id}: ${m.small} small areas`);
    if (m.ink < 2) problems.push(`${m.id}: ink ${m.ink}% too faint`);
  }
  return problems;
}
