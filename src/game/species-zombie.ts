import Phaser from 'phaser';
import { frameMatrix, sampleFrame, type ReanimData } from './reanim';
let sequence=0;
export class SpeciesZombie {
  readonly image: Phaser.GameObjects.Image;
  readonly data: ReanimData & { hidden:string[]; pose:{scale:number;center:number;bottom:number} };
  private readonly texture: Phaser.Textures.CanvasTexture;
  armLost=false; headLost=false;
  armor: 'intact'|'damaged'|'broken'='intact';
  constructor(private scene:Phaser.Scene, readonly kind:'imp'|'football'|'giant'|'peashooter') {
    this.data=scene.cache.json.get(`original-${kind}`);
    const key=`species-pose-${++sequence}`;
    this.texture=scene.textures.createCanvas(key,640,480)!;
    this.image=scene.add.image(-240,-360,key).setOrigin(0);
    this.image.once('destroy',()=>scene.textures.remove(key));this.render(0,'idle');
  }
  get deathDuration(){const [a,b]=this.data.clips.death;return (b-a+1)/this.data.fps*1000;}
  anchor(){return {x:0,y:-100};}
  render(time:number,clip='walk',bodyTime=time) {
    const [start,end]=this.data.clips[clip]??this.data.clips.walk;
    const offset=time/1000*this.data.fps;
    const at=clip==='death'?Math.min(end,start+offset):start+offset%(end-start+1);
    const ctx=this.texture.context;ctx.resetTransform();ctx.clearRect(0,0,640,480);
    const {scale,center,bottom}=this.data.pose;
    for(const track of this.data.tracks){
      if(this.data.hidden.includes(track.name))continue;
      const stem = this.kind === 'peashooter' && /^(backleaf|frontleaf|stalk_)/.test(track.name);
      const [idleStart,idleEnd]=this.data.clips.idle;
      const trackFrame=stem ? idleStart+(bodyTime/1000*this.data.fps)%(idleEnd-idleStart+1) : at;
      const f=sampleFrame(track.frames,trackFrame);if(f[6]<0||f[7]<=0||!f[8])continue;
      const [a,b,c,d,x,y]=frameMatrix(f);
      ctx.setTransform(a*scale,b*scale,c*scale,d*scale,240+(x-center)*scale,360+(y-bottom)*scale);ctx.globalAlpha=f[7];
      ctx.drawImage(this.scene.textures.get(f[8]).getSourceImage() as HTMLImageElement,0,0);
    }
    ctx.resetTransform();ctx.globalAlpha=1;this.texture.refresh();
  }
}
