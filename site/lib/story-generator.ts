export type TaskMode =
  | 'color-scene'
  | 'weather'
  | 'sculpt'
  | 'music'
  | 'candle';

export interface ScenePath {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  encounterX: number;
  encounterY: number;
  size: number;
  duration: number;
}

export interface Location {
  id: string;
  name: string;
  asset: string;
  alt: string;
  path: ScenePath;
}

export interface EncounterCharacter {
  id: string;
  name: string;
  spokenName: string;
  said: string;
  asset: string;
  arrival: string;
}

export interface GameTask {
  id: string;
  title: string;
  instruction: string;
  mode: TaskMode;
  storySituations: readonly string[];
  requests: readonly string[];
  titles: readonly string[];
  completion: string;
}

export interface CandleScenePackage {
  prompt: string;
}

export interface GameScene {
  id: string;
  title: string;
  story: string;
  dialogue: string;
  location: Location;
  character: EncounterCharacter;
  task: GameTask;
  candle?: CandleScenePackage;
}

const path = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  encounterX: number,
  encounterY: number,
  duration = 3.2,
): ScenePath => ({
  startX,
  startY,
  endX,
  endY,
  encounterX,
  encounterY,
  size: 42,
  duration,
});

export const locations: Location[] = [
  {
    id: 'village-room',
    name: 'Деревенская комната',
    asset: '/game/backgrounds/village-room.webp',
    alt: 'Тихая деревенская комната с деревянным полом и окном',
    path: path(-9, 90, 35, 90, 73, 90, 2.9),
  },
  {
    id: 'workshop',
    name: 'Деревенская мастерская',
    asset: '/game/backgrounds/workshop.webp',
    alt: 'Деревенская мастерская с инструментами и деревянным полом',
    path: path(-9, 91, 36, 91, 75, 91, 3.1),
  },
  {
    id: 'sunny-edge',
    name: 'Солнечная опушка',
    asset: '/game/backgrounds/sunny-edge.webp',
    alt: 'Светлая лесная опушка с просторной поляной',
    path: path(-8, 92, 34, 91, 73, 90, 3.2),
  },
  {
    id: 'stone-circle',
    name: 'Каменный круг',
    asset: '/game/backgrounds/stone-circle.webp',
    alt: 'Каменный круг на лесной поляне',
    path: path(-9, 91, 35, 90, 75, 89, 3.2),
  },
  {
    id: 'lighthouse',
    name: 'Берег у маяка',
    asset: '/game/backgrounds/lighthouse.webp',
    alt: 'Морской берег и остров с маяком',
    path: path(-9, 94, 34, 92, 73, 91, 3),
  },
  {
    id: 'dark-clearing',
    name: 'Туманная поляна',
    asset: '/game/backgrounds/dark-clearing.webp',
    alt: 'Мрачная лесная поляна в тумане',
    path: path(-9, 91, 34, 90, 74, 89, 3.3),
  },
  {
    id: 'crossroads',
    name: 'Старый перекрёсток',
    asset: '/game/backgrounds/crossroads.webp',
    alt: 'Перекрёсток у старого деревянного указателя',
    path: path(-8, 94, 36, 88, 74, 84, 3.5),
  },
  {
    id: 'lake-bridge',
    name: 'Мостик у озера',
    asset: '/game/backgrounds/lake-bridge.webp',
    alt: 'Спокойное озеро и деревянный мостик',
    path: path(-9, 93, 34, 92, 73, 91, 3.1),
  },
  {
    id: 'swamp-pier',
    name: 'Болотная заводь',
    asset: '/game/backgrounds/swamp-pier.webp',
    alt: 'Тихая болотная заводь с небольшим причалом',
    path: path(-9, 93, 34, 91, 72, 90, 3.2),
  },
  {
    id: 'quiet-bay',
    name: 'Тихая бухта',
    asset: '/game/backgrounds/quiet-bay.webp',
    alt: 'Тихая бухта с деревянным причалом',
    path: path(-9, 94, 34, 92, 73, 91, 3),
  },
  {
    id: 'forest-clearing-a',
    name: 'Лесная поляна',
    asset: '/game/backgrounds/forest-clearing-a.webp',
    alt: 'Лесная поляна в мягком акварельном стиле',
    path: path(-9, 92, 35, 91, 74, 90, 3.2),
  },
  {
    id: 'forest-clearing-b',
    name: 'Зелёная поляна',
    asset: '/game/backgrounds/forest-clearing-b.webp',
    alt: 'Зелёная лесная поляна между большими деревьями',
    path: path(-9, 92, 35, 91, 74, 90, 3.2),
  },
  {
    id: 'forest-path',
    name: 'Сказочная тропа',
    asset: '/game/backgrounds/forest-path.webp',
    alt: 'Тихая тропа, уходящая в сказочный лес',
    path: path(-8, 95, 36, 91, 72, 87, 3.5),
  },
  {
    id: 'kitchen',
    name: 'Уютная кухня',
    asset: '/game/backgrounds/kitchen.webp',
    alt: 'Уютная деревенская кухня с большой белой печью',
    path: path(-9, 91, 35, 90, 74, 90, 3),
  },
];

export const characters: EncounterCharacter[] = [
  {
    id: 'keykeeper',
    name: 'Хранитель ключа',
    spokenName: 'хранитель ключа',
    said: 'сказал',
    asset: '/game/characters/standing/keykeeper.png',
    arrival: 'У дороги его уже ждал хранитель огромного ключа.',
  },
  {
    id: 'fisher',
    name: 'Рыбак',
    spokenName: 'рыбак',
    said: 'сказал',
    asset: '/game/characters/standing/fisher.png',
    arrival: 'Рядом с тропой рыбак терпеливо распутывал тонкую леску.',
  },
  {
    id: 'farmer',
    name: 'Фермер',
    spokenName: 'фермер',
    said: 'сказал',
    asset: '/game/characters/standing/farmer.png',
    arrival: 'У края поляны фермер опирался на вилы и о чём-то размышлял.',
  },
  {
    id: 'blacksmith',
    name: 'Кузнец',
    spokenName: 'кузнец',
    said: 'сказал',
    asset: '/game/characters/standing/blacksmith.png',
    arrival: 'Из тёплого света вышел кузнец с маленьким молотком.',
  },
  {
    id: 'mushroom-picker',
    name: 'Грибник',
    spokenName: 'грибник',
    said: 'сказал',
    asset: '/game/characters/standing/mushroom-picker.png',
    arrival: 'Из-за дерева показался грибник с полной корзиной находок.',
  },
  {
    id: 'saxophonist',
    name: 'Саксофонист',
    spokenName: 'саксофонист',
    said: 'сказал',
    asset: '/game/characters/standing/saxophonist.png',
    arrival: 'Вдалеке блеснула медная труба: это был странствующий саксофонист.',
  },
  {
    id: 'violinist',
    name: 'Скрипач',
    spokenName: 'скрипач',
    said: 'сказал',
    asset: '/game/characters/standing/violinist.png',
    arrival: 'На поляне скрипач бережно проверял струны старого инструмента.',
  },
  {
    id: 'boatman',
    name: 'Лодочник',
    spokenName: 'лодочник',
    said: 'сказал',
    asset: '/game/characters/standing/boatman.png',
    arrival: 'У самой воды молча стоял лодочник в длинном плаще.',
  },
  {
    id: 'sailor',
    name: 'Моряк',
    spokenName: 'моряк',
    said: 'сказал',
    asset: '/game/characters/standing/sailor.png',
    arrival: 'На старом ящике сидел моряк и выпускал колечки дыма из трубки.',
  },
  {
    id: 'woman',
    name: 'Хозяйка деревни',
    spokenName: 'хозяйка деревни',
    said: 'сказала',
    asset: '/game/characters/standing/woman.png',
    arrival: 'У калитки путешественника встретила хозяйка деревни.',
  },
];

export const shapelessCharacter: EncounterCharacter = {
  id: 'shapeless',
  name: 'Нечто',
  spokenName: 'нечто',
  said: 'прошептало',
  asset: '',
  arrival:
    'У дороги покачивалось Нечто. Оно было совсем не злым — просто никак не могло удержать форму.',
};

export const gameTasks: GameTask[] = [
  {
    id: 'color-scene',
    title: 'Раскрасить сцену',
    instruction: 'Бери кисть: выбери цвет и коснись нужной части.',
    mode: 'color-scene',
    storySituations: [
      'Пока они говорили, все краски исчезли, оставив только ясные чёрные линии.',
      'Старинное заклятие смыло цвета со сцены, но сохранило каждый контур.',
      'Ветер перевернул день, и место стало похоже на страницу раскраски.',
    ],
    requests: [
      'Краски пропали. Вернёшь их?',
      'У сцены остались одни линии. Оживим?',
      'Здесь не хватает цвета. Поможешь?',
    ],
    titles: ['Раскрасить сцену'],
    completion: 'Цвет вернулся, и сцена снова ожила.',
  },
  {
    id: 'weather-stroke',
    title: 'Мазок погоды',
    instruction: 'Бери кисть и проведи по небу — мазок сам растечётся.',
    mode: 'weather',
    storySituations: [
      'Над этим местом уже неделю висела тяжёлая туча.',
      'Небо застыло серым листом и ждало первого мазка.',
      'Старая погода задержалась над крышами дольше обычного.',
    ],
    requests: [
      'Туча застряла над нами. Нарисуешь новое небо?',
      'Небо хмурится. Сменим ему настроение?',
      'Погода уснула. Разбудим её цветом?',
    ],
    titles: ['Мазок погоды'],
    completion: 'Новое небо мягко растеклось над сценой.',
  },
  {
    id: 'repair-instrument',
    title: 'Починить мелодию',
    instruction: 'Возьми ноту и собери мелодию из четырёх слоёв.',
    mode: 'music',
    storySituations: [
      'Инструмент выглядел целым, но каждая мелодия рассыпалась после первой ноты.',
      'Внутри инструмента будто потерялись четыре маленьких голоса.',
      'Саксофон молчал, хотя музыкант уже всё проверил и настроил.',
    ],
    requests: [
      'Инструмент молчит. Соберём ему новый голос?',
      'Мелодия рассыпалась. Поможешь сложить её заново?',
      'Кажется, отсюда пропала музыка. Вернём?',
    ],
    titles: ['Починить мелодию'],
    completion: 'Слышишь? Инструмент снова нашёл свой голос!',
  },
  {
    id: 'repair-violin',
    title: 'Голос скрипки',
    instruction: 'Возьми ноту и проведи пальцем по звукам — скрипка подхватит движение.',
    mode: 'music',
    storySituations: [
      'Смычок скользил легко, но струны потеряли дорогу между звуками.',
      'Скрипка отзывалась лишь коротким шорохом, будто забыла протяжную мелодию.',
      'В старом корпусе ещё жила музыка, но ей не хватало плавного движения.',
    ],
    requests: [
      'Струны забыли мелодию. Проведёшь её заново?',
      'Скрипке нужен плавный голос. Поможешь?',
      'Проведи звук от ноты к ноте — попробуем вместе?',
    ],
    titles: ['Голос скрипки'],
    completion: 'Теперь мелодия льётся свободно. Слышишь?',
  },
  {
    id: 'shadow-story',
    title: 'Театр теней',
    instruction: 'Возьми свечу и поставь эту историю на светлой ширме.',
    mode: 'candle',
    storySituations: [
      'В маленьком вагончике зажглась свеча, а пустая ширма ждала новую историю.',
      'Старый театр теней приехал без спектакля, но привёз целый ящик фигур.',
      'За занавеской уже горел тёплый огонёк, только героям не хватало режиссёра.',
    ],
    requests: [
      'Покажешь, что случилось после их встречи?',
      'Соберёшь для нас маленькую историю теней?',
      'Поможешь оживить пустую ширму?',
    ],
    titles: ['Театр теней'],
    completion: 'Вот какая история получилась. Она останется в памяти огонька.',
  },
  {
    id: 'sculpt-shape',
    title: 'Новая форма',
    instruction: 'Возьми кляксу и помоги мне собраться.',
    mode: 'sculpt',
    storySituations: [
      'Нечто старательно собирало себя в комок, но края снова расползались.',
      'Каждый раз, когда Нечто пыталось выпрямиться, одна деталь съезжала набок.',
      'Нечто замерло круглым комом и явно стеснялось собственной бесформенности.',
    ],
    requests: [
      'Форма опять расползлась. Соберёшь меня?',
      'Поможешь мне стать собой?',
      'Кажется, мне не хватает формы. Попробуем?',
    ],
    titles: ['Новая форма'],
    completion: 'Вот теперь я держу форму. И она мне нравится!',
  },
];

const candlePrompts = [
  'Покажи, что произошло после их встречи.',
  'Покажи историю у старого моста.',
  'Покажи, кто нашёл дорогу домой.',
  'Покажи встречу у тихой воды.',
] as const;


const colorSceneLocationIds = new Set([
  'village-room',
  'workshop',
  'sunny-edge',
  'stone-circle',
  'lighthouse',
  'crossroads',
  'lake-bridge',
  'quiet-bay',
  'forest-clearing-a',
  'forest-clearing-b',
  'forest-path',
  'kitchen',
]);

const weatherLocationIds = new Set([
  'crossroads',
  'lake-bridge',
  'quiet-bay',
  'swamp-pier',
]);

const locationOpenings = [
  (name: string) => `На старой карте проступило новое название: «${name}». Тропа привела путешественника точно сюда.`,
  (name: string) => `За очередным поворотом открылось новое место — «${name}». Путеводный огонёк в котомке сразу стал ярче.`,
  (name: string) => `Дорога закончилась у таблички «${name}». Вокруг было тихо, будто история ждала первого слова.`,
  (name: string) => `Сегодня тропа выбрала место «${name}». Здесь уже происходило что-то необычное.`,
] as const;

const storyClosings = [
  'Путешественник остановился рядом и достал четыре карты.',
  'Герой поставил котомку на землю: нужный способ помощи точно был среди карт.',
  'Огонёк мигнул ещё раз, и перед путешественником появились четыре возможных действия.',
  'Никакого правильного ответа не требовалось — оставалось только выбрать, с чего начать.',
] as const;

const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];


function assembleScene(
  location: Location,
  character: EncounterCharacter,
  task: GameTask,
): GameScene {
  const request = pick(task.requests);
  const spokenRequest = /[.!?]$/.test(request) ? request : request + '.';
  const instruction = task.instruction;

  const candle =
    task.mode === 'candle'
      ? {
          prompt: pick(candlePrompts),
        }
      : undefined;

  return {
    id: `${location.id}-${character.id}-${task.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: pick(task.titles),
    story: `${pick(locationOpenings)(location.name)} ${character.arrival} ${pick(task.storySituations)} ${pick(storyClosings)}`,
    dialogue: spokenRequest + ' ' + instruction,
    location,
    character,
    task,
    candle,
  };
}

export const initialScene: GameScene = {
  id: 'initial-scene',
  title: 'Раскрасить сцену',
  story: 'На старой карте проступило новое название: «Деревенская комната». Тропа привела путешественника точно сюда. У дороги его уже ждал хранитель огромного ключа. За ночь из этого места исчезли несколько важных цветов. Путешественник остановился рядом и достал четыре карты.',
  dialogue: 'Краски пропали. Вернёшь их? Бери кисть: выбери цвет и коснись нужной части.',
  location: locations[0],
  character: characters[0],
  task: gameTasks[0],
};

export function createRandomScene(previousLocationId?: string): GameScene {
  const locationPool = locations.filter(
    (location) => location.id !== previousLocationId,
  );
  const location = pick(locationPool.length ? locationPool : locations);
  const availableTasks = gameTasks.filter((task) => {
    if (task.mode === 'color-scene') {
      return colorSceneLocationIds.has(location.id);
    }
    if (task.mode === 'weather') {
      return weatherLocationIds.has(location.id);
    }
    return true;
  });
  const task = pick(availableTasks);
  const character =
    task.mode === 'sculpt'
      ? shapelessCharacter
      : task.mode === 'candle'
        ? characters.find((item) => item.id === 'keykeeper') ?? characters[0]
      : task.id === 'repair-violin'
        ? characters.find((item) => item.id === 'violinist') ?? characters[0]
        : task.mode === 'music'
          ? characters.find((item) => item.id === 'saxophonist') ?? characters[0]
          : pick(characters);
  return assembleScene(location, character, task);
}



