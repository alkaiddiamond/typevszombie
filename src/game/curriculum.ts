export interface Lesson {
  id: number; title: string; keys: string; newKeys: string; demo: string; practice: string;
  instruction: string; returnTip: string; maxTier: 1 | 2 | 3; lanes: number;
  waves: number[]; speed: number; entryGap: number; stationary?: boolean;
}
export const lessons: Lesson[] = [
  { id: 1, title: '找到 F 和 J', keys: 'FJ', newKeys: 'FJ', demo: 'FJ', practice: 'FJFJ', instruction: '左手食指放在 F，右手食指放在 J。摸一摸，两个按键都有小凸起。', returnTip: '轻轻按下，再松开。食指留在 F 和 J 上。', maxTier: 1, lanes: 1, waves: [3, 4, 4], speed: 8, entryGap: 3.2 },
  { id: 2, title: '左右手接力', keys: 'FJ', newKeys: '', demo: 'FJ', practice: 'FJJF', instruction: '看清顺序：F 用左手食指，J 用右手食指。路障僵尸需要连续输入两个字母。', returnTip: '一次按一个键，按完松开，再按下一个。', maxTier: 2, lanes: 1, waves: [3, 4, 5], speed: 8, entryGap: 3 },
  { id: 3, title: '中指找 D 和 K', keys: 'FDJK', newKeys: 'DK', demo: 'DK', practice: 'DKDK', instruction: '食指留在 F 和 J，把左手中指放到 D，右手中指放到 K。', returnTip: '中指负责 D 和 K，食指仍然守在 F 和 J。', maxTier: 1, lanes: 1, waves: [3, 4, 4], speed: 8, entryGap: 3.2 },
  { id: 4, title: '四键小队', keys: 'FDJK', newKeys: '', demo: 'FDJK', practice: 'FDJK', instruction: '食指管 F、J，中指管 D、K。看字母，让对应的手指来帮忙。', returnTip: '两只手轮流配合，不用急着抢速度。', maxTier: 2, lanes: 5, waves: [3, 4, 5], speed: 9, entryGap: 2.8 },
  { id: 5, title: '静止靶小练场', keys: 'FDJK', newKeys: '', demo: 'FDJK', practice: 'FDJK', instruction: '今天的僵尸不会往前走。铁桶僵尸有四个字母，按顺序完成就能消灭！', returnTip: '先看清整组，再一个字母一个字母地按。', maxTier: 3, lanes: 5, waves: [3, 4, 5], speed: 0, entryGap: 2.6, stationary: true },
  { id: 6, title: '无名指找 S 和 L', keys: 'SDFJKL', newKeys: 'SL', demo: 'SL', practice: 'SLSL', instruction: '左手无名指负责 S，右手无名指负责 L。其他手指继续放在熟悉的位置。', returnTip: '从食指开始排好队：左手 F、D、S，右手 J、K、L。', maxTier: 2, lanes: 5, waves: [3, 4, 5], speed: 8, entryGap: 3 },
  { id: 7, title: '小指也来帮忙', keys: 'ASDFJKL;', newKeys: 'A;', demo: 'A;', practice: 'A;A;', instruction: '左手小指负责 A，右手小指负责分号 ;。切换到英文输入法，轻轻按一下。', returnTip: '四个手指排好队：左手 A S D F，右手 J K L 分号。', maxTier: 2, lanes: 5, waves: [3, 4, 5], speed: 8, entryGap: 3 },
  { id: 8, title: '食指伸伸手', keys: 'ASDFGHJKL;', newKeys: 'GH', demo: 'FGFJHJ', practice: 'FGJH', instruction: '左手食指从 F 向右找 G，右手食指从 J 向左找 H。', returnTip: '按完 G 回到 F，按完 H 回到 J。食指回家，再准备下一次。', maxTier: 3, lanes: 5, waves: [3, 4, 5], speed: 8, entryGap: 3 },
  { id: 9, title: '空格小桥', keys: 'ASDFGHJKL; ', newKeys: ' ', demo: 'F J ', practice: 'F J ', instruction: '用拇指轻按长长的空格键。字母之间出现“空格”标记时，按一下就好。', returnTip: '按完空格，拇指放松；其他手指留在基本键位。', maxTier: 3, lanes: 5, waves: [3, 4, 5], speed: 8, entryGap: 3 },
  { id: 10, title: '基本键位保卫战', keys: 'ASDFGHJKL; ', newKeys: '', demo: 'FJGH', practice: 'ASDFJKL;GH ', instruction: '你已经认识基本键位和空格了！这次一起用起来，守护完整的花园。', returnTip: '正确比快速更重要。按完后，让手指回到熟悉的位置。', maxTier: 3, lanes: 5, waves: [3, 4, 5, 6], speed: 10, entryGap: 2.6 },
];
export function lessonAt(id: number) { return lessons[Math.max(0, Math.min(lessons.length - 1, Number.isFinite(id) ? Math.floor(id) - 1 : 0))]; }
export function keyLabel(key: string) { return key === ' ' ? '空格' : key === ';' ? '分号 ;' : key; }
export function displaySequence(sequence: string) { return sequence.replaceAll(' ', '␣'); }
export interface KeyStat { correct: number; errors: number; responseMs: number; samples: number }
export function weakKeys(stats: Record<string, KeyStat>, allowed: string): string[] {
  return Object.entries(stats).filter(([key, s]) => allowed.includes(key) && s.errors > 0)
    .sort(([, a], [, b]) => b.errors / (b.correct + b.errors) - a.errors / (a.correct + a.errors)).slice(0, 3).map(([key]) => key);
}
export interface CourseProgress { completed: number[]; results: Record<string, { score: number; accuracy: number; stats: Record<string, KeyStat> }> }
export function parseProgress(value: string | null): CourseProgress {
  try {
    const raw = JSON.parse(value || '{}');
    const completed = Array.isArray(raw.completed) ? [...new Set<number>(raw.completed.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 10))].sort((a, b) => a - b) : [];
    const results: CourseProgress['results'] = {};
    for (const id of completed) {
      const result = raw.results?.[id];
      if (result && Number.isFinite(result.score) && Number.isFinite(result.accuracy)) results[id] = { score: Math.max(0, result.score), accuracy: Math.max(0, Math.min(100, result.accuracy)), stats: result.stats && typeof result.stats === 'object' ? result.stats : {} };
    }
    return { completed, results };
  } catch { return { completed: [], results: {} }; }
}
export function unlockedLesson(progress: CourseProgress) { return lessons.find(l => !progress.completed.includes(l.id))?.id ?? 10; }
