# Chat Application Implementation Plan

## Архитектура

### Main Thread (UI)
- **UI Actor** (`chat-ui-actor.ts`) - обрабатывает DOM и пользовательский ввод
- **connectActorToWorker** - соединяет UI Actor с SharedWorker

### SharedWorker
- **Chat Server Actor** - хранит состояние чата (пользователи, сообщения, комнаты)
- **onConnectMessagePort** - обрабатывает подключения от main thread
- **connectActorToMessagePort** - соединяет Chat Server Actor с каждым портом

## Поток данных

### Отправка сообщения
1. Пользователь вводит текст в UI
2. UI Actor отправляет `ChatEvent.SEND_MESSAGE` с `{ text: "hello" }`
3. `connectActorToWorker` передает через SharedWorker port
4. `onConnectMessagePort` получает сообщение
5. `connectActorToMessagePort` передает в Chat Server Actor
6. Chat Server Actor обрабатывает в `handleMessage`
7. Создает `ChatMessage` объект
8. Сохраняет в `state.messages`
9. Отправляет `ChatEvent.NEW_MESSAGE` с `{ message: ChatMessage }`
10. `connectActorToMessagePort` передает обратно через port
11. `connectActorToWorker` доставляет в UI Actor
12. UI Actor получает `ChatEvent.NEW_MESSAGE`
13. Добавляет сообщение в `messages` массив
14. Вызывает `updateUI()` для обновления DOM

### Мультитабность
- SharedWorker поддерживает несколько подключений автоматически
- Каждая вкладка создает свой порт через `onConnectMessagePort`
- Chat Server Actor получает одно сообщение, отправляет всем портам
- Все вкладки получают одинаковые сообщения синхронно
