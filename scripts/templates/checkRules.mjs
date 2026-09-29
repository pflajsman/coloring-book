// Fillability rules for generated pages, measured on the app's own render
// (1200x800, white stripped). "big" = areas a child can fill (>= 1500 px),
// "small" = 60..1499 px, "tiny" = 4..59 px specks that make Fill look patchy.

export function checkEntry(m, isGame) {
  const problems = [];
  if (m.tiny > (isGame ? 12 : 3)) problems.push(`${m.id}: ${m.tiny} specks`);
  if (m.ink > 16) problems.push(`${m.id}: ink ${m.ink}% too heavy`);
  if (!isGame) {
    if (m.big < 3) problems.push(`${m.id}: only ${m.big} fillable areas (open outline?)`);
    if (m.small > 12) problems.push(`${m.id}: ${m.small} small areas`);
    if (m.ink < 2) problems.push(`${m.id}: ink ${m.ink}% too faint`);
  }
  return problems;
}
