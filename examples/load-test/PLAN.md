# Load Test / Performance Testing Plan

## Цель
Нагрузочное тестирование библиотеки Actorr с фокусом на:
- Создание/уничтожение большого количества акторов
- Интенсивное создание/закрытие каналов связи
- Массовая отправка сообщений
- Работа с множеством воркеров
- Утечки памяти и производительность GC

## Архитектура тестов

### 1. Actor Lifecycle Stress Test
**Файл**: `src/actor-lifecycle-test.ts`
```
┌─ Coordinator Actor ─┐
│  - Создает/убивает  │ ──┐
│  - Мониторит память │   │
│  - Логирует метрики │   │
└─────────────────────┘   │
                          │
┌─ Batch Manager ─────┐   │
│  - Управляет пулом  │ ◄─┘
│  - Запускает волны  │
│  - Очищает ресурсы  │
└─────────────────────┘
         │
         ▼
┌─ Worker Pool ──────┐
│ Worker 1-N         │
│ ├─ Actor 1-100     │
│ ├─ Actor 101-200   │
│ └─ Actor N*100     │
└────────────────────┘
```

### 2. Channel Thrashing Test
**Файл**: `src/channel-thrashing-test.ts`
```
UI Actor (Dashboard)
    │
    ▼ (мониторинг)
Connection Manager
    │
    ├─ connectActors() ──► Пары акторов
    ├─ disconnect()    ──► Разрыв связей
    └─ Reconnect       ──► Новые связи

Паттерн: Создать 1000 связей → Убить 500 → Создать 300 → Убить все
```

### 3. Message Flooding Test
**Файл**: `src/message-flooding-test.ts`
```
Producer Actors (1-50)     Message Queue        Consumer Actors (1-100)
     │                          │                        │
     ├─ generateMessages()      ├─ buffer              ├─ processMessage()
     ├─ burst mode              ├─ overflow           ├─ backpressure
     └─ sustained load          └─ metrics            └─ error handling
```

### 4. Worker Spawn/Kill Test
**Файл**: `src/worker-spawn-kill-test.ts`
```
Master Controller
    │
    ├─ SharedWorker Pool (создание/удаление)
    ├─ DedicatedWorker Pool
    └─ Performance Monitor
        │
        ├─ Memory usage tracking
        ├─ CPU utilization
        └─ Connection count
```

### 5. Memory Leak Detection
**Файл**: `src/memory-leak-test.ts`
```
Leak Detector Actor
    │
    ├─ WeakRef tracking акторов
    ├─ Memory snapshots
    ├─ GC force trigger
    └─ Leak reporting
```

## Сценарии нагрузки

### Сценарий 1: "Burst Creation"
```typescript
// Быстрое создание большого количества акторов
for (let batch = 0; batch < 100; batch++) {
  const actors = Array.from({length: 100}, () => createActor(...));
  await Promise.all(actors.map(a => a.launch()));
  
  // Работа с акторами
  await intensiveMessageExchange(actors);
  
  // Уничтожение
  actors.forEach(a => a.destroy());
}
```

### Сценарий 2: "Connection Chaos"
```typescript
// Хаотичное создание/разрыв соединений
const actors = createActorPool(200);
const connections = new Set();

setInterval(() => {
  // Создаем случайные связи
  for (let i = 0; i < 50; i++) {
    const [a, b] = getRandomPair(actors);
    const disconnect = connectActors(a, b);
    connections.add(disconnect);
  }
  
  // Убиваем случайные связи
  const toKill = Array.from(connections).slice(0, 25);
  toKill.forEach(disconnect => {
    disconnect();
    connections.delete(disconnect);
  });
}, 100); // Каждые 100ms
```

### Сценарий 3: "Worker Storm"
```typescript
// Массовое создание воркеров
async function workerStorm() {
  const workers = [];
  
  // Создаем 100 SharedWorkers
  for (let i = 0; i < 100; i++) {
    const worker = new SharedWorker(`./test-worker-${i}.js`);
    workers.push(worker);
    
    // Подключаем к каждому несколько акторов
    const actors = Array.from({length: 10}, () => createActor(...));
    actors.forEach(actor => connectActorToWorker(actor, worker));
  }
  
  // Интенсивная работа
  await simulateHeavyLoad(workers);
  
  // Убиваем все
  workers.forEach(w => w.port.close());
}
```

### Сценарий 4: "Message Tsunami"
```typescript
// Массовая отправка сообщений
const producers = Array.from({length: 50}, () => createProducerActor());
const consumers = Array.from({length: 100}, () => createConsumerActor());

// Подключаем all-to-all
producers.forEach(p => {
  consumers.forEach(c => connectActors(p, c));
});

// Генерируем цунами сообщений
producers.forEach(producer => {
  setInterval(() => {
    for (let i = 0; i < 1000; i++) {
      producer.postMessage(`msg-${Date.now()}-${i}`);
    }
  }, 10); // 50,000 сообщений в секунду на продюсера
});
```

## Метрики и мониторинг

### Actor Metrics Dashboard
**Файл**: `vitest.config.ts` + `tests/*.test.ts`

**Подход**: Используем Vitest Browser Mode для простой оркестрации

```
┌─ Actor Performance Metrics ───┐
│ ├─ Actors Created: 15,420     │
│ ├─ Actors Destroyed: 15,417   │ 
│ ├─ Orphaned Actors: 3         │
│ ├─ Messages Sent: 1,240,567   │
│ ├─ Messages Received: 1,240,564│
│ ├─ Connections Active: 245     │
│ ├─ Avg Message Latency: 0.2ms │
│ └─ Actor Memory Usage: 45MB    │
└────────────────────────────────┘

┌─ Live Test Results ────────────┐
│ ✅ actor-lifecycle.test.ts     │
│    └─ 10 waves × 1000 actors  │
│ 🔄 channel-thrashing.test.ts   │
│    └─ 5000 connections/min    │
│ ⏸️  message-flooding.test.ts   │
│    └─ Paused at 50k msg/sec   │
│ ❌ worker-spawn.test.ts        │
│    └─ Failed: Worker timeout  │
│ ⚪ memory-leak.test.ts         │
│    └─ Queued                  │
└────────────────────────────────┘

┌─ Vitest Browser UI ───────────┐
│ Vitest управляет всем:        │
│ • Запуск/остановка тестов     │
│ • Логи и результаты           │
│ • Watch mode для отладки      │
│ • Hot reload при изменениях   │
└───────────────────────────────┘
```

### Actor Metrics Collector
**Файл**: `src/metrics-collector.ts`

```typescript
interface ActorMetrics {
  // Основные метрики акторов
  actorsCreated: number;
  actorsDestroyed: number;
  actorsActive: number;
  orphanedActors: string[];
  
  // Метрики сообщений
  messagesSent: number;
  messagesReceived: number;
  messagesLost: number;
  avgMessageLatency: number;
  
  // Метрики соединений
  connectionsActive: number;
  connectionsFailed: number;
  connectionsDestroyed: number;
  
  // Производительность
  actorCreationTime: number[];  // История времени создания
  messageDeliveryTime: number[]; // История доставки сообщений
}

class ActorMetricsCollector {
  private metrics: ActorMetrics = {
    actorsCreated: 0,
    actorsDestroyed: 0,
    actorsActive: 0,
    orphanedActors: [],
    messagesSent: 0,
    messagesReceived: 0,
    messagesLost: 0,
    avgMessageLatency: 0,
    connectionsActive: 0,
    connectionsFailed: 0,
    connectionsDestroyed: 0,
    actorCreationTime: [],
    messageDeliveryTime: []
  };
  
  // Простые методы сбора метрик
  trackActorCreated(actorId: string, creationTime: number): void;
  trackActorDestroyed(actorId: string): void;
  trackMessageSent(messageId: string, timestamp: number): void;
  trackMessageReceived(messageId: string, timestamp: number): void;
  trackConnectionCreated(connectionId: string): void;
  trackConnectionDestroyed(connectionId: string): void;
  
  getMetrics(): ActorMetrics;
  reset(): void;
  exportToConsole(): void; // Простой вывод в консоль
}
```

## Файловая структура

```
examples/load-test/
├── PLAN.md                     # Этот документ
├── README.md                   # Инструкции запуска
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                  # Dashboard UI
└── src/
    ├── main.ts                 # Entry point
    ├── dashboard.ts            # Performance dashboard
    ├── metrics-collector.ts    # Сбор метрик
    ├── load-coordinator.ts     # Координатор нагрузки
    │
    ├── tests/
    │   ├── actor-lifecycle-test.ts    # Тест жизненного цикла
    │   ├── channel-thrashing-test.ts  # Тест каналов
    │   ├── message-flooding-test.ts   # Тест сообщений
    │   ├── worker-spawn-kill-test.ts  # Тест воркеров
    │   └── memory-leak-test.ts        # Тест утечек памяти
    │
    ├── actors/
    │   ├── producer-actor.ts          # Генератор сообщений
    │   ├── consumer-actor.ts          # Обработчик сообщений  
    │   ├── metrics-actor.ts           # Сбор метрик
    │   └── dummy-actor.ts             # Простой актор для тестов
    │
    ├── workers/
    │   ├── test-worker.ts             # Тестовый воркер
    │   ├── heavy-computation.worker.ts # Тяжелые вычисления
    │   └── shared-state.worker.ts     # Общее состояние
    │
    └── utils/
        ├── performance.ts             # Утилиты производительности
        ├── memory-tracker.ts          # Отслеживание памяти
        └── stress-patterns.ts         # Паттерны нагрузки
```

## Примеры нагрузочных паттернов

### Паттерн "Волны"
```typescript
async function wavePattern() {
  for (let wave = 0; wave < 10; wave++) {
    console.log(`Wave ${wave + 1}/10`);
    
    // Создаем волну акторов
    const actors = await createActorWave(1000);
    
    // Интенсивная работа 30 сек
    await intensiveWork(actors, 30000);
    
    // Уничтожаем всех
    await destroyWave(actors);
    
    // Пауза для GC
    await sleep(5000);
  }
}
```

### Паттерн "Пила"
```typescript
function sawtoothPattern() {
  let actorCount = 0;
  const actors = new Set();
  
  setInterval(() => {
    // Рост: добавляем 100 акторов
    for (let i = 0; i < 100; i++) {
      const actor = createActor(`actor-${actorCount++}`, ...);
      actor.launch();
      actors.add(actor);
    }
  }, 100);
  
  setInterval(() => {
    // Падение: убиваем все
    actors.forEach(actor => {
      actor.destroy();
      actors.delete(actor);
    });
    console.log(`Killed ${actors.size} actors`);
  }, 10000);
}
```

### Паттерн "Случайный хаос"
```typescript
function chaosPattern() {
  const operations = [
    () => createRandomActors(Math.random() * 100),
    () => destroyRandomActors(Math.random() * 50), 
    () => connectRandomActors(Math.random() * 200),
    () => disconnectRandomConnections(Math.random() * 100),
    () => sendMessageBurst(Math.random() * 1000)
  ];
  
  setInterval(() => {
    const operation = operations[Math.floor(Math.random() * operations.length)];
    operation();
  }, 50); // Хаос каждые 50ms
}
```

## Критерии успеха

1. **Производительность**
   - Создание 10,000 акторов < 5 сек
   - Обработка 100,000 сообщений/сек
   - Память не растет при цикличной нагрузке

2. **Стабильность** 
   - Нет ошибок при 1M+ операций
   - GC справляется с нагрузкой
   - Нет orphaned connections

3. **Масштабируемость**
   - Линейный рост при увеличении нагрузки
   - Graceful degradation при перегрузке
   - Восстановление после пиковых нагрузок

## UI-driven отладка и тестирование

### Workflow отладки стабильности

#### 1. Быстрая диагностика
```
Разработчик нажимает [🎛️ Run All Tests]
  ↓
Все сценарии запускаются параллельно
  ↓  
Логи в реальном времени показывают проблемы
  ↓
Automatic Emergency Stop при критических ошибках
  ↓
Рекомендации по исправлению в UI
```

#### 2. Целенаправленная отладка
```
Разработчик видит проблему с памятью
  ↓
Нажимает [▶ Start] в "Memory Leak Hunt" 
  ↓
Настраивает параметры через [⚙️ Settings]
  ↓
Наблюдает детальные логи утечек
  ↓
Экспортирует логи через [📊 Export Logs]
```

#### 3. Пошаговая отладка сценариев
```typescript
// Пример: отладка Actor Lifecycle
interface DebugActorLifecycle {
  // Пошаговый режим
  stepByStep: boolean;          // Пауза после каждого шага
  breakOnError: boolean;        // Остановка при ошибке
  verboseLogging: boolean;      // Детальные логи
  
  // Точки останова
  breakpoints: {
    beforeActorCreation: boolean;
    afterActorCreation: boolean; 
    beforeActorDestroy: boolean;
    afterActorDestroy: boolean;
    onMemoryThreshold: number;   // Остановка при превышении памяти
  };
  
  // Инспекция состояния
  inspectActorState: (actorId: string) => ActorDebugInfo;
  inspectConnectionState: () => ConnectionDebugInfo;
  inspectMemoryState: () => MemoryDebugInfo;
}
```

### Интерактивные элементы UI

#### Контролы сценариев с состоянием
```typescript
interface ScenarioButtonState {
  // Состояния кнопок
  start: 'enabled' | 'disabled' | 'running';
  pause: 'enabled' | 'disabled' | 'paused';
  stop: 'enabled' | 'disabled';
  
  // Визуальные индикаторы
  status: '⚪ Ready' | '🟡 Running' | '🔴 Error' | '🟢 Success' | '⏸️ Paused';
  progress?: number; // 0-100% для прогрессбара
}

// Примеры состояний UI:
// [▶ Start] - серая кнопка когда готов к запуску
// [🔄 Starting...] - анимация при запуске  
// [⏸ Pause] - синяя кнопка при выполнении
// [⏹ Stop] - красная кнопка для остановки
// [❌ Error] - красная кнопка при ошибке
```

#### Live Log Filtering и Search
```typescript
interface LogInterface {
  // Фильтры в реальном времени
  filters: {
    scenario: string[];      // Фильтр по сценарию
    level: LogLevel[];       // Фильтр по уровню
    timeRange: [Date, Date]; // Временной диапазон
    searchText: string;      // Поиск по тексту
  };
  
  // Действия с логами
  actions: {
    autoScroll: boolean;     // Автоскролл к новым логам
    highlight: string[];     // Подсветка ключевых слов
    export: (format: 'json' | 'csv' | 'txt') => void;
    clear: () => void;
  };
}

// Примеры фильтрации:
// [🔍 Filter] > "memory" → показать только логи с "memory"
// [🟢🟡🔴] → переключение уровней логов  
// [📅 Last 5 min] → показать логи за последние 5 минут
```

#### Настройки сценариев через модальные окна
```typescript
interface ScenarioConfigModal {
  // Быстрые предустановки
  presets: {
    'Light Load': ScenarioConfig;
    'Medium Load': ScenarioConfig;  
    'Heavy Load': ScenarioConfig;
    'Extreme Load': ScenarioConfig;
    'Debug Mode': ScenarioConfig;
  };
  
  // Кастомные настройки
  customConfig: ScenarioConfig;
  
  // Валидация в реальном времени
  validation: {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  };
}

// UI для настроек:
// ┌─ Actor Lifecycle Settings ─────┐
// │ Preset: [Heavy Load ▼]         │
// │ ─────────────────────────────── │ 
// │ Waves: [10] actors             │
// │ Batch Size: [1000] per wave    │
// │ Pause: [5000] ms between waves │
// │ ☑ Enable cleanup verification │
// │ ☑ Force GC after each wave    │
// │ ─────────────────────────────── │
// │ ⚠️ Warning: High memory usage   │
// │     [Cancel] [Apply] [Save]     │
// └─────────────────────────────────┘
```

### Автоматизированные проверки стабильности

#### Smart Alerts
```typescript
interface StabilityAlerts {
  // Умные уведомления
  alerts: {
    memoryLeakDetected: (leak: MemoryLeak) => void;
    performanceDegradation: (degradation: PerformanceDrop) => void;
    connectionLeakDetected: (leak: ConnectionLeak) => void;
    orphanedActorsFound: (orphans: OrphanedActor[]) => void;
  };
  
  // Автоматические действия
  autoActions: {
    emergencyStopOnCritical: boolean;  // Авто-остановка
    forceGCOnMemoryThreshold: boolean; // Принудительная GC
    logDetailedStateOnError: boolean;  // Детальные логи при ошибках
  };
}

// Примеры алертов в UI:
// 🚨 CRITICAL: Memory leak detected!
//    Leaked: 15MB in Actor Lifecycle test
//    [🛑 Stop Test] [📊 Analyze] [❌ Dismiss]
//
// ⚠️ WARNING: Performance degradation
//    Messages/sec dropped from 50k to 30k  
//    [🔍 Investigate] [⏸️ Pause] [❌ Dismiss]
```

## Команды запуска

### Режимы запуска
```bash
# Interactive dashboard (рекомендуется для отладки)
npm run dashboard

# Автоматические тесты (CI/CD)
npm run load-test:auto

# Отдельные сценарии через CLI
npm run test:lifecycle -- --waves=5 --batch=500
npm run test:channels -- --chaos=high --duration=60s  
npm run test:messages -- --rate=10000 --burst=true
npm run test:workers -- --count=50 --actors=20
npm run test:memory -- --cycles=10 --force-gc=true

# Отладочные режимы
npm run debug:step-by-step    # Пошаговое выполнение
npm run debug:verbose         # Максимально детальные логи
npm run debug:memory-profile  # Профилирование памяти
```

### Экспорт результатов
```bash
# Экспорт логов тестирования
npm run export:logs -- --format=json --date=2024-01-15
npm run export:metrics -- --format=csv --scenario=all
npm run export:report -- --format=html --include-charts=true

# Генерация отчетов
npm run generate:stability-report
npm run generate:performance-baseline  
npm run generate:regression-report
```