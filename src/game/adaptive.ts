export interface PracticeKey { correct: number; errors: number; firstMs: number; chainMs: number; bestConfidence?: number }
export type PracticeProfile = Record<string, PracticeKey>;
export function readPractice(value: string | null): PracticeProfile {
  try { const raw = JSON.parse(value || '{}'); const result: PracticeProfile = {};
    for (const [key, s] of Object.entries(raw) as [string, PracticeKey][]) {
      if (/^[A-Z; ]$/.test(key) && s && [s.correct, s.errors, s.firstMs, s.chainMs].every(n => Number.isFinite(n) && n >= 0)) result[key] = { correct:s.correct, errors:s.errors, firstMs:s.firstMs, chainMs:s.chainMs, ...(Number.isFinite(s.bestConfidence) && s.bestConfidence! >= 0 ? { bestConfidence:s.bestConfidence } : {}) };
    } return result;
  } catch { return {}; }
}
export function practiceWeight(s?: PracticeKey) {
  if (!s) return 1.5;
  const errors = s.errors / Math.max(1, s.correct + s.errors);
  const delay = Math.max(s.firstMs / 2200, s.chainMs / 1400);
  return 1 + Math.min(3, errors * 6) + Math.min(2, Math.max(0, delay - 1));
}
export function practiceKey(keys: string, profile: PracticeProfile, random: () => number): string {
  const weights = [...keys].map(k => practiceWeight(profile[k]));
  let value = random() * weights.reduce((a,b) => a+b,0);
  for (let i=0; i<keys.length; i++) { value -= weights[i]; if(value < 0) return keys[i]; }
  return keys[keys.length-1];
}
export function recordPractice(profile: PracticeProfile, key: string, correct: boolean, elapsed: number, first: boolean) {
  const s = profile[key] ??= { correct:0, errors:0, firstMs:0, chainMs:0 };
  // Decay attempt counts so recent improvement can reduce reinforcement.
  s.correct *= 0.97; s.errors *= 0.97;
  if (!correct) { s.errors++; return; }
  s.correct++;
  if (elapsed < 40 || elapsed > 12000) return;
  const field = first ? 'firstMs' : 'chainMs';
  s[field] = s[field] ? 0.9 * s[field] + 0.1 * elapsed : elapsed;
  s.bestConfidence = Math.max(s.bestConfidence ?? 0, keyConfidence(s));
}

// Keybr-inspired target-time confidence and focused-key curriculum.
// Independent game implementation: children get separate first/chain targets,
// accuracy gating, and fixed sequence lengths matching zombie health.
export interface PracticePlan { keys: string; focus: string | null }
export function keyConfidence(s?: PracticeKey): number {
  if (!s || s.correct < 5) return 0;
  const values = [s.firstMs > 0 ? 2200 / s.firstMs : null, s.chainMs > 0 ? 1400 / s.chainMs : null].filter((n): n is number => n !== null);
  if (!values.length) return 0;
  const accuracy = s.correct / Math.max(1, s.correct + s.errors);
  return Math.min(...values) * Math.min(1, accuracy / 0.95);
}
export function makePracticePlan(allowed: string, profile: PracticeProfile): PracticePlan {
  const order = [...'FJDKSLA;GH RUEITYOWNCVMBXPQZ'].filter(k => allowed.includes(k));
  const keys: string[] = [];
  for (const key of order) {
    if (keys.length < Math.min(6, order.length) || keys.every(k => (profile[k]?.bestConfidence ?? keyConfidence(profile[k])) >= 1)) keys.push(key);
    else break;
  }
  const weak = [...keys].filter(k => keyConfidence(profile[k]) < 1).sort((a,b) => keyConfidence(profile[a]) - keyConfidence(profile[b]) || (profile[a]?.correct ?? 0) + (profile[a]?.errors ?? 0) - (profile[b]?.correct ?? 0) - (profile[b]?.errors ?? 0));
  return { keys:keys.join(''), focus:weak[0] ?? null };
}
const shortWords = 'A I AN AS AT BE BY DO GO HE IF IN IS IT ME MY NO OF ON OR SO TO UP US WE ADD ALL AND ASK BAD BAG BED BIG BOX BUS CAN CAR CAT CUP DAY DID DOG DRY EAR EAT EGG END FAR FAT FED FEW FIT FIX FLY FOR FUN GET GOD GOT GUM HAD HAS HAT HER HID HIM HIS HIT HOT HOW ICE INK ITS JAM JAR JET JOB JOY KEY KID LEG LET LID LIE LIP LOG LOT LOW MAD MAN MAP MAY MET MIX MOP MUD NET NEW NOD NOT NOW NUT OFF OLD ONE OUR OUT OWL OWN PAN PAY PEN PET PIE PIG PIN POT PUT RAN RAT RED RID ROW RUB RUN SAD SAT SAW SAY SEA SEE SET SHE SHY SIT SIX SKY SON SUN TAP TEA TEN THE TIE TIP TOP TOY TRY TWO USE VAN WAR WAS WAY WEB WET WHO WHY WIN YES YET YOU ZOO ALSO AWAY BABY BACK BALL BAND BANK BARK BATH BEAR BELL BEST BIRD BLUE BOAT BOOK BOWL CAKE CALL CAME CARD CARS CATS CITY CLAP COLD COME COOK COOL DARK DAYS DEAR DESK DOOR DOWN DRAW DUCK EACH EASY FACE FALL FARM FAST FEED FEEL FEET FELL FIND FINE FIRE FISH FIVE FLAG FLAT FOOD FOOT FOUR FREE FROG FROM FULL GAME GAVE GIFT GIRL GIVE GLAD GOAT GOLD GOOD GRAY GREW GROW HAIR HALF HAND HARD HAVE HEAD HEAR HELP HERE HIGH HILL HOLD HOME HOPE HOUR HUGE JUMP JUST KEEP KIND KING KITE KNEW KNOW LAKE LAMP LAND LAST LATE LEAF LEFT LEGS LIKE LINE LION LIST LIVE LONG LOOK LOST LOVE LUCK MADE MAIL MAKE MANY MILK MIND MISS MOON MORE MOST MOVE MUCH MUST NAME NEAR NECK NEED NEST NEXT NICE NINE NOSE NOTE ONCE ONLY OPEN OVER PAGE PAID PAIR PARK PART PASS PATH PINK PLAY POND POOL PULL PUSH RAIN READ REST RICE RIDE RING ROAD ROCK ROOM ROSE RULE SAFE SAID SAND SAVE SEAT SEED SEEM SEEN SEND SHIP SHOE SHOP SHOW SHUT SICK SIDE SIGN SING SINK SITS SIZE SKIN SKIP SLOW SNOW SOAP SOCK SOFT SOME SONG SOON STAR STAY STEP STOP SUCH SURE SWIM TAIL TAKE TALL TEAM TELL TENT TEST THAN THAT THEM THEN THEY THIN THIS TILL TIME TINY TOLD TOOK TOWN TREE TRIP TRUE TURN UPON VERY WAIT WALK WALL WANT WARM WASH WAVE WAYS WELL WENT WERE WEST WHAT WHEN WIDE WILD WILL WIND WING WISH WITH WOLF WOOD WORD WORK YARD YEAR YOUR ZERO FLOWER GARDEN LITTLE KITTEN RABBIT YELLOW PURPLE ORANGE SUMMER WINTER SPRING SCHOOL FRIEND FAMILY FATHER MOTHER SISTER MONKEY DONKEY TURTLE BOTTLE BASKET BUTTON CANDLE CASTLE CHEESE CHERRY CIRCLE COOKIE COTTON DINNER DOCTOR DRAGON FINGER FOREST FROZEN GENTLE GOLDEN GRAPES HAMMER HELMET ISLAND JACKET JUNGLE JUMPER KETTLE LADDER LEAVES LETTER LISTEN MARKET MEADOW MIDDLE MIRROR NARROW NATURE NEEDLE NUMBER PENCIL PEOPLE PILLOW PLANET PLAYER PLEASE POCKET POTATO PRETTY PUZZLE REALLY RETURN ROCKET RUBBER SIMPLE SLOWLY SMOOTH SOCCER SPIDER SQUARE STREET STRONG SUNDAY THIRTY TICKET TOMATO TRAVEL TWELVE TWENTY WINDOW WONDER'.split(' ');
export function practiceWord(length: number, plan: PracticePlan, profile: PracticeProfile, random: () => number, previous = ''): string {
  const focus = plan.focus && random() < 0.7 ? plan.focus : null;
  const choices = [...shortWords,...longWords].filter(w => w.length === length && w !== previous && [...w].every(k => plan.keys.includes(k)) && (!focus || w.includes(focus)));
  if (choices.length) return choices[Math.floor(random()*choices.length)];
  // With very small key sets, fixed-length combinations are more useful than words.
  let word = '';
  for (let attempt=0; attempt<4; attempt++) {
    word = Array.from({length},()=>practiceKey(plan.keys,profile,random)).join('');
    if (focus) { const at = Math.floor(random()*length); word = word.slice(0,at)+focus+word.slice(at+1); }
    if(word !== previous) break;
  }
  return word;
}

const longWords = 'APPLE BREAD CHAIR CLOUD DANCE DREAM DRINK EARTH EVERY FIRST FLOOR FRESH FRUIT GRASS GREEN HAPPY HEART HORSE HOUSE JUICE LAUGH LEARN LIGHT LUNCH MAGIC MOUSE MUSIC NIGHT PAPER PEACH PIANO PLACE PLANT PLATE QUIET RIVER ROUND SEVEN SHEEP SHIRT SHOES SHORT SLEEP SMALL SMILE SNAKE SOUND SPACE SPOON STAND STONE STORY SUGAR SWEET TABLE TEACH THANK THEIR THERE THREE TIGER TODAY TRAIN UNDER UNTIL WATER WHEEL WHITE WORLD WRITE YOUNG ANOTHER BALLOON BEDROOM BICYCLE BROTHER CHICKEN CLOTHES COUNTRY DOLPHIN DRAWING EVENING FEATHER FLOWERS FRIENDS GIRAFFE GOODBYE KITCHEN MORNING PICTURE PLAYING RAINBOW READING SINGING SOMEONE TEACHER THROUGH TOGETHER CHILDREN ELEPHANT FOOTBALL KEYBOARD MOUNTAIN QUESTION SANDWICH SHOULDER SUNSHINE UMBRELLA TOMORROW BIRTHDAY HOSPITAL NOTEBOOK PAINTING PLAYTIME PRINCESS SCISSORS SNOWBALL SOMEBODY YOURSELF ADVENTURE AFTERNOON BEAUTIFUL BLUEBERRY BREAKFAST BUTTERFLY CHOCOLATE CLASSROOM CROCODILE DANGEROUS DIFFERENT DIRECTION DRAGONFLY EDUCATION FANTASTIC FAVOURITE FURNITURE IMPORTANT JELLYFISH KNOWLEDGE NEIGHBOUR NEWSPAPER PINEAPPLE SOMETHING SPACESHIP SUNFLOWER VEGETABLE WATERFALL WONDERFUL BASKETBALL BLACKBOARD CHEERFULLY FRIENDSHIP PLAYGROUND PLAYTHINGS STRAWBERRY SUNGLASSES TOOTHBRUSH UNDERSTAND VOLLEYBALL WATERMELON'.split(' ');
