// Drag-and-drop helpers. The Grid shows only some of a cell's tasks (done tasks can be
// hidden) but the server's move index counts all of them, so the two have to be mapped.

/**
 * The server index for a drop at `clientY`.
 * `cards`: the visible cards in the target cell, top to bottom, excluding the dragged task,
 *   each with its vertical midpoint.
 * `fullIds`: every task id in that cell in order (hidden ones too), excluding the dragged task.
 */
export function dropIndex(
  cards: { id: string; mid: number }[],
  fullIds: string[],
  clientY: number,
): number {
  const above = cards.filter((c) => c.mid < clientY).length
  const next = cards[above]
  if (!next) return fullIds.length
  const at = fullIds.indexOf(next.id)
  return at === -1 ? fullIds.length : at
}
