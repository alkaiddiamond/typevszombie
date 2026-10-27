export const layout = { width: 800, height: 600, worldWidth: 1400, homeX: 200, previewX: 600, entryX: 1060, targetX: 970, exitX: 245, introSeconds: 6 };
export function introCameraX(elapsed: number): number {
  const ease = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
  if (elapsed < 2) return layout.homeX + (layout.previewX - layout.homeX) * ease(elapsed / 2);
  if (elapsed < 3.4) return layout.previewX;
  return layout.previewX + (layout.homeX - layout.previewX) * ease((elapsed - 3.4) / 2.6);
}

export const laneCount = 5;
// The daytime lawn has five 100px rows starting at y=80, and 80px columns.
export const lawnGrid = { left: 250, top: 80, columnWidth: 80, rowHeight: 100 };
export const shooterX = lawnGrid.left + lawnGrid.columnWidth / 2;
export const laneY = (lane: number) => lawnGrid.top + lane * lawnGrid.rowHeight + 90;
export const shooterY = (lane: number) => laneY(lane) - 10;
