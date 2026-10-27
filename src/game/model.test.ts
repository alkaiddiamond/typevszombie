import { createVoiceClock, tickVoice, groans, lowGroans } from './zombie-voice';
import { powerWarmup } from './powers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GardenGame, enemyTypes, armorStage, rollLoot, type Mode } from './model';
import { layout, introCameraX } from './layout';
import { frameMatrix, sampleFrame, type ReanimFrame } from './reanim';

function until(game: GardenGame, condition: () => boolean, limit = 120) {
  for (let i = 0; i < limit * 10 && !condition(); i++) game.tick(0.1);
  assert.ok(condition(), 'Expected state was not reached');
}
function ready(mode: Mode = 'letters') {
  const game = new GardenGame(() => 0); game.start(mode);
  until(game, () => game.target() !== null); return game;
}
test('800x600 camera moves across the native panorama and returns home', () => {
  assert.equal(layout.width, 800); assert.equal(layout.height, 600);
  assert.equal(introCameraX(0), layout.homeX); assert.equal(introCameraX(2.5), layout.previewX);
  assert.equal(introCameraX(6), layout.homeX);
  for (let t = 0; t <= 7; t += 0.1) assert.ok(introCameraX(t) >= 0 && introCameraX(t) + layout.width <= layout.worldWidth);
});
test('intro and warning precede staggered enemy entries', () => {
  const game = new GardenGame(); game.start();
  assert.equal(game.state.wave, 0); assert.equal(game.state.spawned, 0);
  game.tick(5); game.input('F'); assert.equal(game.state.correct, 0); assert.equal(game.state.phase, 'intro');
  game.tick(1); assert.equal(game.state.phase, 'warning'); assert.equal(game.state.pending, 3);
  game.tick(2.9); assert.equal(game.enemies.length, 0);
  game.tick(0.1); assert.equal(game.enemies.length, 1);
  game.tick(1.5); assert.equal(game.enemies.length, 1);
  game.tick(0.1); assert.equal(game.enemies.length, 2);
});
test('off-screen enemies cannot be typed until they enter the defensive viewport', () => {
  const game = new GardenGame(() => 0); game.start(); game.tick(9);
  const enemy = game.enemies[0]; assert.ok(enemy.x > layout.homeX + layout.width);
  assert.equal(game.target(), null); game.input(enemy.word); assert.equal(game.state.correct, 0);
  until(game, () => game.target() !== null); assert.ok(game.target()!.x <= layout.targetX);
  game.input(enemy.word); assert.equal(game.state.kills, 1); assert.equal(game.state.score, 110);
});
test('word input locks target, preserves errors, and hits once per letter', () => {
  const game = ready('words'); until(game, () => game.enemies.some(e => e.tier === 3));
  const bucket = game.enemies.find(e => e.tier === 3)!; bucket.x = 350;
  let hits = 0; game.onEvent(e => { if (e.type === 'hit') hits++; });
  game.input('C'); game.enemies[0].x = 300; assert.equal(game.target()?.id, bucket.id);
  game.input('Z'); assert.equal(bucket.progress, 1); assert.equal(bucket.hp, 3);
  game.input('A'); game.input('T'); assert.equal(bucket.hp, 1); assert.equal(game.state.kills, 0); game.input('S'); assert.equal(hits, 4); assert.equal(game.state.kills, 1);
});
test('pause freezes camera, warning countdown and incoming queue', () => {
  const game = new GardenGame(); game.start(); game.tick(1);
  const elapsed = game.introElapsed; game.pause(); game.tick(50); assert.equal(game.introElapsed, elapsed);
  game.resume(); game.tick(5); game.tick(1);
  const pending = game.state.pending; game.pause(); game.tick(30);
  assert.equal(game.state.pending, pending); assert.equal(game.state.spawned, 0);
  game.resume(); game.tick(2); assert.equal(game.state.spawned, 1);
});
test('pause also freezes movement and input', () => {
  const game = ready(); const target = game.target()!; const x = target.x;
  game.pause(); game.tick(30); game.input(target.word); assert.equal(target.x, x); assert.equal(game.state.score, 0);
  game.resume(); game.tick(1); assert.ok(target.x < x);
});
test('three escapes end the round', () => {
  const game = ready(); until(game, () => game.state.spawned === 3);
  game.enemies.forEach(e => e.x = 246); game.tick(1);
  assert.equal(game.state.status, 'lost'); assert.equal(game.state.lives, 0);
});
test('four multi-enemy waves announce once and complete only after all entries', () => {
  const game = new GardenGame(() => 0);
  const waves: { count: number; final: boolean; spawned: number }[] = [];
  game.onEvent(e => { if (e.type === 'wave') waves.push({ count: e.count, final: e.final, spawned: game.state.spawned }); });
  game.start('words');
  for (let i = 0; i < 3000 && game.state.status === 'playing'; i++) {
    const target = game.target(); if (target) game.input(target.word[target.progress]); game.tick(0.1);
  }
  assert.equal(game.state.status, 'won'); assert.equal(game.state.kills, 18);
  assert.deepEqual(waves.map(e => e.count), [3, 4, 5, 6]);
  assert.deepEqual(waves.map(e => e.spawned), [0, 3, 7, 12]);
  assert.deepEqual(waves.map(e => e.final), [false, false, false, true]);
  game.tick(100); assert.equal(waves.length, 4);
});
test('clearing visible enemies never skips the remaining incoming queue', () => {
  const game = ready(); assert.ok(game.state.pending > 0);
  const target = game.target()!; game.input(target.word);
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.wave, 1);
  game.tick(1); assert.equal(game.state.wave, 1);
});
test('restart clears old entries and camera progress', () => {
  const game = ready(); game.start('words', 2);
  assert.equal(game.state.spawned, 0); assert.equal(game.state.wave, 0); assert.equal(game.state.pending, 0);
  assert.equal(game.introElapsed, 0); assert.equal(game.enemies.length, 0); assert.equal(game.target(), null);
  game.tick(9); assert.equal(game.state.spawned, 1); assert.equal(game.state.pending, 3);
});
test('two and four letters progressively break armor and reward only death', () => {
  for (const tier of [2, 3]) {
    const game = ready('words'); until(game, () => game.enemies.some(e => e.tier === tier));
    const enemy = game.enemies.find(e => e.tier === tier)!; enemy.x = 300;
    assert.equal(enemy.word.length, enemyTypes[tier as 2 | 3].letters); assert.equal(armorStage(enemy), 'intact');
    for (let n = 1; n < enemy.maxHp; n++) {
      game.input(enemy.word[enemy.progress]); assert.equal(enemy.hp, enemy.maxHp - n); assert.equal(game.state.score, 0);
      assert.equal(armorStage(enemy), enemy.maxHp - n === 1 ? 'broken' : 'damaged');
    }
    game.input(enemy.word[enemy.progress]); assert.equal(game.state.kills, 1); assert.equal(game.state.score, tier * 10 + 100);
  }
});
test('loot tiers include no drop and higher rare reward chances', () => {
  assert.equal(rollLoot(1, () => 0), 'diamond'); assert.equal(rollLoot(1, () => 0.03), 'gold');
  assert.equal(rollLoot(1, () => 0.12), 'silver'); assert.equal(rollLoot(1, () => 0.4), 'copper');
  assert.equal(rollLoot(1, () => 0.9), undefined); assert.equal(rollLoot(3, () => 0.08), 'diamond');
});
test('native reanimation keeps independent skew axes and top-left translation', () => {
  const frame: ReanimFrame = [4, 6, 0, 90, 2, 3, 0, 1, 'head'];
  const [a, b, c, d, x, y] = frameMatrix(frame);
  assert.equal(a, 2); assert.equal(b, 0); assert.equal(c, -3); assert.ok(Math.abs(d) < 1e-10);
  assert.equal(x, 4); assert.equal(y, 6);
});
test('native frame interpolation wraps angles and preserves discrete visibility and image', () => {
  const a: ReanimFrame = [0, 10, 350, 350, 1, 1, 0, 1, 'head'];
  const b: ReanimFrame = [10, 20, 10, 10, 1, 1, -1, 0, 'other'];
  const mid = sampleFrame([a, b], 0.5);
  assert.equal(mid[0], 5); assert.equal(mid[2], 360); assert.equal(mid[6], 0); assert.equal(mid[8], 'head');
  assert.equal(sampleFrame([a, b], 1)[6], -1);
});
test('victory celebrates once before results and resets for the next game', () => {
  const game = new GardenGame(() => 0); let victories = 0;
  game.onEvent(e => { if (e.type === 'victory') victories++; }); game.start();
  for (let i = 0; i < 3000 && game.state.status === 'playing'; i++) {
    const target = game.target(); if (target) game.input(target.word[target.progress]);
    if (game.state.status === 'playing') game.tick(0.1);
  }
  assert.equal(game.state.status, 'won'); assert.equal(victories, 1);
  assert.equal(game.state.resultReady, false);
  game.tick(4); assert.equal(game.state.resultReady, false);
  game.tick(0.5); assert.equal(game.state.resultReady, true);
  game.tick(10); assert.equal(victories, 1);
  game.start(); assert.equal(game.state.resultReady, false);
});

import { lessons, lessonAt, parseProgress, unlockedLesson, weakKeys, displaySequence } from './curriculum';
function lessonBattle(id: number) {
  const game = new GardenGame(() => 0.3);
  game.startLesson(id); game.startPractice();
  for (const key of lessonAt(id).practice) game.input(key);
  game.beginLessonBattle(); return game;
}
test('teaching waits without danger and requires successful practice before battle', () => {
  const game = new GardenGame(); game.startLesson(1);
  game.tick(300); game.input('F'); game.beginLessonBattle();
  assert.equal(game.state.status, 'teaching'); assert.equal(game.state.spawned, 0);
  game.startPractice(); game.input('X');
  assert.equal(game.state.practiceIndex, 0); assert.equal(game.state.practiceErrors, 1);
  assert.equal(game.state.errors, 0); assert.equal(game.state.lives, 3);
  for (const key of 'FJFJ') game.input(key);
  assert.equal(game.state.tutorial, 'ready'); assert.equal(game.state.score, 0); assert.equal(game.trainingEnemy, null);
  game.beginLessonBattle(); assert.equal(game.state.status, 'playing'); assert.equal(game.state.phase, 'intro');
  assert.equal(game.state.total, 11);
});
test('all ten lessons can complete, use taught keys and maintain 1/2/4-letter armor', () => {
  for (const lesson of lessons) {
    const game = lessonBattle(lesson.id); const seen = new Set<number>(); const waves: number[] = [];
    game.onEvent(e => { if (e.type === 'wave') waves.push(e.count); });
    for (let t = 0; t < 6000 && game.state.status === 'playing'; t++) {
      game.tick(0.1);
      for (const enemy of game.enemies) {
        seen.add(enemy.id); assert.ok([...enemy.word].every(k => lesson.keys.includes(k)));
        assert.ok(enemy.tier <= lesson.maxTier); assert.equal(enemy.word.length, enemyTypes[enemy.tier as 1 | 2 | 3].letters);
        if (lesson.lanes === 1) assert.equal(enemy.lane, 2);
        if (game.state.wave === 1 && lesson.newKeys) assert.equal(enemy.tier, 1);
      }
      const target = game.target(); if (target) game.input(target.word[target.progress]);
    }
    assert.equal(game.state.status, 'won', `Lesson ${lesson.id}`);
    assert.deepEqual(waves, lesson.waves); assert.equal(seen.size, lesson.waves.reduce((a,b) => a+b,0));
    assert.equal(game.state.lives, 3);
  }
});
test('stationary lesson stops at the target line and never approaches the house', () => {
  const game = lessonBattle(5); until(game, () => game.target() !== null);
  const enemy = game.target()!; const x = enemy.x; game.tick(120);
  assert.equal(enemy.x, x); assert.equal(game.state.lives, 3);
});
test('semicolon and space work in teaching and battle and render visibly', () => {
  const game = lessonBattle(9); until(game, () => game.target() !== null);
  assert.equal(game.target()!.word, ' '); game.input(' '); assert.equal(game.state.kills, 1);
  const other = lessonBattle(7); until(other, () => other.target() !== null);
  other.target()!.word = ';'; other.input(';'); assert.equal(other.state.kills, 1);
  assert.equal(displaySequence('F J'), 'F␣J');
});
test('saved course progress validates IDs and unlocks the next missing lesson', () => {
  assert.equal(unlockedLesson(parseProgress(null)), 1);
  assert.deepEqual(parseProgress('broken').completed, []);
  const progress = parseProgress(JSON.stringify({ completed: [1, 2, 2, 4, -1, 11, '3'] }));
  assert.deepEqual(progress.completed, [1, 2, 4]); assert.equal(unlockedLesson(progress), 3);
  assert.equal(unlockedLesson({ completed: lessons.map(l => l.id), results: {} }), 10);
});

test('stationary lesson demonstrates all four practice keys', () => { assert.equal(lessonAt(5).demo, 'FDJK'); assert.equal(lessonAt(5).practice, 'FDJK'); });

test('wrong input signals only the current target without damage or progress loss', () => {
  const game = ready('words');
  until(game, () => game.enemies.some(e => e.tier === 3));
  const enemy = game.enemies.find(e => e.tier === 3)!; enemy.x = 300;
  game.input(enemy.word[0]);
  const before = { ...enemy }; const events: string[] = [];
  game.onEvent(e => { events.push(e.type); if (e.type === 'miss') assert.equal(e.enemy.id, enemy.id); });
  game.input('Z');
  assert.deepEqual(events, ['miss']); assert.deepEqual(enemy, before);
  let practiceTarget = 0;
  // Subscribe independently because this practice target differs from the battle target.
  const practice = new GardenGame(); practice.startLesson(1); practice.startPractice();
  practice.onEvent(e => { if (e.type === 'miss') practiceTarget = e.enemy.id; });
  practice.input('X'); assert.equal(practiceTarget, practice.target()!.id);
  assert.equal(practice.state.practiceIndex, 0); assert.equal(practice.state.score, 0);
});

import { practiceKey, practiceWeight, readPractice, recordPractice, makePracticePlan, practiceWord, keyConfidence, type PracticeProfile } from './adaptive';
test('endless continues past four waves with no victory and keeps armor lengths', () => {
  const game = new GardenGame(() => 0.3); game.startEndless('FDJK');
  let victories = 0; const waves: number[] = [];
  game.onEvent(e => { if(e.type === 'victory') victories++; if(e.type === 'wave') { assert.equal(e.final, false); waves.push(e.count); } });
  until(game, () => {
    for (const enemy of game.enemies) { assert.ok([...enemy.word].every(k => 'FDJK'.includes(k))); assert.equal(enemy.maxHp, enemy.kind === 'imp' ? 3 : enemy.kind === 'football' ? 5 : enemy.kind === 'giant' ? enemy.word.length : enemy.kind === 'door' ? 6 : enemy.kind === 'flag' ? 2 : enemyTypes[enemy.tier as 1|2|3].letters); }
    const enemy = game.target(); if(enemy) game.input(enemy.word[enemy.progress]);
    return game.state.wave >= 7;
  }, 400);
  assert.equal(game.state.status,'playing'); assert.equal(victories,0); assert.ok(waves[6] > waves[0]);
  game.pause(); const wave = game.state.wave; game.tick(100); assert.equal(game.state.wave,wave); game.resume();
  until(game, () => game.enemies.length >= 3);
  game.enemies.slice(0,3).forEach(e => e.x = 245); game.tick(0.1); assert.equal(game.state.status,'lost');
});
test('adaptive weighting favors mistakes and slow keys without excluding familiar keys', () => {
  const profile: PracticeProfile = { F:{correct:10,errors:0,firstMs:700,chainMs:400}, J:{correct:3,errors:8,firstMs:5000,chainMs:2500} };
  assert.ok(practiceWeight(profile.J) > practiceWeight(profile.F));
  const counts = { F:0, J:0 };
  for(let n=0;n<1000;n++) counts[practiceKey('FJ',profile,()=>n/1000) as 'F'|'J']++;
  assert.ok(counts.J > counts.F * 3); assert.ok(counts.F > 0);
  const weight = practiceWeight(profile.J);
  for(let n=0;n<100;n++) recordPractice(profile,'J',true,500,n%2===0);
  assert.ok(practiceWeight(profile.J) < weight);
  assert.deepEqual(readPractice(JSON.stringify(profile)), profile);
  assert.deepEqual(readPractice('{bad'),{});
  assert.deepEqual(readPractice('{"F":{"correct":-1}}'),{});
});
test('endless excludes entry waits and pauses from response time and isolates course behavior', () => {
  const game = new GardenGame(()=>0); game.startEndless('F');
  game.tick(5); game.input('F'); assert.deepEqual(game.practiceProfile,{});
  until(game,()=>game.target()!==null); game.pause(); game.tick(100); game.resume(); game.tick(0.5); game.input('F');
  assert.ok(game.practiceProfile.F.firstMs >= 499 && game.practiceProfile.F.firstMs <= 601);
  const profile = structuredClone(game.practiceProfile);
  game.startLesson(1); game.startPractice(); for(const k of 'FJFJ') game.input(k); game.beginLessonBattle();
  until(game,()=>game.target()!==null); game.input('Z'); game.input(game.target()!.word);
  assert.deepEqual(game.practiceProfile,profile); assert.equal(game.state.total,11);
  game.startEndless('F',profile); assert.equal(game.state.wave,0); assert.equal(game.state.score,0); assert.equal(game.state.lessonId,undefined);
});

test('endless adds flag leaders and breakable doors without changing normal courses', () => {
  const game = new GardenGame(()=>0.4); game.startEndless('FDJK');
  const seen = new Set<number>(); const kinds = new Set<string>(); const leaders: string[] = [];
  until(game,()=> {
    for(const enemy of game.enemies) if(!seen.has(enemy.id)) {
      seen.add(enemy.id); kinds.add(enemy.kind ?? 'regular');
      if(enemy.kind === 'flag') leaders.push(enemy.word);
      if(enemy.kind === 'door') {
        assert.ok(game.state.wave >= 3); assert.equal(enemy.maxHp,6); assert.equal(armorStage(enemy),'intact');
        assert.equal(armorStage({...enemy,hp:3}),'damaged'); assert.equal(armorStage({...enemy,hp:1}),'broken');
      }
    }
    const target=game.target(); if(target) game.input(target.word[target.progress]);
    return game.state.wave >= 5;
  },400);
  assert.ok(kinds.has('flag') && kinds.has('door')); assert.equal(leaders.length,4);
  const normal=lessonBattle(10); normal.tick(20); assert.ok(normal.enemies.every(e=>!e.kind));
});
test('Keybr-inspired plan unlocks keys by mastery and focuses a weak included key', () => {
  const allowed='ASDFGHJKL; '; const profile: PracticeProfile={};
  let plan=makePracticePlan(allowed,profile); assert.equal(plan.keys.length,6); assert.ok(plan.focus && plan.keys.includes(plan.focus));
  for(const key of plan.keys) for(let i=0;i<12;i++) recordPractice(profile,key,true,500,true);
  plan=makePracticePlan(allowed,profile); assert.equal(plan.keys.length,7); assert.equal(plan.focus,plan.keys[6]);
  profile.F.firstMs=5000; profile.F.correct=10;
  assert.ok(keyConfidence(profile.F)<1); assert.equal(makePracticePlan(allowed,profile).keys.length,7);
  assert.deepEqual(makePracticePlan('FJ',{}),{keys:'FJ',focus:'F'});
});
test('focused generation keeps exact health length, allowed keys and natural words when possible', () => {
  const plan={keys:'CATS',focus:'C'};
  assert.equal(practiceWord(4,plan,{},()=>0),'CATS');
  for(const length of [1,2,4,6]) {
    const word=practiceWord(length,{keys:'FJ',focus:'J'},{},()=>0);
    assert.equal(word.length,length); assert.ok(word.includes('J')); assert.ok([...word].every(k=>'FJ'.includes(k)));
  }
  assert.equal(practiceWord(2,{keys:'F ',focus:' '},{},()=>0).length,2);
});

import { arrangeLabels } from './label-layout';
test('offscreen labels never stack against the visible right edge', () => {
  const result=arrangeLabels([{id:1,x:950,y:100,width:174,height:76},{id:2,x:1080,y:100,width:174,height:76}],1);
  assert.equal(result.get(1)!.visible,true); assert.equal(result.get(2)!.visible,false);
  assert.ok(result.get(1)!.x+87 <= layout.homeX+layout.width-8);
});
test('current target wins overlaps and hidden labels return when space opens', () => {
  const boxes=[{id:1,x:700,y:100,width:174,height:76},{id:2,x:815,y:100,width:174,height:76}];
  let result=arrangeLabels(boxes,1); assert.equal(result.get(1)!.visible,true); assert.equal(result.get(2)!.visible,false);
  result=arrangeLabels(boxes,2); assert.equal(result.get(2)!.visible,true); assert.equal(result.get(1)!.visible,false);
  boxes[0].x=500; result=arrangeLabels(boxes,1); assert.ok([...result.values()].every(x=>x.visible));
  boxes[0].x=700; boxes[1].y=250; result=arrangeLabels(boxes,1); assert.ok([...result.values()].every(x=>x.visible));
});

import { attachmentMatrix } from './reanim';
test('flag attachment follows hand rotation and scale relative to its original base pose', () => {
  const base: ReanimFrame=[10,20,30,30,0.8,0.8,0,1,'hand'];
  const child: ReanimFrame=[-30,-8,10,10,1,1,0,1,'flag'];
  const authored=frameMatrix(child), unchanged=attachmentMatrix(base,base,child);
  unchanged.forEach((v,i)=>assert.ok(Math.abs(v-authored[i])<1e-8));
  const current: ReanimFrame=[40,50,90,90,1.2,1.2,0,1,'hand'];
  const attached=attachmentMatrix(current,base,base), expected=frameMatrix(current);
  attached.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-8));
});

test('endless covers all generated lengths through ten with new original species', () => {
  const game=new GardenGame(()=>0.3);game.startEndless('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const lengths=new Set<number>();const kinds=new Set<string>();
  until(game,()=>{
    for(const enemy of game.enemies){
      lengths.add(enemy.maxHp);kinds.add(enemy.kind??'regular');assert.equal(enemy.maxHp,enemy.word.length);
      if(enemy.kind==='imp'){assert.ok(game.state.wave>=2);assert.equal(enemy.maxHp,3);}
      if(enemy.kind==='football'){assert.ok(game.state.wave>=4);assert.equal(enemy.maxHp,5);}
      if(enemy.kind==='giant'){assert.ok(game.state.wave>=6);assert.ok(enemy.maxHp>=7&&enemy.maxHp<=10);}
    }
    let target=game.target();while(target){game.input(target.word[target.progress]);target=game.target();}
    return game.state.wave>12;
  },900);
  for(let length=1;length<=10;length++)assert.ok(lengths.has(length),`Missing length ${length}`);
  for(const kind of ['imp','football','giant'])assert.ok(kinds.has(kind));
  for(const length of [3,5,7,8,9,10])assert.equal(practiceWord(length,{keys:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',focus:null},{},()=>0).length,length);
});

test('endless species move at different speeds in the field and can overtake', () => {
  const game=new GardenGame(()=>0); game.startEndless('FJ');game.state.phase='battle';
  game.enemies=[
    {id:1,x:700,lane:1,tier:1,word:'F',progress:0,hp:1,maxHp:1},
    {id:2,x:710,lane:1,tier:3,kind:'football',word:'FJFJF',progress:0,hp:5,maxHp:5},
    {id:3,x:700,lane:2,tier:3,kind:'giant',word:'FJFJFJF',progress:0,hp:7,maxHp:7},
  ];
  game.tick(2);
  const [normal,fast,slow]=game.enemies;
  assert.ok(fast.x<normal.x); assert.ok(slow.x>normal.x);
  assert.ok(Math.abs((710-fast.x)/(700-normal.x)-2)<0.001);
  assert.ok(Math.abs((700-slow.x)/(700-normal.x)-0.55)<0.001);
  normal.x=1200;fast.x=1200;game.tick(1);
  assert.ok(Math.abs((1200-fast.x)/(1200-normal.x)-2)<0.001);
});

test('endless keeps the displayed target through overtaking, errors and partial input', () => {
  const game=new GardenGame(()=>0);game.startEndless('FJ');game.state.phase='battle';
  const first={id:1,x:700,lane:1,tier:2,word:'FJ',progress:0,hp:2,maxHp:2};
  const fast={id:2,x:710,lane:1,tier:1,kind:'flag' as const,word:'JF',progress:0,hp:2,maxHp:2};
  game.enemies=[first,fast];assert.equal(game.target()?.id,1);
  fast.x=600;assert.equal(game.target()?.id,1);
  game.input('Z');assert.equal(game.target()?.id,1);
  game.input('F');assert.equal(game.target()?.id,1);assert.equal(first.progress,1);
  game.pause();game.resume();assert.equal(game.target()?.id,1);
  game.input('J');assert.equal(game.target()?.id,2);assert.equal(game.target()?.progress,0);
  fast.x=245;game.tick(0.1);assert.equal(game.target(),null);assert.equal(game.state.lives,2);
});

test('five-lane garden distributes endless arrivals across every lane', () => {
  const game=new GardenGame(()=>0);game.startEndless('FJ');
  until(game,()=>game.state.spawned>=5);
  assert.deepEqual([...new Set(game.enemies.map(e=>e.lane))].sort(),[0,1,2,3,4]);
  const beginner=lessonBattle(1);until(beginner,()=>beginner.target()!==null);
  assert.equal(beginner.target()!.lane,2);
});

test('endless drops items, first number picks up and second number uses at locked target', () => {
  const game=new GardenGame(()=>0);game.startEndless('FJ');game.state.phase='battle';
  game.enemies=[{id:1,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
  game.input('F');assert.equal(game.itemDrops.length,1);assert.equal(game.itemDrops[0].power,'cherry');
  game.input('1');assert.equal(game.powers.cherry,1);assert.equal(game.itemDrops.length,0);
  game.input('1');assert.equal(game.powers.cherry,1,'no target preserves item');
  game.enemies=[{id:2,x:700,lane:2,tier:1,word:'J',progress:0,hp:1,maxHp:1},{id:3,x:740,lane:3,tier:1,word:'F',progress:0,hp:1,maxHp:1},{id:4,x:750,lane:0,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
  game.target();const correct=game.state.correct;game.input('1');assert.equal(game.enemies.length,3);game.tick(powerWarmup.cherry+.05);
  assert.equal(game.powers.cherry,0);assert.deepEqual(game.enemies.map(e=>e.id),[4]);assert.equal(game.state.correct,correct);assert.equal(game.state.errors,0);assert.equal(game.itemDrops.length,0,'power kills do not chain drops');
});
test('pepper follows locked lane and doom has larger area without hitting offscreen enemies', () => {
  for(const power of ['pepper','doom'] as const){
    const game=new GardenGame(()=>0.8);game.startEndless();game.state.phase='battle';
    game.enemies=[{id:1,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1},{id:2,x:900,lane:2,tier:1,word:'J',progress:0,hp:1,maxHp:1},{id:3,x:720,lane:0,tier:1,word:'J',progress:0,hp:1,maxHp:1},{id:4,x:1080,lane:2,tier:1,word:'J',progress:0,hp:1,maxHp:1}];
    game.target();game.enemies[2].x=650;game.powers[power]=1;game.usePower(power);game.tick(powerWarmup[power]+.05);
    assert.deepEqual(game.enemies.map(e=>e.id),power==='pepper'?[3,4]:[4]);
  }
});
test('ice freezes motion for six active seconds and pause freezes its timer', () => {
  const game=new GardenGame(()=>0.8);game.startEndless();game.state.phase='battle';
  const enemy={id:1,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1};game.enemies=[enemy];game.powers.ice=1;
  game.input('3');assert.ok(!game.isFrozen(enemy));game.tick(powerWarmup.ice+.05);const frozenX=enemy.x;game.tick(2);assert.equal(enemy.x,frozenX);assert.ok(game.isFrozen(enemy));
  game.pause();game.tick(30);game.input('4');assert.equal(enemy.x,frozenX);game.resume();game.tick(3);assert.ok(game.isFrozen(enemy));game.tick(1.1);assert.ok(!game.isFrozen(enemy));assert.ok(enemy.x<700);
  game.startLesson(1);assert.deepEqual(game.powers,{cherry:0,pepper:0,ice:0,doom:0});assert.deepEqual(game.itemDrops,[]);
});
test('items cannot be picked or cast while paused or in normal mode', () => {
  const game=new GardenGame(()=>0);game.startEndless();game.itemDrops=[{id:1,power:'ice',x:700,lane:2}];game.pause();game.input('3');assert.equal(game.powers.ice,0);assert.equal(game.itemDrops.length,1);
  game.start('letters');game.input('1');assert.equal(game.state.errors,0);assert.equal(game.itemDrops.length,0);
});

test('power windup pauses and restart cancels pending explosions', () => {
  const game=new GardenGame(()=>0.8);game.startEndless();game.state.phase='battle';
  game.enemies=[{id:1,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
  game.powers.doom=1;game.usePower('doom');game.tick(.2);game.pause();game.tick(20);
  assert.equal(game.enemies.length,1);game.resume();game.tick(powerWarmup.doom);
  assert.equal(game.enemies.length,0);
  game.enemies=[{id:2,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
  game.powers.cherry=1;game.usePower('cherry');game.startEndless();game.state.phase='battle';
  game.enemies=[{id:3,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
  game.tick(powerWarmup.cherry+.1);assert.equal(game.enemies[0].id,3);
});

test('held powers cannot drop again until used, and ground drops stay unique', () => {
  for (const [index,power] of (['cherry','pepper','ice','doom'] as const).entries()) {
    let rolls:number[]=[];
    const game=new GardenGame(()=>rolls.shift()??0);
    game.startEndless();game.state.phase='battle';
    let id=0;
    const enemy=()=>({id:++id,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1});
    const kill=()=>{rolls=[0,0,(index+.1)/4];game.enemies=[enemy()];game.input('F');};
    kill();assert.equal(game.itemDrops[0]?.power,power);
    kill();assert.equal(game.itemDrops.length,1,'uncollected card cannot duplicate');
    game.usePower(power);assert.equal(game.powers[power],1);
    kill();assert.equal(game.itemDrops.length,0,'held card cannot duplicate');
    game.enemies=[enemy()];game.usePower(power);assert.equal(game.powers[power],0);
    kill();assert.equal(game.itemDrops[0]?.power,power,'used card can drop again');
  }
});

test('unlimited powers work repeatedly in normal and endless battles without drops', () => {
  for(const mode of ['letters','endless'] as const){
    const game=new GardenGame(()=>0);game.start(mode);game.state.phase='battle';
    game.itemDrops=[{id:1,power:'cherry',x:700,lane:2}];
    game.setUnlimitedPowers(true);assert.equal(game.itemDrops.length,0);
    game.enemies=[{id:1,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
    let casts=0;game.onEvent(e=>{if(e.type==='power')casts++;});
    for(const key of ['1','2','3','4','1','2','3','4'])game.input(key);
    assert.equal(casts,8);assert.equal(game.state.errors,0);
    game.pause();game.input('1');assert.equal(casts,8);game.resume();
    game.input('F');assert.equal(game.itemDrops.length,0);
    game.setUnlimitedPowers(false);
    game.enemies=[{id:2,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
    game.input('1');assert.equal(casts,8,'disabling does not grant inventory');
    game.input('F');assert.equal(game.itemDrops.length,mode==='endless'?1:0);
  }
});

test('unlimited power final kill completes a normal level', () => {
  const game=new GardenGame(()=>.8);game.start('letters');game.state.phase='battle';
  game.state.spawned=game.state.total;game.state.pending=0;game.state.wave=game.state.totalWaves;
  game.enemies=[{id:1,x:700,lane:2,tier:1,word:'F',progress:0,hp:1,maxHp:1}];
  game.setUnlimitedPowers(true);game.input('1');game.tick(powerWarmup.cherry+.1);
  assert.equal(game.state.status,'won');assert.equal(game.enemies.length,0);
});

test('individual zombie voice timers select ordinary, brains and giant pools', () => {
  const clock=createVoiceClock(false,()=>0);
  assert.equal(tickVoice(clock,2,1,false,()=>0),null);
  assert.ok(groans.includes(tickVoice(clock,1,1,false,()=>0)!));
  assert.equal(clock.remaining,5);
  const variant={remaining:0,variant:true};let rolls=[0,0,.99];
  assert.equal(tickVoice(variant,.1,1,false,()=>rolls.shift()!), 'sukhbir6');
  assert.ok(lowGroans.includes(tickVoice({remaining:0,variant:true},.1,1,true,()=>0)!));
  for(const count of [2,4]){let values=[0,.3,0];const voice=tickVoice({remaining:0,variant:false},.1,count,false,()=>values.shift()!);assert.equal(voice!==null,count===2);}
});
