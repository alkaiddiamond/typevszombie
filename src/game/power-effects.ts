import Phaser from 'phaser';
import { frameMatrix, sampleFrame, type ReanimData } from './reanim';
import { type Power, powerWarmup } from './powers';
import { laneY } from './layout';
import textures from './power-assets.json';

type Field=Record<string,string>;
type Emitter=Partial<Record<'AnimationRate'|'EmitterBoxX'|'EmitterBoxY'|'EmitterOffsetX'|'EmitterOffsetY'|'EmitterRadius'|'FullScreen'|'Image'|'ImageFrames'|'LaunchSpeed'|'ParticleAlpha'|'ParticleBlue'|'ParticleBrightness'|'ParticleDuration'|'ParticleGreen'|'ParticleRed'|'ParticleScale'|'ParticleSpinSpeed'|'ParticleStretch'|'RandomLaunchSpin'|'SpawnMaxLaunched'|'SpawnMinActive'|'SystemAlpha'|'SystemDuration',string>> & {fields:Field[];systemFields:Field[]};
type Particle={image:Phaser.GameObjects.Image;e:Emitter;age:number;life:number;seed:number;x:number;y:number;vx:number;vy:number;angle:number;originX:number;originY:number};
let serial=0;
// Original particle tracks use [min max] random ranges and comma-separated key times.
export function curve(source:string|undefined,t:number,seed=.5,fallback=0):number {
 if(!source)return fallback;
 const points=[...source.matchAll(/(\[[^\]]+\]|-?\d*\.?\d+)(?:\s*,\s*(\d+))?/g)].map(m=>{
  const nums=m[1].match(/-?\d*\.?\d+/g)!.map(Number);
  return {value:nums[0]+((nums[1]??nums[0])-nums[0])*seed,time:m[2]===undefined?NaN:Number(m[2])/100};
 });
 if(!points.length)return fallback;
 points.forEach((p,i)=>{if(Number.isNaN(p.time))p.time=points.length===1?0:i/(points.length-1);});
 if(t<=points[0].time)return points[0].value;
 for(let i=1;i<points.length;i++)if(t<=points[i].time){const a=points[i-1],b=points[i];return Phaser.Math.Linear(a.value,b.value,(t-a.time)/Math.max(.0001,b.time-a.time));}
 return points.at(-1)!.value;
}
class NativePose {
 image:Phaser.GameObjects.Image;data:ReanimData & {pose:{center:number;bottom:number}};
 texture:Phaser.Textures.CanvasTexture;
 constructor(private scene:Phaser.Scene,kind:string,x:number,y:number){
  this.data=scene.cache.json.get(`power-animation-${kind}`);
  const key=`power-pose-${++serial}`;this.texture=scene.textures.createCanvas(key,320,320)!;
  this.image=scene.add.image(x-160*.8,y-240*.8,key).setOrigin(0).setScale(.8).setDepth(170).setName('effect');
  this.image.once('destroy',()=>scene.textures.remove(key));
 }
 render(clip:string,progress:number){
  const [a,b]=this.data.clips[clip]??this.data.clips.idle;const at=a+Math.min(1,progress)*(b-a);
  const ctx=this.texture.context;ctx.resetTransform();ctx.clearRect(0,0,320,320);
  for(const track of this.data.tracks){const f=sampleFrame(track.frames,at);if(f[6]<0||f[7]<=0||!f[8])continue;
   const [a,b,c,d,x,y]=frameMatrix(f);ctx.setTransform(a,b,c,d,160+x-this.data.pose.center,240+y-this.data.pose.bottom);ctx.globalAlpha=f[7];
   ctx.drawImage(this.scene.textures.get(f[8]).getSourceImage() as HTMLImageElement,0,0);
  }
  ctx.resetTransform();ctx.globalAlpha=1;this.texture.refresh();
 }
}
export class PowerEffects {
 private casts:{power:Power;x:number;lane:number;elapsed:number;pose:NativePose}[]=[];
 private ashes:{pose:NativePose;elapsed:number;duration:number}[]=[];
 private flames:{pose:NativePose;elapsed:number}[]=[];
 private particles:Particle[]=[];
 private frozen=new Map<number,Particle[]>();
 constructor(private scene:Phaser.Scene){}
 static preload(scene:Phaser.Scene){
  for(const key of textures)scene.load.image(key,`/game/classic/${key}.png`);
  for(const name of ['cherry','pepper','ice','doom','fire','charred','charred-imp'])scene.load.json(`power-animation-${name}`,`/game/classic/${name}.json`);
  scene.load.json('classic-particles','/game/classic/particles.json');
 }
 cast(power:Power,x:number,lane:number){const pose=new NativePose(this.scene,power,x,laneY(lane)-10);pose.render(power==='ice'?'idle':'explode',0);this.casts.push({power,x,lane,elapsed:0,pose});}
 burn(x:number,lane:number,imp:boolean){const pose=new NativePose(this.scene,imp?'charred-imp':'charred',x,laneY(lane));const clip=pose.data.clips.crumble??pose.data.clips.idle;this.ashes.push({pose,elapsed:0,duration:(clip[1]-clip[0]+1)/pose.data.fps*1000});}
 clear(){this.frozen.clear();for(const a of this.ashes)a.pose.image.destroy();this.ashes=[];for(const c of this.casts)c.pose.image.destroy();for(const f of this.flames)f.pose.image.destroy();for(const p of this.particles)p.image.destroy();this.casts=[];this.flames=[];this.particles=[];}
 syncFrozen(enemies:{id:number;x:number;lane:number}[]){
  const ids=new Set(enemies.map(e=>e.id));
  for(const [id,particles] of this.frozen)if(!ids.has(id)){for(const p of particles){p.age=0;p.life=250;p.e={...p.e,ParticleAlpha:'.8 0'};}this.frozen.delete(id);}
  for(const enemy of enemies)if(!this.frozen.has(enemy.id)){
   const start=this.particles.length;this.emit('IceTrapZombie',enemy.x,laneY(enemy.lane));const particles=this.particles.slice(start);
   for(const p of particles)p.life=Number.POSITIVE_INFINITY;this.frozen.set(enemy.id,particles);
  }
 }
 private emit(name:string,x:number,y:number,flash=true){
  const definitions=this.scene.cache.json.get('classic-particles')[name] as Emitter[];
  for(const e of definitions){if(!e.Image||(!flash&&e.FullScreen==='1'))continue;
   const count=Math.round(curve(e.SpawnMaxLaunched??e.SpawnMinActive,0,Math.random(),1));
   const texture=this.scene.textures.get(e.Image);const frames=Number(e.ImageFrames??1);const source=texture.getSourceImage() as HTMLImageElement;
   if(frames>1&&!texture.has('particle-0'))for(let i=0;i<frames;i++)texture.add(`particle-${i}`,0,Math.floor(i*source.width/frames),0,Math.floor(source.width/frames),source.height);
   for(let i=0;i<count;i++){
    const seed=Math.random(),angle=Math.random()*Math.PI*2,r=curve(e.EmitterRadius,0,Math.random());
    const image=this.scene.add.image(x,y,e.Image,frames>1?`particle-${Math.floor(Math.random()*frames)}`:undefined).setDepth(175).setName('effect');
    const speed=curve(e.LaunchSpeed,0,Math.random());
    this.particles.push({image,e,seed,age:0,life:curve(e.ParticleDuration??e.SystemDuration,0,Math.random(),100)*10,
     x:Math.cos(angle)*r+curve(e.EmitterBoxX,0,Math.random()),y:Math.sin(angle)*r+curve(e.EmitterBoxY,0,Math.random()),vx:Math.cos(angle)*speed/100,vy:Math.sin(angle)*speed/100,
     angle:e.RandomLaunchSpin==='1'?Math.random()*360:0,originX:x,originY:y});
   }
  }
 }
 update(delta:number,sound:boolean){
  for(const a of this.ashes){a.elapsed+=delta;a.pose.render(a.pose.data.clips.crumble?'crumble':'idle',a.elapsed/a.duration);if(a.elapsed>=a.duration)a.pose.image.destroy();}
  this.ashes=this.ashes.filter(a=>a.pose.image.active);
  for(const c of this.casts){c.elapsed+=delta;c.pose.render(c.power==='ice'?'idle':'explode',c.elapsed/(powerWarmup[c.power]*1000));
   if(c.elapsed>=powerWarmup[c.power]*1000){c.pose.image.destroy();
    if(sound&&!this.scene.sound.locked)this.scene.sound.play({cherry:'cherrybomb',pepper:'jalapeno',ice:'frozen',doom:'doomshroom'}[c.power],{volume:.3});
    if(c.power==='pepper'){for(let x=270;x<=990;x+=70){const pose=new NativePose(this.scene,'fire',x,laneY(c.lane));this.flames.push({pose,elapsed:0});}}
    else if(c.power==='ice'){for(let lane=0;lane<5;lane++)this.emit('IceTrap',620,laneY(lane)-60,lane===0);}
    else this.emit(c.power==='cherry'?'Powie':'Doom',c.x,laneY(c.lane)-45);
   }
  }
  this.casts=this.casts.filter(c=>c.pose.image.active);
  for(const f of this.flames){f.elapsed+=delta;f.pose.render(f.elapsed<700?'flame':'done',f.elapsed<700?(f.elapsed%150)/150:(f.elapsed-700)/650);if(f.elapsed>=1350)f.pose.image.destroy();}
  this.flames=this.flames.filter(f=>f.pose.image.active);
  for(const p of this.particles){p.age+=delta;if(p.age>=p.life){p.image.destroy();continue;}
   const t=p.age/p.life,s=p.seed,e=p.e,dt=delta/10;let px=0,py=0;
   for(const field of [...e.fields,...e.systemFields]){const fx=curve(field.X,t,s),fy=curve(field.Y,t,s);
    if(field.FieldType==='Friction'){p.vx*=Math.pow(Math.max(0,1-fx),dt);p.vy*=Math.pow(Math.max(0,1-fy),dt);}
    if(field.FieldType==='Acceleration'){p.vx+=fx*dt;p.vy+=fy*dt;}
    if(['Position','SystemPosition'].includes(field.FieldType)){px+=fx;py+=fy;}
    if(field.FieldType==='Shake'){px+=(Math.random()-.5)*fx;py+=(Math.random()-.5)*fy;}
   }
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=curve(e.ParticleSpinSpeed,t,s)*delta/1000;
   const scale=curve(e.ParticleScale,t,s,1)*.8;
   p.image.setPosition(p.originX+(p.x+px+curve(e.EmitterOffsetX,t,s))*.8,p.originY+(p.y+py+curve(e.EmitterOffsetY,t,s))*.8).setScale(scale,scale*curve(e.ParticleStretch,t,s,1)).setAngle(p.angle).setAlpha(curve(e.ParticleAlpha,t,s,1)*curve(e.SystemAlpha,t,s,1));
   const brightness=curve(e.ParticleBrightness,t,s,1);
   p.image.setTint(Phaser.Display.Color.GetColor(255*curve(e.ParticleRed,t,s,1)*brightness,255*curve(e.ParticleGreen,t,s,1)*brightness,255*curve(e.ParticleBlue,t,s,1)*brightness));
   if(e.AnimationRate)p.image.setFrame(`particle-${Math.floor(p.age/1000*Number(e.AnimationRate))%Number(e.ImageFrames)}`);
   if(e.FullScreen==='1')p.image.setScrollFactor(0).setPosition(this.scene.cameras.main.width/2,300).setDisplaySize(this.scene.cameras.main.width,600);
  }
  this.particles=this.particles.filter(p=>p.image.active);
 }
}
