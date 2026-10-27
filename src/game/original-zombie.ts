import Phaser from 'phaser';
import { frameMatrix, attachmentMatrix, sampleFrame, hiddenTracks, type ReanimData } from './reanim';

let sequence = 0;
/** Draw each original track with its full affine transform, including skew. */
export class OriginalZombie {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly textureKey = `zombie-pose-${++sequence}`;
  private readonly data: ReanimData;
  armLost = false;
  headLost = false;
  armor: 'intact' | 'damaged' | 'broken' = 'intact';
  private lastFrame = 44;
  constructor(private scene: Phaser.Scene, readonly tier: number, readonly kind?: 'flag' | 'door') {
    this.data = scene.cache.json.get('original-zombie');
    this.texture = scene.textures.createCanvas(this.textureKey, 320, 260)!;
    this.image = scene.add.image(-110, -210, this.textureKey).setOrigin(0);
    this.image.once('destroy', () => scene.textures.remove(this.textureKey));
    this.render(0, 'idle');
  }
  get deathDuration() { const [start, end] = this.data.clips.death; return (end - start + 1) / this.data.fps * 1000; }
  anchor(name: string) {
    const track = this.data.tracks.find(t => t.name === name)!;
    const frame = sampleFrame(track.frames, this.lastFrame);
    return { x: frame[0] - 40, y: frame[1] - 130 };
  }
  render(elapsedMs: number, clip = 'walk') {
    const [start, end] = this.data.clips[clip];
    const index = elapsedMs / 1000 * this.data.fps;
    this.lastFrame = Math.min(end, start + (clip === 'death' ? index : index % (end - start + 1)));
    const context = this.texture.context;
    context.resetTransform(); context.clearRect(0, 0, 320, 260);
    for (const track of this.data.tracks) {
      const door = this.kind === 'door' && this.armor !== 'broken' && !this.headLost;
      const flag = this.kind === 'flag' && !this.headLost;
      const doorTrack = track.name.toLowerCase().includes('screendoor');
      if (hiddenTracks.has(track.name) && !(door && doorTrack) && !(flag && ['Zombie_flaghand', 'Zombie_innerarm_screendoor'].includes(track.name))) continue;
      if ((door || flag) && ['anim_innerarm1', 'anim_innerarm2', 'anim_innerarm3'].includes(track.name)) continue;
      if (door && track.name.startsWith('Zombie_outerarm_') && track.name !== 'Zombie_outerarm_screendoor') continue;
      if (this.armLost && ['Zombie_outerarm_hand', 'Zombie_outerarm_lower'].includes(track.name)) continue;
      if (this.headLost && ['anim_head1', 'anim_head2', 'anim_tongue', 'anim_hair', 'anim_cone', 'anim_bucket'].includes(track.name)) continue;
      if (track.name === 'anim_cone' && (this.tier !== 2 || this.armor === 'broken')) continue;
      if (track.name === 'anim_bucket' && (this.tier !== 3 || this.kind === 'door' || this.armor === 'broken')) continue;
      const frame = sampleFrame(track.frames, this.lastFrame);
      if (frame[6] < 0 || frame[7] <= 0 || !frame[8]) continue;
      if (flag && track.name === 'Zombie_flaghand') {
        const flagData = this.scene.cache.json.get('original-flag') as ReanimData;
        for (const flagTrack of flagData.tracks) {
          const flagFrame = sampleFrame(flagTrack.frames, (elapsedMs / 1000 * flagData.fps) % flagTrack.frames.length);
          if (!flagFrame[8] || flagFrame[6] < 0) continue;
          // The original flag is authored in body coordinates at base pose 0.
          const [a,b,c,d,x,y] = attachmentMatrix(frame, track.frames[0], flagFrame);
          context.setTransform(a,b,c,d,x+70,y+80); context.globalAlpha = flagFrame[7];
          context.drawImage(this.scene.textures.get(flagFrame[8]).getSourceImage() as HTMLImageElement,0,0);
        }
      }
      let texture = frame[8];
      if (this.armLost && track.name === 'Zombie_outerarm_upper') texture = 'IMAGE_REANIM_ZOMBIE_OUTERARM_UPPER2';
      if (this.armor === 'damaged' && (track.name === 'anim_cone' || track.name === 'anim_bucket' || track.name === 'anim_screendoor')) texture = texture.replace(/1$/, '2');
      const source = this.scene.textures.get(texture).getSourceImage() as HTMLImageElement;
      const [a, b, c, d, x, y] = frameMatrix(frame);
      context.setTransform(a, b, c, d, x + 70, y + 80); context.globalAlpha = frame[7];
      context.drawImage(source, 0, 0);
    }
    context.resetTransform(); context.globalAlpha = 1; this.texture.refresh();
  }
}
