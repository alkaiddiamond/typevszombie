import { powerTypes, powerInfo, powerWarmup, emptyPowers, type Power, type ItemDrop } from './powers';
import { makePracticePlan, practiceWord, recordPractice, type PracticePlan, type PracticeProfile } from './adaptive';
import { layout, laneCount } from './layout';
import { lessonAt, keyLabel, type Lesson, type KeyStat } from './curriculum';
export type Mode = 'letters' | 'words' | 'endless';
export type Speed = 'slow' | 'normal' | 'fast';
export type Status = 'ready' | 'teaching' | 'playing' | 'paused' | 'won' | 'lost';
export type Loot = 'copper' | 'silver' | 'gold' | 'diamond';
export type EnemyKind = 'flag' | 'door' | 'imp' | 'football' | 'giant';
export interface Enemy { burned?: boolean; frozenUntil?: number; kind?: EnemyKind; id: number; x: number; lane: number; word: string; progress: number; tier: number; hp: number; maxHp: number }
export function enemySpeedFactor(enemy: Pick<Enemy, 'kind' | 'tier' | 'hp'>): number {
  switch (enemy.kind) {
    case 'football': return 2;
    case 'imp': return 1.65;
    case 'flag': return 1.4;
    case 'giant': return 0.55;
    case 'door': return enemy.hp > 1 ? 0.65 : 1;
    default: return enemy.hp <= 1 ? 1 : enemy.tier === 3 ? 0.8 : enemy.tier === 2 ? 0.9 : 1;
  }
}
export interface Settings { unlimitedPowers: boolean; keyboard: boolean; hands: boolean; sound: boolean; music: boolean; musicVolume: number; speed: Speed }
export const defaults: Settings = { unlimitedPowers: false, keyboard: true, hands: true, sound: true, music: true, musicVolume: 0.18, speed: 'slow' };
// Each type's health is the length of one sequence, typed exactly once.
export const enemyTypes = { 1: { name: '普通僵尸', letters: 1 }, 2: { name: '路障僵尸', letters: 2 }, 3: { name: '铁桶僵尸', letters: 4 } } as const;
export function armorStage(enemy: Enemy): 'intact' | 'damaged' | 'broken' | 'none' {
  if (enemy.tier === 1) return 'none';
  if (enemy.hp <= 1) return 'broken';
  return enemy.hp < enemy.maxHp ? 'damaged' : 'intact';
}
export const lootValue: Record<Loot, number> = { copper: 5, silver: 15, gold: 30, diamond: 100 };
export const lootNames: Record<Loot, string> = { copper: '铜币', silver: '银币', gold: '金币', diamond: '钻石' };
export interface Snapshot {
  mode: Mode; level: number; status: Status; score: number; lives: number; kills: number;
  total: number; spawned: number; wave: number; totalWaves: number; correct: number; errors: number; combo: number;
  phase: 'intro' | 'warning' | 'spawning' | 'battle'; pending: number; resultReady?: boolean;
  lessonId?: number; tutorial?: 'demo' | 'practice' | 'ready'; practiceIndex?: number; practiceErrors?: number;
  powers?: Record<Power,number>; itemDrops?: ItemDrop[]; target: Enemy | null; loot: Record<Loot, number>; feedback: string; lastKey: string;
}
export type GameEvent = { type:'itemdrop'; drop:ItemDrop } | { type:'itempickup'; drop:ItemDrop } | { type:'power'; power:Power; x:number; lane:number } | { type: 'hit' | 'miss' | 'kill' | 'escape'; enemy: Enemy; loot?: Loot } | { type: 'reset' } | { type: 'victory' } | { type: 'wave'; wave: number; count: number; final: boolean };
export function rollLoot(tier: number, random = Math.random): Loot | undefined {
  const r = random();
  const chances = tier === 3 ? [0.1, 0.3, 0.6, 0.85] : tier === 2 ? [0.04, 0.16, 0.4, 0.75] : [0.01, 0.06, 0.2, 0.6];
  if (r < chances[0]) return 'diamond';
  if (r < chances[1]) return 'gold';
  if (r < chances[2]) return 'silver';
  if (r < chances[3]) return 'copper';
}
export class GardenGame {
  enemies: Enemy[] = [];
  powers=emptyPowers();
  itemDrops:ItemDrop[]=[];
  private itemSequence=0;
  private pendingPowers:{power:Power;x:number;lane:number;at:number}[]=[];
  setUnlimitedPowers(enabled:boolean) {
    this.settings.unlimitedPowers=enabled;
    if(enabled)this.itemDrops=[];
  }
  isFrozen(enemy:Enemy) { return (enemy.frozenUntil ?? 0) > this.clock; }
  trainingEnemy: Enemy | null = null;
  lesson: Lesson | null = null;
  keyStats: Record<string, KeyStat> = {};
  endlessKeys = 'FJ';
  practiceProfile: PracticeProfile = {};
  practicePlan: PracticePlan = { keys:'FJ', focus:null };
  private previousWord = '';
  private waveSpawned = 0;
  private clock = 0;
  private keyShownAt = 0;
  settings: Settings = { ...defaults };
  state: Snapshot = { mode: 'letters', level: 1, status: 'ready', phase: 'intro', pending: 0, score: 0, lives: 3, kills: 0, total: 18, spawned: 0, wave: 0, totalWaves: 4, correct: 0, errors: 0, combo: 0, target: null, loot: { copper: 0, silver: 0, gold: 0, diamond: 0 }, feedback: '把手指放到 F 和 J，准备出发！', lastKey: '' };
  private listeners = new Set<() => void>();
  private effects = new Set<(event: GameEvent) => void>();
  private nextWave = 0;
  private nextEntry = 0;
  introElapsed = 0;
  private victoryElapsed = 0;
  private waveSizes = [3, 4, 5, 6];
  private sequence = 0;
  private locked: number | null = null;
  constructor(private random = Math.random) {}
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onEvent(fn: (event: GameEvent) => void) { this.effects.add(fn); return () => { this.effects.delete(fn); }; }
  private event(event: GameEvent) { this.effects.forEach(fn => fn(event)); }
  snapshot = (): Snapshot => ({ ...this.state, powers:{...this.powers}, itemDrops:this.itemDrops.map(d=>({...d})), target: this.target() ? { ...this.target()! } : null, loot: { ...this.state.loot } });
  notify() { this.listeners.forEach(fn => fn()); }
  target(): Enemy | null {
    if (this.state.status === 'teaching') return this.trainingEnemy;
    if (this.state.phase === 'intro') return null;
    const locked = this.enemies.find(e => e.id === this.locked);
    if (locked) return locked;
    const nearest = this.enemies.filter(e => e.x <= layout.targetX).reduce<Enemy | null>((a, b) => !a || b.x < a.x ? b : a, null);
    // In endless mode, selecting a visible target locks it even before the first key.
    if (nearest && this.state.mode === 'endless') {
      this.locked = nearest.id;
      this.keyShownAt = this.clock;
    }
    return nearest;
  }
  start(mode: Mode = this.state.mode, level = 1) {
    this.powers=emptyPowers();this.itemDrops=[];this.itemSequence=0;this.pendingPowers=[];
    this.lesson = null; this.trainingEnemy = null; this.keyStats = {}; this.clock = 0; this.keyShownAt = 0;
    this.state.lessonId = undefined; this.state.tutorial = undefined;
    this.enemies = []; this.sequence = 0; this.locked = null; this.introElapsed = 0; this.nextEntry = 0; this.nextWave = 0;
    this.victoryElapsed = 0; this.state.resultReady = false;
    this.waveSizes = [3, 4, 5, 6].map(count => count + Math.min(level - 1, 2));
    this.state = { ...this.state, mode, level, status: 'playing', phase: 'intro', pending: 0, score: 0, lives: 3, kills: 0, total: this.waveSizes.reduce((sum, count) => sum + count, 0), spawned: 0, wave: 0, totalWaves: this.waveSizes.length, correct: 0, errors: 0, combo: 0, target: null, lastKey: '', loot: { copper: 0, silver: 0, gold: 0, diamond: 0 }, feedback: '先看看花园右边，准备迎接僵尸！' };
    this.event({ type: 'reset' }); this.notify();
  }
  startLesson(id: number) {
    const lesson = lessonAt(id);
    this.start('letters', lesson.id);
    this.lesson = lesson;
    this.state.lessonId = lesson.id; this.state.status = 'teaching'; this.state.phase = 'battle';
    this.waveSizes = [...lesson.waves]; this.state.total = lesson.waves.reduce((a, b) => a + b, 0); this.state.totalWaves = lesson.waves.length;
    this.state.tutorial = 'demo'; this.state.practiceIndex = 0; this.state.practiceErrors = 0;
    this.state.feedback = lesson.instruction; this.notify();
  }
  startPractice() {
    if (!this.lesson || this.state.status !== 'teaching') return;
    this.state.tutorial = 'practice'; this.state.practiceIndex = 0; this.state.practiceErrors = 0;
    this.trainingEnemy = { id: 1000001, x: 800, lane: 2, tier: 1, word: this.lesson.practice[0], progress: 0, hp: 1, maxHp: 1 };
    this.state.feedback = '僵尸站着不动，慢慢找到提示的按键。'; this.notify();
  }
  beginLessonBattle() {
    if (!this.lesson || this.state.tutorial !== 'ready') return;
    const lesson = this.lesson;
    this.start('letters', lesson.id);
    this.lesson = lesson; this.state.lessonId = lesson.id;
    this.waveSizes = [...lesson.waves]; this.state.total = lesson.waves.reduce((a, b) => a + b, 0);
    this.state.totalWaves = lesson.waves.length; this.notify();
  }
  startEndless(keys = this.endlessKeys, profile = this.practiceProfile) {
    this.start('endless');
    this.endlessKeys = [...new Set([...keys.toUpperCase()].filter(k => /^[A-Z; ]$/.test(k)))].join('') || 'FJ';
    this.practiceProfile = structuredClone(profile);
    this.state.total = 0; this.state.totalWaves = 0; this.previousWord = ''; this.practicePlan = makePracticePlan(this.endlessKeys, this.practiceProfile); this.notify();
  }
  private laneFor(index: number) { return this.lesson?.lanes === 1 ? 2 : index % laneCount; }
  private spawnWave() {
    const endless = this.state.mode === 'endless';
    if (!endless && this.state.wave >= this.waveSizes.length) return;
    const count = endless ? Math.min(24, 8 + this.state.wave * 2) : this.waveSizes[this.state.wave];
    if (endless) { this.state.total += count; this.practicePlan = makePracticePlan(this.endlessKeys, this.practiceProfile); }
    this.waveSpawned = 0;
    this.state.wave++;
    this.state.pending = count; this.state.phase = 'warning'; this.nextEntry = 3;
    const final = !endless && this.state.wave === this.state.totalWaves;
    this.state.feedback = `${final ? '最后一波' : `第 ${this.state.wave} 波`}即将到来！这次有 ${count} 只僵尸`;
    this.event({ type: 'wave', wave: this.state.wave, count, final });
    this.notify();
  }
  pause() { if (this.state.status === 'playing') { this.state.status = 'paused'; this.notify(); } }
  resume() { if (this.state.status === 'paused') { this.state.status = 'playing'; this.notify(); } }
  private spawn(x = 1050) {
    if (this.state.spawned >= this.state.total) return;
    const index = this.state.spawned;
    let tier: 1 | 2 | 3 = index % 5 === 4 ? 3 : index % 3 === 2 ? 2 : 1;
    if (this.lesson) tier = Math.min(tier, this.state.wave === 1 && this.lesson.newKeys ? 1 : this.lesson.maxTier) as 1 | 2 | 3;
    const letters = this.state.level === 1 ? ['F', 'J', 'D', 'K'] : this.state.level === 2 ? ['A', 'S', 'D', 'F', 'J', 'K', 'L'] : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const words = { 1: ['A', 'I'], 2: ['AT', 'IN', 'ON', 'UP', 'GO', 'TO'], 3: ['CATS', 'DOGS', 'STAR', 'HATS', 'PIGS', 'BIRD', 'CUPS', 'TREE'] };
    // Cycle lanes and keep entry spacing independent of input timing.
    let kind: EnemyKind | undefined = this.state.mode === 'endless' ? this.waveSpawned === 0 ? 'flag' : this.state.wave >= 3 && this.waveSpawned % 5 === 4 ? 'door' : undefined : undefined;
    if (this.state.mode === 'endless' && this.waveSpawned > 0) {
      if (this.state.wave >= 6 && this.waveSpawned % 8 === 7) kind = 'giant';
      else if (this.state.wave >= 4 && this.waveSpawned % 6 === 5) kind = 'football';
      else if (!kind && this.state.wave >= 2 && this.waveSpawned % 4 === 1) kind = 'imp';
    }
    if (kind) tier = ['door','football','giant'].includes(kind) ? 3 : 1;
    const length = kind === 'imp' ? 3 : kind === 'football' ? 5 : kind === 'giant' ? Math.min(10, 7 + Math.floor((this.state.wave - 6) / 2)) : kind === 'door' ? 6 : kind === 'flag' ? 2 : enemyTypes[tier].letters;
    let word = this.state.mode === 'letters'
      ? Array.from({ length }, () => letters[Math.floor(this.random() * letters.length)]).join('')
      : words[tier][Math.floor(this.random() * words[tier].length)];
    if (this.lesson) {
      const focus = this.lesson.newKeys;
      const pool = this.state.wave === 1 && focus ? focus : this.lesson.keys;
      word = Array.from({ length }, (_, n) => pool[(index + n + Math.floor(this.random() * pool.length)) % pool.length]).join('');
      if (this.lesson.id >= 9 && tier === 3 && index % 2 === 0) word = `${this.lesson.keys[index % (this.lesson.keys.length - 1)]} ${this.lesson.keys[(index + 1) % (this.lesson.keys.length - 1)]}${this.lesson.keys[(index + 2) % (this.lesson.keys.length - 1)]}`;
    }
    if (this.state.mode === 'endless') { word = practiceWord(length, this.practicePlan, this.practiceProfile, this.random, this.previousWord); this.previousWord = word; }
    const maxHp = word.length;
    this.enemies.push({ id: ++this.sequence, x, lane: this.laneFor(index), kind, word, progress: 0, tier, hp: maxHp, maxHp });
    this.state.spawned++; this.waveSpawned++;
  }
  tick(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (this.state.status === 'teaching') return;
    if (this.state.status === 'won') {
      if (!this.state.resultReady) {
        this.victoryElapsed += seconds;
        if (this.victoryElapsed >= 4.5) { this.state.resultReady = true; this.notify(); }
      }
      return;
    }
    // Small deterministic steps keep entry delays and movement correct on long frames.
    while (seconds > 0.000001 && this.state.status === 'playing') {
      const step = Math.min(seconds, 0.05); this.advance(step); seconds -= step;
    }
  }
  private advance(seconds: number) {
    if (this.state.status !== 'playing') return;
    this.clock += seconds;
    const due=this.pendingPowers.filter(p=>p.at<=this.clock);
    this.pendingPowers=this.pendingPowers.filter(p=>p.at>this.clock);
    for(const p of due)this.resolvePower(p.power,p.x,p.lane);
    if(this.state.status!=='playing')return;
    if (this.state.phase === 'intro') {
      this.introElapsed = Math.min(layout.introSeconds, this.introElapsed + seconds);
      if (this.introElapsed >= layout.introSeconds - 0.000001) this.spawnWave();
      return;
    }
    const previousTarget = this.target()?.id;
    const speed = this.lesson ? this.lesson.speed * { slow: 1, normal: 1.2, fast: 1.5 }[this.settings.speed] : { slow: 12, normal: 20, fast: 30 }[this.settings.speed] * (1 + (this.state.mode === 'endless' ? Math.min(10, this.state.wave - 1) : this.state.level - 1) * 0.08);
    if (this.state.pending > 0) {
      this.nextEntry -= seconds;
      if (this.nextEntry <= 0.000001) {
        const lane = this.laneFor(this.state.spawned);
        const rightmost = this.enemies.filter(e => e.lane === lane).reduce((x, e) => Math.max(x, e.x), 0);
        this.spawn(Math.max(layout.entryX, rightmost + 130));
        this.state.pending--; this.state.phase = this.state.pending ? 'spawning' : 'battle';
        this.nextEntry = this.lesson?.entryGap ?? (this.state.mode === 'endless' ? Math.max(0.8, 1.7 - this.state.wave * 0.08) : 1.6);
        if (!this.state.pending) this.nextWave = this.lesson || this.state.mode === 'endless' ? 12 : this.state.mode === 'words' ? 22 : 18;
        this.notify();
      }
    } else if (this.state.mode === 'endless' || this.state.wave < this.state.totalWaves) {
      if (this.enemies.length === 0) this.nextWave = Math.min(this.nextWave, 3);
      this.nextWave -= seconds;
      if (this.nextWave <= 0.000001) this.spawnWave();
    }
    const ahead = new Map<number, number>();
    for (const enemy of [...this.enemies].sort((a, b) => a.x - b.x)) {
      const factor = this.isFrozen(enemy) ? 0 : this.state.mode === 'endless' ? enemySpeedFactor(enemy) : 1;
      enemy.x = enemy.x > layout.targetX ? Math.max(layout.targetX, enemy.x - 48 * factor * seconds) : enemy.x - speed * factor * seconds;
      const previousX = ahead.get(enemy.lane);
      if (this.state.mode !== 'endless' && previousX !== undefined) enemy.x = Math.max(enemy.x, previousX + 115);
      ahead.set(enemy.lane, enemy.x);
      if (enemy.x <= layout.exitX) {
        this.enemies = this.enemies.filter(e => e.id !== enemy.id);
        if (this.locked === enemy.id) this.locked = null;
        this.state.lives--; this.state.combo = 0;
        this.state.feedback = '有一只溜过去了，继续守护花园！';
        this.event({ type: 'escape', enemy: { ...enemy } });
        if (this.state.lives <= 0) { this.state.status = 'lost'; this.notify(); return; }
        this.notify();
      }
    }
    this.checkComplete();
    if (previousTarget !== this.target()?.id) { this.keyShownAt = this.clock; this.notify(); }
  }
  input(key: string) {
    if (/^[1-4]$/.test(key)) { this.usePower(powerTypes[Number(key)-1]); return; }
    if (!/^[a-z; ]$/i.test(key)) return;
    if (this.state.status === 'teaching') {
      if (this.state.tutorial !== 'practice' || !this.lesson || !this.trainingEnemy) return;
      const expected = this.lesson.practice[this.state.practiceIndex ?? 0];
      if (key.toUpperCase() !== expected) { this.event({ type: 'miss', enemy: { ...this.trainingEnemy } }); this.state.practiceErrors = (this.state.practiceErrors ?? 0) + 1; this.state.feedback = `慢慢来，这次找 ${keyLabel(expected)}`; this.notify(); return; }
      this.event({ type: 'hit', enemy: { ...this.trainingEnemy } });
      this.state.practiceIndex = (this.state.practiceIndex ?? 0) + 1;
      if (this.state.practiceIndex >= this.lesson.practice.length) { this.state.tutorial = 'ready'; this.trainingEnemy = null; this.state.feedback = '准备好啦！现在去守护花园。'; }
      else { this.trainingEnemy.word = this.lesson.practice[this.state.practiceIndex]; this.state.feedback = `按对了！接着找 ${keyLabel(this.trainingEnemy.word)}`; }
      this.notify(); return;
    }
    if (this.state.status !== 'playing') return;
    const enemy = this.target(); if (!enemy) return;
    const upper = key.toUpperCase(); this.state.lastKey = upper;
    const expected = enemy.word[enemy.progress];
    const stat = this.keyStats[expected] ??= { correct: 0, errors: 0, responseMs: 0, samples: 0 };
    if (this.state.mode === 'endless') recordPractice(this.practiceProfile, expected, upper === expected, (this.clock - this.keyShownAt) * 1000, enemy.progress === 0);
    if (upper !== enemy.word[enemy.progress]) {
      this.event({ type: 'miss', enemy: { ...enemy } });
      stat.errors++;
      this.state.errors++; this.state.combo = 0;
      this.state.feedback = `再试试 ${keyLabel(enemy.word[enemy.progress])}，不用着急`; this.notify(); return;
    }
    this.locked = enemy.id; enemy.progress++; enemy.hp--; this.state.correct++; this.state.combo++;
    stat.correct++; stat.samples++; stat.responseMs += Math.max(0, this.clock - this.keyShownAt) * 1000; this.keyShownAt = this.clock;
    this.state.feedback = this.state.combo >= 5 ? `连续答对 ${this.state.combo} 次，真棒！` : '按对啦，继续！';
    if (enemy.hp > 0) this.state.feedback = `命中！接着按 ${keyLabel(enemy.word[enemy.progress])}，还剩 ${enemy.hp} 个按键`;
    this.event({ type: 'hit', enemy: { ...enemy } });
    if (enemy.hp === 0) {
      this.defeat(enemy, true);
    }
    this.keyShownAt = this.clock;
    this.checkComplete(); this.notify();
  }
  private defeat(enemy:Enemy, allowItem:boolean) {
    this.state.kills++; this.state.score += enemy.tier * 10;
    const loot=rollLoot(enemy.tier,this.random);
    if(loot){this.state.loot[loot]++;this.state.score+=lootValue[loot];}
    this.enemies=this.enemies.filter(e=>e.id!==enemy.id);
    if(this.locked===enemy.id)this.locked=null;
    this.event({type:'kill',enemy:{...enemy},loot});
    if(allowItem && !this.settings.unlimitedPowers && this.state.mode==='endless' && this.random() < (enemy.tier===3 ? 0.2 : 0.12)) {
      const power=powerTypes[Math.floor(this.random()*powerTypes.length)];
      if(!this.powers[power] && !this.itemDrops.some(d=>d.power===power)){
        const drop={id:++this.itemSequence,power,x:enemy.x,lane:enemy.lane};this.itemDrops.push(drop);
        this.event({type:'itemdrop',drop:{...drop}});
      }
    }
  }
  usePower(power:Power) {
    if((this.state.mode!=='endless'&&!this.settings.unlimitedPowers)||this.state.status!=='playing')return;
    if(!this.settings.unlimitedPowers&&!this.powers[power]) {
      const drop=this.itemDrops.find(d=>d.power===power);
      if(!drop){this.state.feedback=`还没有${powerInfo[power].name}掉落`;this.notify();return;}
      this.itemDrops=this.itemDrops.filter(d=>d.id!==drop.id);this.powers[power]=1;
      this.event({type:'itempickup',drop:{...drop}});
      this.state.feedback=`已拾取${powerInfo[power].name}，再按 ${powerInfo[power].key} 释放`;this.notify();return;
    }
    const target=this.target();
    if(!target){this.state.feedback='等有目标僵尸时再释放，道具已保留';this.notify();return;}
    const {x,lane}=target;if(!this.settings.unlimitedPowers)this.powers[power]=0;
    this.event({type:'power',power,x,lane});
    this.pendingPowers.push({power,x,lane,at:this.clock+powerWarmup[power]});
    this.state.feedback=`${powerInfo[power].name}准备释放！`;this.notify();
  }
  private resolvePower(power:Power,x:number,lane:number) {
    for(const enemy of [...this.enemies]) {
      if(enemy.x>layout.targetX)continue;
      if(power==='ice'){enemy.frozenUntil=this.clock+6;continue;}
      const affected=power==='pepper'?enemy.lane===lane:Math.abs(enemy.lane-lane)<=(power==='cherry'?1:2)&&Math.abs(enemy.x-x)<=(power==='cherry'?140:260);
      if(affected){enemy.burned=true;enemy.hp=0;enemy.progress=enemy.word.length;this.defeat(enemy,false);}
    }
    this.keyShownAt=this.clock;
    this.state.feedback=`${powerInfo[power].name}已释放！`;this.checkComplete();this.notify();
  }
  private checkComplete() {
    if (this.state.mode !== 'endless' && this.state.status === 'playing' && this.state.spawned === this.state.total && this.enemies.length === 0) {
      this.state.status = 'won'; this.state.feedback = '花园守住啦！';
      this.victoryElapsed = 0; this.state.resultReady = false;
      this.event({ type: 'victory' }); this.notify();
    }
  }
}
