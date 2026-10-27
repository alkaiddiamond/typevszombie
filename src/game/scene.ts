import { voiceSounds, createVoiceClock, tickVoice, type VoiceClock } from './zombie-voice';
import { PowerEffects } from './power-effects';
import { powerTypes, powerInfo } from './powers';
import { SpeciesZombie } from './species-zombie';
import { arrangeLabels } from './label-layout';
import { displaySequence } from './curriculum';
import Phaser from 'phaser';
import { layout, laneCount, laneY, shooterX, shooterY, lawnGrid, introCameraX } from './layout';
import { OriginalZombie } from './original-zombie';
import originalImages from './zombie-assets.json';
import { GardenGame, enemySpeedFactor, armorStage, lootValue, type Enemy, type GameEvent } from './model';

const parts = ['cone3', 'bucket3'];
const effectSounds = ['hit', 'coin', ...voiceSounds, 'plastichit', 'shieldhit', 'limbs_pop', 'zombie_falling_1', 'hugewave', 'finalwave', 'diamond-pickup','cherrybomb','jalapeno','frozen','doomshroom','seedlift'];
type Actor = { voice:VoiceClock; callout: Phaser.GameObjects.Container; root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Container; visual: OriginalZombie | SpeciesZombie; label: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Rectangle; ring: Phaser.GameObjects.Ellipse; hitUntil: number; missUntil: number; walkElapsed: number; progress: number; hp: number; health: Phaser.GameObjects.Graphics };
export class GardenScene extends Phaser.Scene {
  private powerEffects!:PowerEffects;
  private itemActors = new Map<number, Phaser.GameObjects.Container>();
  private shooters: { visual: SpeciesZombie; shotElapsed: number }[] = [];
  private actors = new Map<number, Actor>();
  private dying: { actor: Actor; elapsed: number }[] = [];
  private unsubscribe?: () => void;
  private soundReady = false;
  private music?: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
  private unsubscribeAudio?: () => void;
  private animationTime = 0;
  private pendingWaveSound: string | null = null;
  private syncAudio = () => {
    if (!this.soundReady) return;
    const playing = ['playing', 'teaching'].includes(this.model.state.status);
    const { music, musicVolume, sound } = this.model.settings;
    if (this.music) {
      this.music.setVolume(musicVolume);
      if (playing && music && !this.sound.locked) {
        if (this.music.isPaused) this.music.resume();
        else if (!this.music.isPlaying) this.music.play({ loop: true, volume: musicVolume });
      } else if (this.music.isPlaying) this.music.pause();
    }
    if (!playing || !sound) effectSounds.forEach(key => {
      const collectingAfterRound = ['won', 'lost'].includes(this.model.state.status) && ['coin', 'diamond-pickup'].includes(key);
      if (!sound || !collectingAfterRound) this.sound.stopByKey(key);
    });
    if (this.model.state.status !== 'won' || !sound) this.sound.stopByKey('victory');
    if (playing && this.pendingWaveSound && !this.sound.locked) {
      if (sound) this.sound.play(this.pendingWaveSound, { volume: 0.35 });
      this.pendingWaveSound = null;
    }
  };
  constructor(private model: GardenGame, private ready: () => void, private fail: () => void) { super('garden'); }
  preload() {
    PowerEffects.preload(this);
    this.load.image('seed-packet', '/game/ui-seed-packet.png');
    for(const power of powerTypes)this.load.image(`power-${power}`,`/game/power-${power}.png?v=classic-complete-3`);
    this.load.image('lawn', '/game/lawn.jpg');
    parts.forEach(p => this.load.image(p, `/game/Zombie_${p}.png`));
    this.load.image('projectile-pea', '/game/ProjectilePea.png');
    for (const kind of ['imp','football','giant','peashooter']) this.load.json(`original-${kind}`, `/game/original/${kind}.json`);
    this.load.json('original-flag', '/game/original/flag.json');
    this.load.json('original-zombie', '/game/original/zombie.json');
    originalImages.forEach(key => this.load.image(key, `/game/original/${key}.png`));
    this.load.image('detached-arm', '/game/original/ZombieArm.png');
    this.load.image('detached-head', '/game/original/ZombieHead.png');
    this.load.image('gold', '/game/coin_gold_dollar.png');
    this.load.image('copper', '/game/coin_gold_dollar.png');
    this.load.image('silver', '/game/coin_silver_dollar.png');
    this.load.image('diamond', '/game/Diamond.png');
    this.load.audio('hit', '/game/splat.ogg'); this.load.audio('coin', '/game/coin.ogg');
    this.load.audio('music', '/game/grasswalk.ogg');
    this.load.audio('victory', '/game/victory.ogg');
    this.load.image('victory-trophy', '/game/trophy_hi_res.png');
    this.load.image('victory-rays', '/game/victory-rays.png');
    this.load.image('victory-star', '/game/victory-star.png');
    effectSounds.slice(2).forEach(key => this.load.audio(key, `/game/${key}.ogg`));
    this.load.on('loaderror', () => this.fail());
  }
  create() {
    this.powerEffects=new PowerEffects(this);
    this.add.image(0, 0, 'lawn').setOrigin(0);
    this.cameras.main.setBounds(0, 0, layout.worldWidth, layout.height).setScroll(layout.homeX, 0);
    const path = this.add.graphics();
    path.lineStyle(2, 0xfff1b0, 0.25);
    Array.from({length: laneCount - 1}, (_, i) => lawnGrid.top + (i + 1) * lawnGrid.rowHeight).forEach(y => { path.lineBetween(245, y, 990, y); });
    path.lineStyle(3, 0xffe1a0, 0.8);
    for (let y = 100; y < 570; y += 20) path.lineBetween(245, y, 245, y + 10);
    this.add.text(219, 303, '守\n护\n线', { fontFamily: 'Microsoft YaHei', fontSize: '17px', color: '#fff3c8', stroke: '#354d23', strokeThickness: 4, align: 'center' }).setOrigin(0.5);
    for (let lane=0; lane<laneCount; lane++) {
      const visual=new SpeciesZombie(this,'peashooter');
      visual.image.setScale(0.8);visual.image.x=shooterX-240*0.8;visual.image.y=shooterY(lane)-360*0.8;visual.image.setDepth(lane*10+3);
      this.shooters.push({visual,shotElapsed:Infinity});
    }
    this.unsubscribe = this.model.onEvent(e => this.effect(e));
    this.music = this.sound.add('music', { loop: true, volume: this.model.settings.musicVolume }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
    this.unsubscribeAudio = this.model.subscribe(this.syncAudio);
    this.events.once('shutdown', () => { this.unsubscribe?.(); this.unsubscribeAudio?.(); this.music?.destroy(); });
    this.soundReady = true; this.ready();
  }
  private actor(enemy: Enemy): Actor {
    const root = this.add.container(enemy.x, laneY(enemy.lane)).setDepth(enemy.lane * 10 + 5);
    const ring = this.add.ellipse(0, 0, 88, 21, 0x182315, 0.28);
    root.add(ring);
    const body = this.add.container(0, 0).setScale(0.8); root.add(body);
    const visual = enemy.kind === 'imp' || enemy.kind === 'football' || enemy.kind === 'giant' ? new SpeciesZombie(this, enemy.kind) : new OriginalZombie(this, enemy.tier, enemy.kind); body.add(visual.image);
    const tag = this.add.rectangle(0, -211, Math.max(60, enemy.word.length * (enemy.word.length > 6 ? 20 : 25) + 24), 43, 0xfff8dc).setStrokeStyle(3, 0x536344);
    const label = this.add.text(0, -211, enemy.word, { fontFamily: 'Consolas, monospace', fontSize: enemy.word.length > 6 ? '23px' : '28px', fontStyle: 'bold', color: '#29492a' }).setOrigin(0.5);
    // Labels live above each actor, but first-row labels remain within the canvas.
    tag.y += 39; label.y += 39;
    if (enemy.tier > 1) { tag.y -= 34; label.y -= 34; }
    if (enemy.kind === 'giant') { tag.y = -222; label.y = -222; }
    tag.y = Math.max(28-root.y,tag.y*0.8); label.y=tag.y;
    const callout = this.add.container(enemy.x, root.y, [tag, label]).setDepth(100);
    root.once('destroy', () => callout.destroy());
    const health = this.add.graphics(); root.add(health);
    const actor = { voice:createVoiceClock(!enemy.kind && Math.random()<.25), callout, root, body, label, tag, ring, visual, hitUntil: 0, missUntil: 0, walkElapsed: enemy.id * 173, progress: -1, hp: -1, health };
    this.actors.set(enemy.id, actor); return actor;
  }
  update(time: number, delta: number) {
    this.model.tick(Math.min(delta / 1000, 0.1));
    const dropIds=new Set(this.model.itemDrops.map(d=>d.id));
    for(const [id,card] of this.itemActors)if(!dropIds.has(id)){this.tweens.killTweensOf(card);card.destroy();this.itemActors.delete(id);}
    const camera = this.cameras.main;
    // FIT rounds the canvas size; its automatic camera resize can miss later
    // HUD toggles when the previous logical width was fractional.
    const { width, height } = this.scale.baseSize;
    if (camera.width !== width || camera.height !== height) camera.setSize(width, height);
    const extraWidth = camera.width - layout.width;
    const cameraX = this.model.state.phase === 'intro' ? introCameraX(this.model.introElapsed) : layout.homeX;
    camera.scrollX = Math.max(0, Math.min(layout.worldWidth - camera.width, cameraX - extraWidth / 2));
    if (this.model.state.phase !== 'intro') {
      for (const [id, actor] of this.actors) if (id < 0) { actor.root.destroy(); this.actors.delete(id); }
    }
    const running = ['playing', 'teaching'].includes(this.model.state.status);
    const animate = running || ['won', 'lost'].includes(this.model.state.status);
    if (animate) {
      for (const death of this.dying) {
        death.elapsed += Math.min(delta, 100);
        death.actor.visual.render(death.elapsed, 'death');
        if (death.elapsed > death.actor.visual.deathDuration) death.actor.root.alpha = Math.max(0, 1 - (death.elapsed - death.actor.visual.deathDuration) / 500);
        if (death.actor.root.alpha === 0) death.actor.root.destroy();
      }
      this.dying = this.dying.filter(death => death.actor.root.active);
    }
    this.syncAudio();
    this.powerEffects.syncFrozen(this.model.enemies.filter(e=>this.model.isFrozen(e)));
    if (animate) this.powerEffects.update(Math.min(delta,100),running && this.model.settings.sound);
    if (running) {
      this.animationTime += Math.min(delta, 100);
    }
    if(this.model.state.status==='playing' && this.model.state.phase!=='intro') {
      const visible=this.model.enemies.filter(e=>e.x<=layout.targetX && e.hp>0);
      let speaking=this.sound.getAllPlaying().some(sound=>voiceSounds.includes(sound.key));
      for(const enemy of visible){
        const actor=this.actors.get(enemy.id);
        if(!actor||actor.visual.headLost)continue;
        const voice=tickVoice(actor.voice,Math.min(delta/1000,.1),visible.length,enemy.kind==='giant');
        if(voice && !speaking && this.model.settings.sound && this.soundReady && !this.sound.locked){
          this.sound.play(voice,{volume:enemy.kind==='giant'?.2:.17});speaking=true;
        }
      }
    }
    this.tweens.timeScale = animate ? 1 : 0;
    for (const shooter of this.shooters) {
      if (animate) shooter.shotElapsed += Math.min(delta,100);
      const shooting=shooter.shotElapsed<500;
      shooter.visual.render(shooting ? shooter.shotElapsed*4 : this.animationTime, shooting ? 'shooting' : 'idle', this.animationTime);
    }
    const target = this.model.target();
    if (!this.model.trainingEnemy && this.actors.has(1000001)) { this.actors.get(1000001)!.root.destroy(); this.actors.delete(1000001); }
    for (const enemy of [...this.model.enemies, ...(this.model.trainingEnemy ? [this.model.trainingEnemy] : [])]) {
      const a = this.actors.get(enemy.id) ?? this.actor(enemy);
      const selected = target?.id === enemy.id;
      a.root.x = enemy.x;

      a.ring.setStrokeStyle(selected ? 3 : 0, 0xffe45d, 0.95);
      const missed = this.animationTime < a.missUntil;
      a.tag.setFillStyle(missed ? 0xffb0a5 : selected ? 0xffe76e : 0xfff8dc).setStrokeStyle(3, missed ? 0xcc302e : selected ? 0x695422 : 0x536344);
      a.label.setColor(missed ? '#c71f24' : '#29492a');
      if (running) {
        a.walkElapsed += (this.model.isFrozen(enemy) ? 0 : Math.min(delta, 100)) * (this.model.state.mode === 'endless' ? enemySpeedFactor(enemy) : 1);
        a.visual.render(a.walkElapsed, this.model.state.status === 'teaching' ? 'idle' : 'walk');
        a.body.x = this.animationTime < a.hitUntil ? 5 : 0;
        const flash = this.animationTime < a.hitUntil && Math.floor(this.animationTime / 45) % 2 === 0;
        if (flash) a.visual.image.setTintFill(0xffebba); else if (this.model.isFrozen(enemy)) a.visual.image.setTint(0x88dfff); else a.visual.image.clearTint();
      }
      if (a.hp !== enemy.hp) {
        a.hp = enemy.hp;
        const ratio = enemy.hp / enemy.maxHp;
        a.health.clear().fillStyle(0x183521, 0.8).fillRoundedRect(-32, 11, 64, 10, 4);
        a.health.fillStyle(ratio > 0.5 ? 0xb5dc63 : 0xffba61).fillRoundedRect(-30, 13, 60 * ratio, 6, 3);
        const stage = armorStage(enemy);
        a.visual.armor = stage === 'none' ? 'broken' : stage;
        a.root.getByName('remaining')?.destroy();
        const count = this.add.text(0, 28, `剩余 ${enemy.hp} 个字符`, { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: '#fff4c4', stroke: '#294523', strokeThickness: 3 }).setOrigin(0.5).setName('remaining');
        a.root.add(count);
      }
      if (a.progress !== enemy.progress || a.label.text !== displaySequence(enemy.word.substring(enemy.progress))) {
        a.progress = enemy.progress;
        a.label.setText(displaySequence(enemy.word.substring(enemy.progress)));
        // Completed letters remain visible underneath the remaining letters.
        const old = a.callout.getByName('progress'); old?.destroy();
        if (enemy.word.length > 1) {
          const progress = this.add.text(0, a.tag.y + 28, `${displaySequence(enemy.word.substring(0, enemy.progress))}${'·'.repeat(enemy.word.length - enemy.progress)}`, { fontSize: '16px', fontFamily: 'Consolas', color: '#ffffff', stroke: '#30481f', strokeThickness: 3 }).setOrigin(0.5).setName('progress');
          a.callout.add(progress);
        }
      }
    }
    const boxes = [...this.model.enemies, ...(this.model.trainingEnemy ? [this.model.trainingEnemy] : [])].map(enemy => {
      const actor = this.actors.get(enemy.id)!;
      return { id:enemy.id, x:enemy.x, y:actor.root.y + actor.tag.y - 24, width:actor.tag.width, height:enemy.word.length > 1 ? 76 : 48 };
    });
    for (const [id, placement] of arrangeLabels(boxes, target?.id)) {
      const actor = this.actors.get(id)!;
      actor.callout.setPosition(placement.x, actor.root.y).setVisible(placement.visible).setDepth(placement.depth);
    }
    if (running && this.model.state.phase === 'intro') {
      for (const [id, a] of this.actors) if (id < 0) a.visual.render(this.animationTime + Math.abs(id) * 250, 'idle');
    }
  }
  private dropPart(a: Actor, texture: string, track: string) {
    const anchor = a.visual instanceof SpeciesZombie ? a.visual.anchor() : a.visual.anchor(track);
    const piece = this.add.image(a.root.x + anchor.x*a.body.scaleX, a.root.y + anchor.y*a.body.scaleY, texture).setOrigin(0).setScale(0.8).setDepth(a.root.depth + 1).setName('effect');
    this.tweens.add({ targets: piece, x: piece.x + 35, y: a.root.y - 12, angle: 95, duration: 650, ease: 'Quad.easeIn', onComplete: () => {
      this.tweens.add({ targets: piece, alpha: 0, delay: 350, duration: 400, onComplete: () => piece.destroy() });
    } });
    if (this.model.settings.sound) this.sound.play('limbs_pop', { volume: 0.16 });
  }
  private effect(event: GameEvent) {
    if (event.type === 'victory') {
      this.syncAudio();
      if (this.model.settings.sound) this.sound.play('victory', { volume: 0.4 });
      const group = this.add.container(0, 0).setDepth(300).setScrollFactor(0).setName('effect');
      const shade = this.add.rectangle(400, 300, 800, 600, 0x163321, 0.38).setAlpha(0);
      const rays = this.add.image(400, 290, 'victory-rays').setDisplaySize(340, 340).setAlpha(0);
      const trophy = this.add.image(400, 335, 'victory-trophy').setScale(0).setAngle(-15);
      const title = this.add.text(400, 165, '花园守住啦！', { fontFamily: 'Microsoft YaHei', fontSize: '44px', fontStyle: 'bold', color: '#fff2a4', stroke: '#456326', strokeThickness: 7 }).setOrigin(0.5).setAlpha(0);
      const subtitle = this.add.text(400, 420, '小小手指，大大胜利！', { fontFamily: 'Microsoft YaHei', fontSize: '22px', color: '#fffbd8', stroke: '#395226', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0);
      group.add([shade, rays, trophy, title, subtitle]);
      this.tweens.add({ targets: [shade, rays, title, subtitle], alpha: 1, delay: 650, duration: 450 });
      this.tweens.add({ targets: trophy, scale: 1.2, angle: 0, y: 295, delay: 650, duration: 800, ease: 'Back.easeOut' });
      this.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });
      for (let i = 0; i < 14; i++) {
        const angle = Math.PI * 2 * i / 14;
        const star = this.add.image(400, 290, 'victory-star').setDisplaySize(20, 20).setAlpha(0); group.add(star);
        this.tweens.add({ targets: star, x: 400 + Math.cos(angle) * 210, y: 290 + Math.sin(angle) * 165, alpha: { from: 1, to: 0 }, angle: 180, delay: 1100 + (i % 3) * 100, duration: 1800, ease: 'Cubic.easeOut' });
      }
      return;
    }
    if (event.type === 'reset') {
      this.powerEffects.clear();
      this.itemActors.clear();
      this.shooters.forEach(s => { s.shotElapsed=Infinity; s.visual.render(0,'idle'); });
      this.sound.stopAll(); this.pendingWaveSound = null; this.animationTime = 0;
      this.tweens.killAll(); this.actors.forEach(a => a.root.destroy()); this.actors.clear();
      this.dying.forEach(d => d.actor.root.destroy()); this.dying = [];
      this.children.list.filter(o => o.name === 'effect').forEach(o => o.destroy());
      this.cameras.main.setScroll(layout.homeX, 0);
      // Preview figures on the street are decorative, never targetable enemies.
      for (let i = 0; i < 3; i++) {
        const preview = this.actor({ id: -i - 1, x: 1110 + i * 65, lane: i + 1, tier: i + 1, word: '', progress: 0, hp: i + 1, maxHp: i + 1 });
        preview.callout.setVisible(false);
      }
      return;
    }
    if (event.type === 'wave') {
      this.pendingWaveSound = event.final ? 'finalwave' : 'hugewave';
      const banner = this.add.text(this.cameras.main.width / 2, 300, `${event.final ? '最后一波僵尸即将到来！' : `第 ${event.wave} 波僵尸即将到来！`}\n${event.count} 只僵尸正在靠近`, { fontFamily: 'Microsoft YaHei', fontSize: '30px', fontStyle: 'bold', color: '#b52e22', stroke: '#fff2b1', strokeThickness: 7, align: 'center', lineSpacing: 10 }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setName('effect');
      this.tweens.add({ targets: banner, alpha: 0, delay: 1700, duration: 650, onComplete: () => banner.destroy() });
      this.syncAudio(); return;
    }
    if(event.type==='itemdrop') {
      const {drop}=event;
      const x=Math.max(layout.exitX+40,Math.min(layout.homeX+layout.width-45,drop.x));
      const landingY=Math.max(125,Math.min(layout.height-65,laneY(drop.lane)-45));
      const group=this.add.container(x,-48).setDepth(92).setName('effect').setAngle(-5);
      group.add(this.add.image(0,0,'seed-packet').setDisplaySize(56,78));
      group.add(this.add.image(0,-5,`power-${drop.power}`).setDisplaySize(43,43));
      group.add(this.add.rectangle(0,28,47,14,0xf5f2d6));
      group.add(this.add.text(0,28,`${powerInfo[drop.power].key} 拾取`,{fontFamily:'Microsoft YaHei',fontSize:'11px',fontStyle:'bold',color:'#43552d'}).setOrigin(0.5));
      this.itemActors.set(drop.id,group);
      this.tweens.add({targets:group,y:landingY,angle:0,duration:(1800+landingY)*2,ease:'Sine.easeOut'});return;
    }
    if(event.type==='itempickup') {
      const group=this.itemActors.get(event.drop.id);this.itemActors.delete(event.drop.id);
      if(group){this.tweens.killTweensOf(group);this.tweens.add({targets:group,y:20,alpha:0,scale:0.3,duration:350,onComplete:()=>group.destroy()});}
      if(this.model.settings.sound&&!this.sound.locked)this.sound.play('seedlift',{volume:0.25});return;
    }
    if(event.type==='power') {
      this.powerEffects.cast(event.power,event.x,event.lane);return;
    }
    const a = this.actors.get(event.enemy.id);
    if (event.type === 'miss') {
      const actor = a ?? this.actor(event.enemy);
      actor.missUntil = this.animationTime + 280;
      return;
    }
    if (event.type === 'hit') {
      const shooter=this.shooters[event.enemy.lane];
      if (shooter) {
        if (shooter.shotElapsed >= 500) shooter.shotElapsed=0;
        const pea=this.add.image(shooterX+38,shooterY(event.enemy.lane)-49,'projectile-pea').setDisplaySize(20,20).setDepth(90).setName('effect');
        const duration=Math.max(100,Math.min(330,Math.abs(event.enemy.x-(shooterX+38))/2));
        this.tweens.add({targets:pea,x:event.enemy.x-12,y:laneY(event.enemy.lane)-68,duration,ease:'Linear',onComplete:()=>{
          const splash=this.add.circle(pea.x,pea.y,9,0xb6e763,0.85).setDepth(90).setName('effect');
          pea.destroy();this.tweens.add({targets:splash,scale:2,alpha:0,duration:140,onComplete:()=>splash.destroy()});
        }});
      }
      if (this.model.settings.sound && this.soundReady) {
        const armored = event.enemy.tier > 1 && event.enemy.hp + 1 > 1;
        this.sound.play(armored ? event.enemy.tier === 3 ? 'shieldhit' : 'plastichit' : 'hit', { volume: 0.25 });
      }
      if (!a) return;
      a.hitUntil = this.animationTime + 260;
      if (a.visual instanceof OriginalZombie && event.enemy.tier > 1 && a.visual.armor !== 'broken' && armorStage(event.enemy) === 'broken') {
        this.dropPart(a, event.enemy.kind === 'door' ? 'IMAGE_REANIM_ZOMBIE_SCREENDOOR3' : event.enemy.tier === 2 ? 'cone3' : 'bucket3', event.enemy.kind === 'door' ? 'anim_screendoor' : event.enemy.tier === 2 ? 'anim_cone' : 'anim_bucket');
        a.visual.armor = 'broken';
      }
      if (a.visual instanceof OriginalZombie && this.model.state.status !== 'teaching' && !a.visual.armLost && event.enemy.hp <= 1) { this.dropPart(a, 'detached-arm', 'Zombie_outerarm_lower'); a.visual.armLost = true; }
      const flash = this.add.circle(event.enemy.x - 10, a.root.y - 85, 25, 0xfff3b0, 0.8).setDepth(100).setName('effect');
      this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
      return;
    }
    if (a) {
      a.health.setVisible(false); a.root.getByName('remaining')?.destroy();
      a.callout.getByName('progress')?.destroy();
      this.actors.delete(event.enemy.id); a.callout.setVisible(false);
      if (event.type === 'kill' && event.enemy.burned) {
        this.powerEffects.burn(event.enemy.x,event.enemy.lane,event.enemy.kind==='imp');a.root.destroy();
      } else if (event.type === 'kill') {
        if (event.enemy.kind === 'flag') this.dropPart(a, 'IMAGE_REANIM_ZOMBIE_FLAG1', 'Zombie_flaghand');
        if (a.visual instanceof OriginalZombie) { this.dropPart(a, 'detached-head', 'anim_head1'); a.visual.headLost = true; }
        a.visual.image.clearTint(); a.body.x = 0;
        a.visual.render(0, 'death'); this.dying.push({ actor: a, elapsed: 0 });
      } else this.tweens.add({ targets: a.root, alpha: 0, duration: 330, onComplete: () => a.root.destroy() });
      a.root.setName('effect');
    }
    if (event.type === 'escape') { this.cameras.main.shake(130, 0.003); return; }
    if (this.model.settings.sound) this.sound.play('zombie_falling_1', { volume: 0.16 });
    const y = laneY(event.enemy.lane) - 55;
    const bonus = this.add.text(event.enemy.x, y, `+${event.enemy.tier * 10 + (event.loot ? lootValue[event.loot] : 0)}`, { fontSize: '27px', color: '#ffe875', fontStyle: 'bold', stroke: '#345128', strokeThickness: 5 }).setOrigin(0.5).setDepth(110).setName('effect');
    this.tweens.add({ targets: bonus, y: y - 65, alpha: 0, duration: 1000, onComplete: () => bonus.destroy() });
    if (event.loot) {
      const groundY = laneY(event.enemy.lane);
      const groundX = Math.max(layout.exitX + 20, Math.min(layout.homeX + layout.width - 24, event.enemy.x - 12));
      const shadow = this.add.ellipse(groundX, groundY + 5, 30, 9, 0x183521, 0.25).setDepth(45).setName('effect').setAlpha(0);
      const coin = this.add.image(event.enemy.x, groundY - 55, event.loot).setDisplaySize(event.loot === 'diamond' ? 38 : 34, 34).setDepth(46).setName('effect');
      if (event.loot === 'copper') coin.setTint(0xc88a50);
      this.tweens.add({ targets: shadow, alpha: 1, duration: 350 });
      this.tweens.add({ targets: coin, x: groundX, y: groundY, duration: 380, ease: 'Quad.easeIn', onComplete: () => {
        this.tweens.add({ targets: coin, y: groundY - 13, duration: 130, yoyo: true, ease: 'Quad.easeOut', onComplete: () => {
          // Rest on the lawn before automatic pickup; tween delay freezes on pause.
          this.tweens.add({ targets: coin, x: layout.homeX + layout.width - 40, y: 25, scaleX: 0.15, scaleY: 0.15, alpha: 0, delay: 1300, duration: 650, ease: 'Cubic.easeIn', onStart: () => {
            shadow.destroy();
            if (this.model.settings.sound && !this.sound.locked) this.sound.play(event.loot === 'diamond' ? 'diamond-pickup' : 'coin', { volume: 0.3 });
          }, onComplete: () => coin.destroy() });
        } });
      } });
    }
  }
}
