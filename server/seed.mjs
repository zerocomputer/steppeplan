import { nanoid } from 'nanoid';

const now = new Date();
const iso = (minutesAgo = 0) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
const id = (prefix) => `${prefix}_${nanoid(10)}`;

const node = (type, title, summary, extra = {}) => ({
  id: id('nod'),
  type,
  title,
  summary,
  body: '',
  tags: [],
  status: 'open',
  origin: 'seed',
  x: 0,
  y: 0,
  createdAt: iso(240),
  updatedAt: iso(30),
  ...extra,
});

const edge = (source, target, kind, label = '') => ({
  id: id('edg'),
  source,
  target,
  kind,
  label,
  createdAt: iso(200),
});

export function createSeedWorkspace() {
  // --- Product concept -----------------------------------------------------
  const vision = node('concept', 'Видение', 'Живая модель проекта, в которой человек и ИИ думают над одной и той же логикой.', {
    body: 'SteppePlan хранит не документы, а связи между смыслами. Любая заметка, решение или задача занимает место в графе и не теряет контекст. ИИ-агент читает этот граф перед тем, как что-то предложить.',
    tags: ['продукт', 'смысл'],
    x: 0,
    y: 0,
    status: 'active',
  });
  const user = node('concept', 'Кто пользователь', 'Основатель или небольшая команда, которая ведёт несколько проектов и уже работает с ИИ-агентами.', {
    summary: 'Основатель или небольшая команда, которая ведёт несколько проектов и уже работает с ИИ-агентами.',
    tags: ['аудитория'],
    x: -292,
    y: 0,
  });
  const core = node('concept', 'Ядро: живой граф', 'Проект → концепции → узлы и связи. Один источник истины для человека, UI и MCP-агентов.', {
    body: 'Узлы типизированы: концепт, вопрос, решение, задача, риск, знание. Связи задают логику: поддерживает, зависит, уточняет, противоречит. Граф можно читать глазами и через API.',
    tags: ['архитектура', 'граф'],
    x: 0,
    y: 220,
    status: 'active',
  });
  const mcp = node('concept', 'MCP-мост для агентов', 'Агент читает концепцию и дописывает знания инструментами MCP — без копирования контекста в чат.', {
    body: 'Инструменты: list_projects, get_concept, add_node, update_node, add_edge, search_nodes. Ресурсы отдают граф в markdown и JSON. Работает поверх того же локального store, что и интерфейс.',
    tags: ['mcp', 'агенты'],
    x: 292,
    y: 0,
    status: 'active',
  });
  const ai = node('concept', 'ИИ внутри приложения', 'Чат в контексте выбранной концепции: предлагает узлы, связи и вопросы, сразу меняя граф.', {
    body: 'Провайдеры: OpenAI-совместимые (OpenAI, DeepSeek, OpenRouter, Ollama) и Anthropic. Ключи лежат локально. Без ключа доступен офлайн-демо-режим.',
    tags: ['ии', 'tool calling'],
    x: 292,
    y: 220,
    status: 'active',
  });
  const cloud = node('question', 'Облако или только локально?', 'Нужен ли шаринг в первой версии — или локальной автономности достаточно?', {
    body: 'Гипотеза: локальность — преимущество, а не ограничение. Облако добавляем позже как опцию синхронизации и совместного доступа, не ломая офлайн-сценарий.',
    tags: ['открытый вопрос'],
    x: 292,
    y: 440,
    status: 'open',
  });
  const decision = node('decision', 'Local-first по умолчанию', 'Данные — файл на диске. Сеть не обязательна. Облако — опциональный слой поверх.', {
    body: 'Принято для прототипа. Даёт приватность, скорость и честную автономность. Цена — синхронизация и шаринг требуют отдельного дизайна.',
    tags: ['решение', 'local-first'],
    x: 292,
    y: 660,
    status: 'active',
  });
  const risk = node('risk', 'Порог входа', 'Граф без ритуала быстро превращается в свалку узлов. Нужны лёгкие ритуалы и помощь ИИ.', {
    body: 'Митигация: типы узлов по умолчанию, подсказки при создании, авто-раскладка, ИИ-ревью концепции, аккуратный пустой старт.',
    tags: ['риск', 'ux'],
    x: 0,
    y: 440,
    status: 'open',
  });
  const task = node('task', 'Прототип v0.1', 'Холст, локальное хранение, MCP-сервер, встроенный ИИ-чат и настройки провайдеров.', {
    tags: ['прототип'],
    x: -292,
    y: 220,
    status: 'done',
  });
  const figma = node('source', 'Figma как референс', 'Холст, панели и тулбар — знакомы по Figma. Простота и воздух — от Apple.', {
    tags: ['референс'],
    x: -292,
    y: 440,
  });

  const productConcept = {
    id: id('cpt'),
    name: 'Продукт',
    description: 'Что строим, для кого и на каких принципах. Главная концепция проекта.',
    color: '#9747FF',
    viewport: { x: 300, y: 55, zoom: 0.85 },
    nodes: [vision, user, core, mcp, ai, cloud, decision, risk, task, figma],
    edges: [
      edge(user.id, core.id, 'supports'),
      edge(vision.id, core.id, 'supports'),
      edge(core.id, mcp.id, 'supports'),
      edge(core.id, ai.id, 'supports'),
      edge(mcp.id, ai.id, 'depends', 'общий контекст'),
      edge(decision.id, cloud.id, 'refines', 'закрывает вопрос'),
      edge(decision.id, core.id, 'supports'),
      edge(risk.id, core.id, 'contradicts', 'снижает простоту'),
      edge(task.id, core.id, 'refines', 'проверяет'),
      edge(figma.id, vision.id, 'supports'),
    ],
    createdAt: iso(300),
    updatedAt: iso(20),
  };

  // --- Go-to-market concept ------------------------------------------------
  const audience = node('concept', 'Первые 5 команд', 'Небольшие продуктовые команды, уже использующие Cursor/Claude и страдающие от разрозненного контекста.', {
    tags: ['аудитория'],
    x: 0,
    y: 0,
  });
  const value = node('decision', 'Ценность: мысль не теряется', 'Позиционирование через непрерывность контекста, а не через «ещё одну доску».', {
    tags: ['позиционирование'],
    x: 300,
    y: 0,
    status: 'active',
  });
  const channels = node('question', 'Где их найти?', 'Сообщества вокруг ИИ-инструментов, личные сети основателей, open-source MCP-каталоги.', {
    tags: ['каналы'],
    x: 0,
    y: 220,
  });
  const pilot = node('task', 'Пилот с 5 командами', 'Дать доступ, провести онбординг, смотреть, какие графы рождаются.', {
    tags: ['пилот'],
    x: 300,
    y: 220,
    status: 'open',
  });
  const metric = node('decision', 'Метрика: неделя удержания', 'Команда возвращается к графу через неделю и агент уже читает его через MCP.', {
    tags: ['метрика'],
    x: 600,
    y: 100,
    status: 'active',
  });

  const gtmConcept = {
    id: id('cpt'),
    name: 'Выход на рынок',
    description: 'Как показать ценность первым пользователям и не потерять фокус.',
    color: '#14AE5C',
    viewport: { x: 62, y: 250, zoom: 0.8 },
    nodes: [audience, value, channels, pilot, metric],
    edges: [
      edge(audience.id, value.id, 'supports'),
      edge(channels.id, pilot.id, 'supports'),
      edge(pilot.id, metric.id, 'refines'),
      edge(value.id, metric.id, 'refines'),
      edge(audience.id, channels.id, 'relates'),
    ],
    createdAt: iso(180),
    updatedAt: iso(90),
  };

  // --- Second project ------------------------------------------------------
  const route = node('concept', 'Большой маршрут', 'Алтай → Монголия → Гobi, 6 недель, внедорожник, автономность 3 дня.', {
    tags: ['маршрут'],
    x: 0,
    y: 0,
  });
  const car = node('task', 'Подготовить машину', 'Лифт, шноркель, две запаски, ревизия топливной системы.', {
    tags: ['авто'],
    x: 300,
    y: 0,
    status: 'active',
  });
  const danger = node('risk', 'Погода в перевалах', 'Сентябрь непредсказуем: снег на перевалах может закрыть маршрут на неделю.', {
    tags: ['риск'],
    x: 300,
    y: 220,
  });
  const window = node('decision', 'Окно: август–сентябрь', 'Выезжать в середине августа, чтобы оставить буфер на погоду.', {
    tags: ['план'],
    x: 600,
    y: 80,
    status: 'active',
  });

  const travelConcept = {
    id: id('cpt'),
    name: 'Маршрут 2027',
    description: 'Логистика большого внедорожного путешествия.',
    color: '#F24822',
    viewport: { x: 62, y: 250, zoom: 0.8 },
    nodes: [route, car, danger, window],
    edges: [
      edge(route.id, car.id, 'depends'),
      edge(danger.id, route.id, 'contradicts', 'может сдвинуть'),
      edge(window.id, danger.id, 'refines', 'буфер'),
      edge(car.id, route.id, 'supports'),
    ],
    createdAt: iso(600),
    updatedAt: iso(400),
  };

  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: iso(0),
    projects: [
      {
        id: id('prj'),
        name: 'SteppePlan',
        description: 'Продукт: локально-автономная среда концепций, общая для человека и ИИ-агентов.',
        color: '#0D99FF',
        concepts: [productConcept, gtmConcept],
        createdAt: iso(900),
        updatedAt: iso(20),
      },
      {
        id: id('prj'),
        name: 'Транс-Монголия 2027',
        description: 'Личный проект: подготовка и логистика путешествия.',
        color: '#F24822',
        concepts: [travelConcept],
        createdAt: iso(1200),
        updatedAt: iso(400),
      },
    ],
    settings: {
      activeProviderId: 'demo',
      providers: [
        { id: 'demo', name: 'Демо (офлайн)', kind: 'demo', baseUrl: '', model: 'offline', hasKey: true },
        {
          id: 'deepseek',
          name: 'DeepSeek',
          kind: 'openai',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        {
          id: 'openai',
          name: 'OpenAI',
          kind: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4.1-mini',
        },
        {
          id: 'openrouter',
          name: 'OpenRouter',
          kind: 'openai',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'ollama',
          name: 'Ollama (локально)',
          kind: 'openai',
          baseUrl: 'http://127.0.0.1:11434/v1',
          model: 'llama3.1',
        },
        {
          id: 'anthropic',
          name: 'Anthropic',
          kind: 'anthropic',
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'claude-sonnet-4-5',
        },
      ],
    },
  };
}
