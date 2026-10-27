export type ReanimFrame = [number, number, number, number, number, number, number, number, string];
export interface ReanimData { fps: number; tracks: { name: string; frames: ReanimFrame[] }[]; clips: Record<string, [number, number]> }
export function sampleFrame(frames: ReanimFrame[], frame: number): ReanimFrame {
  const index = Math.max(0, Math.min(frames.length - 1, Math.floor(frame)));
  const a = frames[index], b = frames[Math.min(index + 1, frames.length - 1)];
  const t = Math.max(0, Math.min(1, frame - index));
  const lerp = (i: number) => (a[i] as number) + ((b[i] as number) - (a[i] as number)) * t;
  const angle = (i: number) => (a[i] as number) + ((((b[i] as number) - (a[i] as number) + 540) % 360) - 180) * t;
  return [lerp(0), lerp(1), angle(2), angle(3), lerp(4), lerp(5), a[6], lerp(7), a[8]];
}
export function frameMatrix(f: ReanimFrame): [number, number, number, number, number, number] {
  const kx = f[2] * Math.PI / 180, ky = f[3] * Math.PI / 180;
  return [f[4] * Math.cos(kx), f[4] * Math.sin(kx), -f[5] * Math.sin(ky), f[5] * Math.cos(ky), f[0], f[1]];
}
export const hiddenTracks = new Set(['Zombie_flaghand', 'Zombie_innerarm_screendoor', 'Zombie_duckytube', 'Zombie_whitewater', 'Zombie_whitewater2', 'Zombie_mustache', 'anim_screendoor', 'Zombie_innerarm_screendoor_hand', 'Zombie_outerarm_screendoor']);

export function attachmentMatrix(current: ReanimFrame, base: ReanimFrame, child: ReanimFrame): [number, number, number, number, number, number] {
  type Matrix = [number, number, number, number, number, number];
  const multiply = (a: Matrix,b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  const b=frameMatrix(base), determinant=b[0]*b[3]-b[1]*b[2];
  if(Math.abs(determinant)<1e-8) return frameMatrix(child);
  const inverse: Matrix=[b[3]/determinant,-b[1]/determinant,-b[2]/determinant,b[0]/determinant,(b[2]*b[5]-b[3]*b[4])/determinant,(b[1]*b[4]-b[0]*b[5])/determinant];
  return multiply(multiply(frameMatrix(current),inverse),frameMatrix(child));
}
