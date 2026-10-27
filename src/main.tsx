import { powerTypes, powerInfo } from './game/powers';
import { readPractice } from './game/adaptive';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import { GardenGame, defaults, lootNames, type Mode, type Settings, type Snapshot } from './game/model';
import { GardenScene } from './game/scene';
import { layout } from './game/layout';
import { lessons, lessonAt, keyLabel, displaySequence, parseProgress, unlockedLesson, type CourseProgress } from './game/curriculum';
import './style.css';

const model = new GardenGame();
function readSaved(): { settings: Settings; best: number; lastMode: Mode } {
  try {
    const saved = JSON.parse(localStorage.getItem('typing-garden-v1') || '{}');
    const settings = { ...defaults };
    for (const key of ['keyboard', 'hands', 'sound', 'music', 'unlimitedPowers'] as const) if (typeof saved.settings?.[key] === 'boolean') settings[key] = saved.settings[key];
    if (typeof saved.settings?.musicVolume === 'number' && Number.isFinite(saved.settings.musicVolume)) settings.musicVolume = Math.max(0, Math.min(1, saved.settings.musicVolume));
    if (['slow', 'normal', 'fast'].includes(saved.settings?.speed)) settings.speed = saved.settings.speed;
    return { settings, lastMode: saved.lastMode === 'endless' ? 'endless' : saved.lastMode === 'words' ? 'words' : 'letters', best: typeof saved.best === 'number' && Number.isFinite(saved.best) ? saved.best : 0 };
  } catch { return { settings: { ...defaults }, best: 0, lastMode: 'letters' }; }
}
const saved = readSaved(); model.settings = saved.settings; model.state.mode = saved.lastMode;
const fingers = ['左手小指', '左手无名指', '左手中指', '左手食指', '右手食指', '右手中指', '右手无名指', '右手小指', '拇指'];
function fingerFor(key: string) { if (key === ' ') return 8; return ['QAZ', 'WSX', 'EDC', 'RFVTGB', 'YUHJNM', 'IK,', 'OL.', "P;[]'\\/"].findIndex(keys => keys.includes(key) && key !== ''); }
const keyboardRows = ['QWERTYUIOP[]\\', "ASDFGHJKL;'", 'ZXCVBNM,./'];
const punctuationLabels: Record<string, string> = { '[': '{', ']': '}', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '\\': '|' };
const currency = ['copper', 'silver', 'gold', 'diamond'] as const;
const icons = { copper: 'coin_gold_dollar', silver: 'coin_silver_dollar', gold: 'coin_gold_dollar', diamond: 'Diamond' };

function Hands({ active }: { active: number }) {
  const digits = [
    { path: 'M29 99 L26 73 C25 60 40 56 44 70 L49 98 Q40 107 29 99Z', nailX: 35, nailY: 72, rotation: -9 },
    { path: 'M50 91 L46 48 C45 34 62 31 65 46 L68 89 Q59 97 50 91Z', nailX: 56, nailY: 47, rotation: -4 },
    { path: 'M72 87 L70 33 C70 18 88 18 89 33 L90 87 Q81 94 72 87Z', nailX: 80, nailY: 33, rotation: 0 },
    { path: 'M94 91 L95 45 C96 31 112 33 112 47 L112 100 Q100 102 94 91Z', nailX: 104, nailY: 46, rotation: 3 },
  ];
  const outline = 'M51 158 C48 147 37 136 32 121 C29 112 27 96 24 75 C22 60 28 55 35 56 C44 56 45 65 47 75 L49 87 L44 48 C42 32 48 27 56 28 C64 28 67 35 68 46 L70 81 L68 33 C67 17 73 12 80 12 C89 12 92 19 92 33 L93 82 L93 46 C93 31 99 27 106 29 C114 30 117 38 116 49 L114 104 C116 103 119 98 123 91 L135 74 C141 65 151 66 155 73 C159 80 154 86 151 92 L134 122 C128 133 116 141 113 158 Z';
  return <div className="hands redesigned-hands" aria-label={active >= 0 ? `请使用${fingers[active]}` : '双手指法提示'}>
    {[false, true].map(right => <svg key={String(right)} viewBox="0 0 180 190" role="img" aria-label={`${right ? '右手' : '左手'}手背指法图`}>
      <g transform={right ? 'translate(180 0) scale(-1 1)' : undefined} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="82" cy="165" rx="40" ry="6" fill="#31472c" opacity=".08" />
        <path d={outline} fill="#f3d0ad" stroke="#ae8064" strokeWidth="1.8" />
        <path d="M35 111 Q40 139 57 154 L106 154 Q110 139 126 125 Q105 142 80 139 Q51 139 35 111" fill="#d9aa88" opacity=".3" />
        {digits.map((digit, i) => {
          const selected = active === (right ? 7 - i : i);
          return <g key={i}>
            {selected && <path d={digit.path} fill="#f8d66a" stroke="#b68b29" strokeWidth="1.4" />}
            <rect x={digit.nailX - 5} y={digit.nailY - 7} width="10" height="13" rx="4.5" transform={`rotate(${digit.rotation} ${digit.nailX} ${digit.nailY})`} fill={selected ? '#fff5ca' : '#fff0df'} stroke={selected ? '#d3ac48' : '#ddb79a'} strokeWidth=".8" />
            {selected && <circle cx={digit.nailX} cy={digit.nailY + 21} r="3" fill="#87671f" />}
          </g>;
        })}
        {active === 8 && <path d="M117 106 L138 76 C143 69 151 71 152 77 Q154 81 148 90 L132 118 Q122 124 117 106Z" fill="#f8d66a" stroke="#b68b29" strokeWidth="1.4" />}
        <path d="M139 78 Q144 72 149 77 L143 87 Q139 89 135 85Z" fill={active === 8 ? '#fff5ca' : '#fff0df'} stroke="#ddb79a" strokeWidth=".8" />
        <path d="M48 91 L51 106 M70 87 L72 104 M93 91 L94 105 M113 108 Q111 121 105 128" fill="none" stroke="#c69b7c" strokeWidth="1.3" />
        <path d="M49 152 Q81 158 115 152 L115 168 Q83 175 49 168Z" fill={right ? '#739080' : '#7f9560'} stroke="#536e4c" strokeWidth="1.5" />
        <path d="M54 157 Q82 162 110 157" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="2" />
      </g>
      <text x="82" y="187" textAnchor="middle" fill="#64735d" fontSize="12" fontWeight="600">{right ? '右手' : '左手'}</text>
    </svg>)}
  </div>;
}

function App() {
  const [state, setState] = useState<Snapshot>(model.snapshot());
  const [settings, setSettings] = useState<Settings>(saved.settings);
  const [best, setBest] = useState(saved.best);
  const [ready, setReady] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [modal, setModal] = useState<'menu' | 'settings' | null>(null);
  const [mode, setMode] = useState<Mode>(saved.lastMode);
  const [inputWarning, setInputWarning] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnToPlay = useRef(false);
  const [course, setCourse] = useState<CourseProgress>(() => { try { return parseProgress(localStorage.getItem('typing-garden-course-v1')); } catch { return parseProgress(null); } });
  const [endlessRange, setEndlessRange] = useState('learned');
  const learnedKeys = lessonAt(Math.max(1, ...course.completed)).keys;
  const [demoIndex, setDemoIndex] = useState(0);
  const recorded = useRef(false);
  const lesson = state.lessonId ? lessonAt(state.lessonId) : null;
  const next = state.status === 'teaching' && state.tutorial === 'demo' && lesson ? lesson.demo[demoIndex % lesson.demo.length] : state.target?.word[state.target.progress] ?? '';
  const active = fingerFor(next);
  const accuracy = state.correct + state.errors ? Math.round(state.correct / (state.correct + state.errors) * 100) : 100;

  useEffect(() => { if (state.status !== 'teaching' || state.tutorial !== 'demo' || modal) return; const timer = window.setInterval(() => setDemoIndex(i => i + 1), 1400); return () => clearInterval(timer); }, [state.status, state.tutorial, modal]);
  useEffect(() => {
    if (state.status !== 'won' || !state.lessonId || recorded.current) return;
    recorded.current = true;
    setCourse(old => { const updated = { completed: [...new Set([...old.completed, state.lessonId!])], results: { ...old.results, [state.lessonId!]: { score: state.score, accuracy, stats: structuredClone(model.keyStats) } } }; try { localStorage.setItem('typing-garden-course-v1', JSON.stringify(updated)); } catch {} return updated; });
  }, [state.status, state.lessonId, state.score, accuracy]);
  useEffect(() => { if (state.mode === 'endless') { try { localStorage.setItem('typing-garden-endless-v1', JSON.stringify(model.practiceProfile)); } catch {} } }, [state.mode, state.correct, state.errors]);
  useEffect(() => model.subscribe(() => setState(model.snapshot())), []);
  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current, width: layout.width, height: layout.height, backgroundColor: '#526b32', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true }, scene: new GardenScene(model, () => setReady(true), () => setAssetError(true)), audio: { disableWebAudio: false } });
    // Show more of the panorama on wide battlefields instead of letterboxing.
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      // refresh() measures the parent only after calculating FIT. Measure first
      // when the HUD changes the parent height without a window resize.
      game.scale.getParentBounds();
      const worldWidth = layout.height * width / height;
      if (Math.abs(game.scale.gameSize.width - worldWidth) > 0.01) {
        game.scale.setGameSize(worldWidth, layout.height);
      } else game.scale.refresh();
    });
    resizeObserver.observe(host.current);
    return () => { resizeObserver.disconnect(); game.destroy(true); };
  }, []);
  useEffect(() => {
    model.settings = { ...settings };
    model.setUnlimitedPowers(settings.unlimitedPowers);
    model.notify();
    try { localStorage.setItem('typing-garden-v1', JSON.stringify({ settings, best, lastMode: state.mode })); } catch { /* Private mode can disable storage. */ }
  }, [settings, best, state.mode]);
  useEffect(() => { if (state.score > best) setBest(state.score); }, [state.score, best]);
  useEffect(() => {
    const press = (e: KeyboardEvent) => {
      if (!modal && model.state.status === 'won' && model.state.resultReady && model.state.lessonId !== 10) {
        if (e.repeat) return;
        e.preventDefault();
        if (model.state.lessonId) startCourse(model.state.lessonId + 1);
        else start(model.state.mode, model.state.level + 1);
        return;
      }
      if (!modal && model.state.status === 'teaching' && (model.state.tutorial === 'demo' || model.state.tutorial === 'ready')) {
        if (e.repeat) return;
        e.preventDefault();
        setInputWarning(false);
        if (model.state.tutorial === 'demo') model.startPractice();
        else model.beginLessonBattle();
        return;
      }
      if (e.key === 'Escape' && !modal) { e.preventDefault(); model.state.status === 'paused' ? model.resume() : model.pause(); return; }
      if (modal || !['playing', 'teaching'].includes(model.state.status) || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (e.isComposing || e.key === 'Process') { setInputWarning(true); return; }
      if (/^[a-z;1-4 ]$/i.test(e.key)) { e.preventDefault(); setInputWarning(false); model.input(e.key); }
    };
    const pause = () => model.pause();
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('keydown', press); window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', press); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility); };
  }, [modal]);
  useEffect(() => { if (modal) dialog.current?.showModal(); else dialog.current?.close(); }, [modal]);
  useEffect(() => {
    // Optional browser agent access shares the same model as the visible game.
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options: object) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try { void Promise.resolve(context.registerTool({ name: 'read_garden_game', description: 'Read the current typing game status and target.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => model.snapshot() }, { signal: controller.signal })).catch(() => {}); } catch { /* Optional API. */ }
    return () => controller.abort();
  }, []);
  function openModal(value: 'menu' | 'settings') { returnToPlay.current = model.state.status === 'playing'; model.pause(); setModal(value); }
  function closeModal() { setModal(null); if (returnToPlay.current) model.resume(); }
  function start(selected = mode, level = 1) { if (selected === 'endless') { startEndless(model.endlessKeys); return; } setModal(null); setMode(selected); model.start(selected, level); }
  function startCourse(id = unlockedLesson(course)) { setModal(null); recorded.current = false; setDemoIndex(0); model.startLesson(id); }
  function startEndless(keys = endlessRange === 'all' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ; ' : endlessRange === 'home' ? lessonAt(10).keys : learnedKeys) {
    let profile = model.practiceProfile; try { profile = readPractice(localStorage.getItem('typing-garden-endless-v1')); } catch {}
    setModal(null); setMode('endless'); model.startEndless(keys, profile);
  }
  function toggle(key: 'keyboard' | 'hands' | 'sound' | 'music' | 'unlimitedPowers') { setSettings(s => ({ ...s, [key]: !s[key] })); }
  const gameOver = (state.status === 'won' && state.resultReady) || state.status === 'lost';

  return <main className="app">
    <header className="header">
      <div className="brand"><span className="brand-key">F<span>J</span></span><div><h1>键盘保卫花园</h1><span className="brand-sub">小小手指，大大能量</span></div></div>
      <div className="level-block"><span className="eyebrow">{state.mode === 'endless' ? '无尽模式' : lesson ? `第 1-${lesson.id} 关` : `第 ${String(state.level).padStart(2, '0')} 关`}</span><strong>{lesson?.title ?? (state.mode === 'endless' ? '薄弱键强化' : state.mode === 'letters' ? '字母小花园' : '单词探险队')}</strong></div>
      <div className="score-block"><span className="eyebrow">本局积分</span><strong>{state.score.toLocaleString()}<small>分</small></strong></div>
      <nav aria-label="游戏控制"><button className="icon-button" onClick={() => model.state.status === 'playing' ? model.pause() : model.resume()} disabled={!['playing', 'paused'].includes(state.status)} aria-label={state.status === 'paused' ? '继续游戏' : '暂停游戏'}>{state.status === 'paused' ? '▶' : 'Ⅱ'}</button><button onClick={() => openModal('menu')}>☰ <span>菜单</span></button><button onClick={() => openModal('settings')}>⚙ <span>设置</span></button></nav>
    </header>

    <section className="garden-shell" aria-label="打字游戏区域">
      <div className="garden-toolbar"><div className="lives" aria-label={`剩余 ${state.lives} 次守护机会`}><span>守护机会</span><b>{'♥'.repeat(state.lives)}<i>{'♡'.repeat(3 - state.lives)}</i></b></div><div className="wave"><span>{state.mode === 'endless' ? `第 ${state.wave || 1} 波 · 无尽` : `第 ${state.wave || 1} / ${state.totalWaves} 波`}</span><div className="progress-track"><div style={{ width: `${(state.spawned - model.enemies.length) / Math.max(1, state.total) * 100}%` }} /></div><b>{state.spawned - model.enemies.length} / {state.total}</b></div><div className="loot-bar">{currency.map(c => <span key={c} title={lootNames[c]}><img className={c} src={`/game/${icons[c]}.png`} alt={lootNames[c]} />{state.loot[c]}</span>)}</div></div>
      <div className={`game-stage ${(state.mode === 'endless' || settings.unlimitedPowers) ? 'has-seed-bank' : ''}`}><div ref={host} className="canvas-host" />
      {(state.mode === 'endless' || settings.unlimitedPowers) && <div className="power-bar" aria-label="道具栏"><span className="seed-bank-label">道具</span>{powerTypes.map(power=>{
        const owned=settings.unlimitedPowers||!!state.powers?.[power];const dropped=state.itemDrops?.some(d=>d.power===power);
        return <div className={`power-slot ${owned?'owned':''} ${dropped&&!owned?'waiting':''}`} key={power} title={`${powerInfo[power].name}：${powerInfo[power].description}`}>
          <img src={`/game/power-${power}.png?v=classic-complete-3`} alt={powerInfo[power].name}/><div className="seed-action"><kbd>{powerInfo[power].key}</kbd><small>{settings.unlimitedPowers?'∞ 释放':owned?'释放':dropped?'拾取':'未获得'}</small></div>
        </div>;
      })}</div>}
        {state.status === 'ready' && <div className="overlay start-overlay"><div className="start-card"><span className="pill">准备好你的小手指</span><h2>一起守护<br /><em>我们的花园！</em></h2><p>看僵尸头上的字母，按下键盘消灭它。<br />手指提示会陪你一起练习。</p><p className="course-intro">{state.mode === 'endless' ? <>无尽模式 · 薄弱键强化<br />持续迎战，按自己的节奏练习</> : <>第一大关 · 基本键位训练<br />10 个小关，从 F 和 J 开始</>}</p><button className="primary start" disabled={!ready || assetError} onClick={() => state.mode === 'endless' ? startEndless() : startCourse()}>{assetError ? '素材加载失败，请刷新重试' : ready ? state.mode === 'endless' ? '开始新的无尽挑战 ▶' : `开始第 1-${unlockedLesson(course)} 关 ▶` : '花园准备中…'}</button><button className="text-button" onClick={() => openModal('menu')}>查看关卡 · 已完成 {course.completed.length}/10</button><small>使用电脑键盘 · 英文输入法 · Esc 暂停</small></div></div>}
        {state.status === 'teaching' && lesson && <div className={`tutorial-panel ${state.tutorial === 'practice' ? 'practice-panel' : ''}`}><span className="pill">第 1-{lesson.id} 关 · {state.tutorial === 'demo' ? '看一看' : state.tutorial === 'practice' ? '试一试' : '准备出发'}</span><h2>{lesson.title}</h2><p>{state.tutorial === 'demo' ? lesson.instruction : lesson.returnTip}</p>{state.tutorial === 'demo' ? <><div className="demo-sequence">{lesson.demo.split('').map((k, i) => <span className={i === demoIndex % lesson.demo.length ? 'current' : ''} key={i}>{keyLabel(k)}</span>)}</div><div className="tutorial-hands"><Hands active={active} /><p>用{fingers[active]}按 {keyLabel(next)}</p></div><button className="primary" onClick={() => model.startPractice()}>按任意键继续</button></> : state.tutorial === 'practice' ? <><p>按下 <strong>{keyLabel(next)}</strong> · {(state.practiceIndex ?? 0) + 1}/{lesson.practice.length}</p><div className="tutorial-hands"><Hands active={active} /><p>用{fingers[active]}按 {keyLabel(next)}</p></div><small>僵尸站着等你，慢慢找到按键就好。</small></> : <><p>小手指准备好啦！这关共 {lesson.waves.length} 波，{lesson.waves.reduce((a,b) => a+b,0)} 只僵尸。</p><button className="primary" onClick={() => model.beginLessonBattle()}>按任意键继续</button><button className="text-button" onClick={() => model.startPractice()}>再试按一次</button></>}</div>}
        {state.status === 'paused' && !modal && <div className="overlay"><div className="pause-card"><span className="pill">{state.mode === 'endless' ? '无尽模式 · 已暂停' : '休息一下'}</span><h2>{state.mode === 'endless' ? '无尽挑战等你继续' : '花园在等你'}</h2>{state.mode === 'endless' ? <><p>{state.wave ? `当前第 ${state.wave} 波` : '准备迎接第 1 波'} · 积分 {state.score}<br />剩余 {state.lives} 次守护机会</p><p>继续后从当前进度接着玩。</p></> : <p>准备好了，就继续吧。</p>}<button className="primary" onClick={() => model.resume()}>{state.mode === 'endless' ? '继续无尽挑战 ▶' : '继续游戏 ▶'}</button><button className="text-button" onClick={() => openModal('menu')}>返回菜单</button></div></div>}
        {gameOver && <div className="overlay"><div className="pause-card result-card"><span className="pill">{state.status === 'won' ? '守护成功' : '下次一定可以'}</span><h2>{state.status === 'won' ? '花园守住啦！' : '再练习一次吧！'}</h2><div className="result-stats"><div><strong>{state.score}</strong><span>获得积分</span></div><div><strong>{accuracy}%</strong><span>输入准确率</span></div><div><strong>{state.kills}</strong><span>消灭僵尸</span></div></div>{state.mode === 'endless' && <p>到达第 {state.wave} 波 · 本次练习已记住，下次继续强化。</p>}<button className="primary" onClick={() => lesson ? state.status === 'won' && lesson.id === 10 ? openModal('menu') : startCourse(lesson.id + (state.status === 'won' ? 1 : 0)) : start(state.mode, state.status === 'won' ? state.level + 1 : state.level)}>{state.status === 'won' ? lesson?.id === 10 ? '第一大关完成！查看关卡' : '按任意键进入下一关' : '再试一次 ▶'}</button><button className="text-button" onClick={() => openModal('menu')}>选择关卡与练习</button></div></div>}
      </div>
      <div className="game-bottom"><span><i className="status-dot" />{inputWarning ? '请切换到英文输入法，再继续练习' : state.feedback}</span><span>击败 <b>{state.kills}</b> 只 <span className="separator">|</span> 准确率 <b>{accuracy}%</b></span></div>
    </section>

    <section className="coach" aria-label="键盘和手指提示">
      <div className="coach-top"><div><span className="coach-icon">⌨</span><strong>小手指训练营</strong><span className="coach-sub">找到按键，轻轻按一下</span></div><div className="coach-switches"><label><input type="checkbox" checked={settings.keyboard} onChange={() => toggle('keyboard')} />键盘提示</label><label><input type="checkbox" checked={settings.hands} onChange={() => toggle('hands')} />手指提示</label></div></div>
      <div className="coach-body">
        <div className="next-key"><span className="eyebrow">{state.status === 'playing' ? '下一个按键' : '准备好了吗'}</span><div className="key-preview">{keyLabel(next) || (state.status === 'ready' ? 'F' : '·')}</div><span>{active >= 0 ? fingers[active] : '食指找到 F 和 J'}</span>{state.target && state.target.word.length > 1 && <div className="word-progress">{state.target.word.split('').map((c, i) => <span key={i} className={i < state.target!.progress ? 'done' : i === state.target!.progress ? 'current' : ''}>{displaySequence(c)}</span>)}</div>}</div>
        {settings.keyboard && <div className="keyboard" aria-label="QWERTY 键盘提示">{keyboardRows.map((row, i) => <div className={`key-row row-${i}`} key={row}>{row.split('').map(key => <div className={`key ${next === key ? 'active' : ''} ${'FJ'.includes(key) ? 'home-key' : ''}`} key={key} aria-label={`${key}${next === key ? '，请按此键' : ''}`}>{key}{punctuationLabels[key] && <small className="punctuation-label">{punctuationLabels[key]}</small>}{'FJ'.includes(key) && <span className="bump" />}</div>)}{i === 1 && <div className="key function-key" aria-label="回车 Enter">Enter ↵</div>}{i === 2 && <div className="key function-key" aria-label="右 Shift">Shift ⇧</div>}</div>)}<div className={`space-key ${next === ' ' ? 'active' : ''}`}>Space</div></div>}
        {settings.hands && <Hands active={active} />}
        {!settings.keyboard && !settings.hands && <div className="hidden-guide">试着自己找到按键吧！<small>需要帮助时，可以随时打开提示。</small></div>}
      </div>
    </section>
    {state.mode === 'endless' && <div className="endless-guide"><strong>本波重点：{model.practicePlan.focus ? keyLabel(model.practicePlan.focus) : '综合巩固'}</strong><span>练习键位：{displaySequence(model.practicePlan.keys)}</span><span>小鬼 3 · 橄榄球 5 · 铁栅门 6 · 巨人 7–10 字符</span></div>}
    <div className="health-guide">普通僵尸 1 个字母 · 路障僵尸 2 个字母 · 铁桶僵尸 4 个字符<span>按顺序输入，全部完成就能消灭</span></div>
    <footer><span>每一次按对，都是一点点进步。</span><span>本机最高积分 <b>{best.toLocaleString()}</b></span></footer>
    <dialog ref={dialog} onCancel={(e) => { e.preventDefault(); closeModal(); }} className="settings-dialog"><div className="dialog-heading"><h2>{modal === 'settings' ? '花园设置' : '练习菜单'}</h2><button onClick={closeModal} aria-label="关闭">×</button></div>
      {modal === 'settings' && <div className="music-settings"><label className="setting-row">开启背景音乐<input type="checkbox" checked={settings.music} onChange={() => toggle('music')} /></label><label className="setting-row">音乐音量 <span className="volume-control"><input aria-label="音乐音量" type="range" min="0" max="100" value={Math.round(settings.musicVolume * 100)} onChange={e => setSettings(s => ({ ...s, musicVolume: Number(e.target.value) / 100 }))} /><output>{Math.round(settings.musicVolume * 100)}%</output></span></label></div>}
      {modal === 'settings' ? <><p>按自己的节奏慢慢练习。</p><label className="setting-row">僵尸移动速度<select value={settings.speed} onChange={e => setSettings(s => ({ ...s, speed: e.target.value as Settings['speed'] }))}><option value="slow">慢慢来</option><option value="normal">正常速度</option><option value="fast">挑战一下</option></select></label>{(['keyboard', 'hands', 'sound'] as const).map((key, i) => <label key={key} className="setting-row">{['显示键盘提示', '显示手指提示', '开启游戏音效'][i]}<input type="checkbox" checked={settings[key]} onChange={() => toggle(key)} /></label>)}<button className="primary" onClick={closeModal}>保存并返回</button></> : <><label className="setting-row">无限道具<input type="checkbox" checked={settings.unlimitedPowers} onChange={() => toggle('unlimitedPowers')} /></label><p>开启后，所有关卡可按 1–4 无限使用道具，不再掉落道具卡。</p>{state.status === 'paused' && state.mode === 'endless' && <><p>无尽模式已暂停 · 第 {state.wave || 1} 波 · {state.score} 分</p><button className="primary" onClick={() => { setModal(null); model.resume(); }}>继续当前无尽挑战 ▶</button><p>选择下方模式将开始新的一局。</p></>}<p>第一大关 · 基本键位训练（{course.completed.length}/10）</p><div className="lesson-grid">{lessons.map(l => <button key={l.id} disabled={!ready || assetError || l.id > unlockedLesson(course)} onClick={() => startCourse(l.id)}><strong>{course.completed.includes(l.id) ? '✓ ' : ''}1-{l.id}</strong><span>{l.title}</span><small>{displaySequence(l.keys)}</small></button>)}</div><p>无尽模式 · 8 种僵尸，1–10 字符<br />每波 8–24 只，逐步解锁选定范围内的按键。</p><label className="setting-row">练习范围<select value={endlessRange} onChange={e => setEndlessRange(e.target.value)}><option value="learned">已学键位：{displaySequence(learnedKeys)}</option><option value="home">基本键位与空格</option><option value="all">全部字母、分号与空格</option></select></label><button className="menu-choice" disabled={!ready || assetError} onClick={() => startEndless()}>∞ <strong>开始无尽模式</strong><span>持续出波，重点练习不熟悉的键 →</span></button><p>自由练习</p><button className="menu-choice" onClick={() => start('letters')}>Aa <strong>字母练习</strong><span>从基础键位开始 →</span></button><button className="menu-choice" onClick={() => start('words')}>ABC <strong>单词挑战</strong><span>一个字母一个字母完成 →</span></button><button className="text-button" onClick={closeModal}>返回花园</button></>}
    </dialog>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
