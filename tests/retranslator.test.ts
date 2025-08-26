import { ActorContext, connectActors, createActor, createRetranslator } from '../src/index';

describe('Retranslator Tests', () => {
    let retranslator: any;
    let targetActor: any;
    let sourceActor: any;
    let disconnectFunctions: VoidFunction[] = [];

    afterEach(async () => {
        try {
            // Отключаем все соединения
            disconnectFunctions.forEach(disconnect => {
                try {
                    disconnect();
                } catch (e) {
                    console.warn('Disconnect error (ignoring):', e);
                }
            });
            disconnectFunctions = [];
            
            if (retranslator) {
                retranslator.destroy();
                retranslator = null;
            }
            if (targetActor) {
                targetActor.destroy();
                targetActor = null;
            }
            if (sourceActor) {
                sourceActor.destroy();
                sourceActor = null;
            }
        } catch (error) {
            console.warn('Cleanup error (ignoring):', error);
        }
    });

    it('should forward messages through connectActors chain', async () => {
        const receivedMessages: any[] = [];
        const testMessage1 = { type: 'test', content: 'Hello through retranslator!' };
        const testMessage2 = { type: 'data', value: 42, timestamp: Date.now() };

        // Создаем исходный актор
        sourceActor = createActor('source', (context: ActorContext) => {
            context.postMessage(testMessage1);
            context.postMessage(testMessage2);
        });
        
        // Создаем ретранслятор
        retranslator = createRetranslator({
            name: 'test-retranslator'
        });
        
        // Создаем целевой актор
        targetActor = createActor('target', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                receivedMessages.push(event.data);
            });
        });

        // Соединяем через connectActors: source -> retranslator -> target
        const disconnect1 = connectActors(sourceActor, retranslator);
        const disconnect2 = connectActors(retranslator, targetActor);
        disconnectFunctions.push(disconnect1, disconnect2);

        // Запускаем всех
        targetActor.launch();
        retranslator.launch();
        sourceActor.launch();

        // Ждем обработки сообщений
        await new Promise(resolve => setTimeout(resolve, 100));

        // Проверяем, что сообщения дошли до цели через ретранслятор
        expect(receivedMessages).toHaveLength(2);
        expect(receivedMessages[0]).toEqual(testMessage1);
        expect(receivedMessages[1]).toEqual(testMessage2);
    });

    it('should forward different types of data correctly with connectActors', async () => {
        const receivedData: any[] = [];
        
        // Тестируем разные типы данных
        const testData = [
            'simple string',
            42,
            { complex: { nested: { object: true } } },
            [1, 2, 3, 'array', { mixed: 'data' }],
            null,
            undefined,
            true,
            false
        ];
        
        // Создаем источник
        sourceActor = createActor('data-source', (context: ActorContext) => {
            // Отправляем все тестовые данные при запуске
            testData.forEach(data => {
                context.postMessage(data);
            });
        });
        
        // Создаем ретранслятор
        retranslator = createRetranslator();
        
        // Создаем получатель
        targetActor = createActor('data-collector', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                receivedData.push(event.data);
            });
        });

        // Соединяем: source -> retranslator -> target
        const disconnect1 = connectActors(sourceActor, retranslator);
        const disconnect2 = connectActors(retranslator, targetActor);
        disconnectFunctions.push(disconnect1, disconnect2);

        // Запускаем в правильном порядке
        targetActor.launch();
        retranslator.launch();
        sourceActor.launch();

        await new Promise(resolve => setTimeout(resolve, 100));

        // Проверяем, что все данные были переданы корректно через ретранслятор
        expect(receivedData).toHaveLength(testData.length);
        testData.forEach((expectedData, index) => {
            expect(receivedData[index]).toEqual(expectedData);
        });
    });

    it('should work in complex actor networks with bidirectional communication', async () => {
        const actor1Messages: any[] = [];
        const actor2Messages: any[] = [];
        
        // Создаем два актора, которые будут общаться через ретранслятор
        const actor1 = createActor('actor1', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                actor1Messages.push({ ...event.data, receivedBy: 'actor1' });
                // Отправляем ответ
                if (event.data.type === 'ping') {
                    context.postMessage({ type: 'pong', from: 'actor1', replyTo: event.data });
                }
            });
            // Отправляем начальное сообщение при запуске
            context.postMessage({ type: 'ping', message: 'Hello from actor1', id: 1 });
        });
        
        const actor2 = createActor('actor2', (context: ActorContext) => {
            context.addEventListener('message', (event) => {
                actor2Messages.push({ ...event.data, receivedBy: 'actor2' });
                // Отправляем ответ
                if (event.data.type === 'ping') {
                    context.postMessage({ type: 'pong', from: 'actor2', replyTo: event.data });
                }
            });
            // Отправляем начальное сообщение при запуске
            context.postMessage({ type: 'ping', message: 'Hello from actor2', id: 2 });
        });

        // Создаем ретранслятор как посредник
        retranslator = createRetranslator({
            name: 'network-hub'
        });

        // Запускаем всех
        actor1.launch();
        actor2.launch();
        retranslator.launch();

        // Соединяем сеть: actor1 <-> retranslator <-> actor2
        const disconnect1 = connectActors(actor1, retranslator);
        const disconnect2 = connectActors(retranslator, actor2);
        const disconnect3 = connectActors(actor2, retranslator);
        const disconnect4 = connectActors(retranslator, actor1);
        
        disconnectFunctions.push(disconnect1, disconnect2, disconnect3, disconnect4);

        // Отправляем сообщения в обе стороны
        actor1.postMessage({ type: 'ping', message: 'Hello from actor1', id: 1 });
        actor2.postMessage({ type: 'ping', message: 'Hello from actor2', id: 2 });

        await new Promise(resolve => setTimeout(resolve, 200));

        // Проверяем, что сообщения дошли в обе стороны
        expect(actor1Messages).toContainEqual(
            expect.objectContaining({
                type: 'pong',
                from: 'actor2',
                receivedBy: 'actor1'
            })
        );
        
        expect(actor2Messages).toContainEqual(
            expect.objectContaining({
                type: 'pong', 
                from: 'actor1',
                receivedBy: 'actor2'
            })
        );

        // Очистка
        actor1.destroy();
        actor2.destroy();
    });
});