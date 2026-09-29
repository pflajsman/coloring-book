import type { Tool } from './App';

// Pure rules for what a press on the canvas does, kept apart from App so
// they can be unit tested.

// While the saved drawing is still loading at launch, anything drawn would
// be replaced by it, so presses are ignored until boot finishes (well under
// a second). A pending fill blocks strokes for the same reason: its result
// is computed from an earlier snapshot.
export function strokeStartAction(s: { tool: Tool; booting: boolean; fillsPending: number }): 'fill' | 'stroke' | 'ignore' {
  if (s.booting) return 'ignore';
  if (s.tool === 'fill') return 'fill';
  if (s.tool === 'pan' || s.fillsPending > 0) return 'ignore';
  return 'stroke';
}

// Picking a colour should visibly do something. Tools that don't paint in
// the chosen colour (eraser, rainbow) hand over to the brush; colour tools
// such as fill stay selected so kids can keep filling shapes.
export function toolAfterColorPick(tool: Tool): Tool {
  return tool === 'eraser' || tool === 'rainbow' ? 'brush' : tool;
}
