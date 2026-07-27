import { SIMULATION_ACTIONS, type SimulationActionName } from './live/app';
import {
    pauseSimulation,
    runSimulationAction,
    type SimulationStats,
    simulationStats,
    startSimulation,
    stopSimulation,
} from './live/session';

const sessionControls = document.querySelector('#session')!;
const actionControls = document.querySelector('#actions')!;
const statsView = document.querySelector('#stats')!;
const log = document.querySelector('#log')!;

const print = (text: string) => {
    const at = new Date().toLocaleTimeString([], { hour12: false });
    log.textContent = `${at}  ${text}\n${log.textContent}`;
};

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.textContent = label;
    element.className = className;
    element.addEventListener('click', onClick);
    return element;
}

const toggle = button('', 'primary', () => {
    if (simulationStats().running) {
        const stats = stopSimulation();
        print(`■ left the page after ${Math.round(stats.uptimeMs / 1000)}s · ${summary(stats)}`);
    } else {
        startSimulation();
        print('▶ live user arrives — signs in, opens a chat, then keeps working on its own');
    }
    render();
});

const pause = button('⏸ pause loop', '', () => {
    pauseSimulation();
    print('⏸ loop paused, the graph stays up — drive it by hand');
    render();
});

const teardown = button('✕ tear down', '', () => {
    const stats = stopSimulation();
    print(`✕ everything closed · ${summary(stats)}`);
    render();
});

sessionControls.append(toggle, pause, teardown);

const actionButtons = new Map<SimulationActionName, HTMLButtonElement>();

for (const action of SIMULATION_ACTIONS) {
    const element = button(action.label, '', () => void trigger(action.name, element));
    element.id = `action-${action.name}`;
    element.title = action.hint;
    actionButtons.set(action.name, element);
    actionControls.append(element);
}

let pending = 0;

async function trigger(name: SimulationActionName, element: HTMLButtonElement): Promise<void> {
    pending += 1;
    element.classList.add('busy');
    print(`→ ${name}${pending > 1 ? ` (queued behind ${pending - 1})` : ''}`);

    try {
        const stats = await runSimulationAction(name);
        print(`✔ ${name} · ${summary(stats)}`);
    } catch (error) {
        print(`✖ ${name}: ${String(error)}`);
    } finally {
        pending -= 1;
        element.classList.remove('busy');
        render();
    }
}

function summary(stats: SimulationStats): string {
    return [
        `${stats.messagesSent} sent`,
        `${stats.messagesReceived} received`,
        `${stats.keystrokes} keys`,
        `${stats.chatsOpened} chats`,
        `${stats.searches} searches`,
        `${stats.historyPages} pages`,
        `${stats.uploads} uploads (${stats.uploadCrashes} crashed)`,
        `${stats.analyticsEvents} tracked`,
    ].join(' · ');
}

function render(): void {
    const stats = simulationStats();

    toggle.textContent = stats.running ? '■ stop live user' : '▶ live user';
    toggle.classList.toggle('running', stats.running);
    pause.disabled = !stats.running;
    teardown.disabled = !stats.live;

    statsView.textContent = '';

    const line = document.createElement('div');
    line.className = stats.live ? 'activity' : 'off';
    line.textContent = stats.live
        ? `${stats.running ? 'loop' : 'by hand'} · ${stats.activity} · up ${Math.round(stats.uptimeMs / 1000)}s`
        : 'nothing running — any action button boots the app';

    const counters = document.createElement('div');
    counters.textContent = summary(stats);

    statsView.append(line, counters);
}

setInterval(render, 250);
render();

window.__simulation = {
    actions: SIMULATION_ACTIONS.map((action) => action.name),
    start: startSimulation,
    pause: pauseSimulation,
    stop: stopSimulation,
    run: runSimulationAction,
    stats: simulationStats,
};
