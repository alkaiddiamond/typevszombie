export const groans=['groan','groan2','groan3','groan4','groan5','groan6'];
export const brains=[...groans,'sukhbir4','sukhbir5','sukhbir6'];
export const lowGroans=['lowgroan','lowgroan2'];
export const voiceSounds=[...brains,...lowGroans];
export interface VoiceClock { remaining:number; variant:boolean }
export function createVoiceClock(variant:boolean,random=Math.random):VoiceClock {
  return {remaining:3+random(),variant};
}
export function tickVoice(clock:VoiceClock,seconds:number,count:number,giant:boolean,random=Math.random):string|null {
  clock.remaining-=seconds;
  if(clock.remaining>0)return null;
  clock.remaining=5+random()*10;
  if(count<1||random()>=1/count)return null;
  const pool=giant?lowGroans:clock.variant?brains:groans;
  return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
}
