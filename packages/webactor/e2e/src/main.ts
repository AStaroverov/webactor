import type { ScenarioResult } from './harness';
import { runActorLifecycle } from './scenarios/actor-lifecycle';
import { runActorSupervisorStorm } from './scenarios/actor-supervisor-storm';
import { runChannelStorm } from './scenarios/channel-storm';
import { runChannelThrashing } from './scenarios/channel-thrashing';
import { runMemoryLeak } from './scenarios/memory-leak';
import { runMessageFlooding } from './scenarios/message-flooding';
import { runCrossThreadChannel } from './scenarios/cross-thread-channel';
import { runPortFlooding } from './scenarios/port-flooding';
import { runWorkerChain } from './scenarios/worker-chain';
import { runWorkerChurn } from './scenarios/worker-churn';
import { runWorkerFlooding } from './scenarios/worker-flooding';
import { runWorkerSupervisorStorm } from './scenarios/worker-supervisor-storm';
import './shared-tab';

const scenarios: Record<string, (overrides?: Record<string, number>) => Promise<ScenarioResult>> = {
    'actor-lifecycle': runActorLifecycle,
    'channel-thrashing': runChannelThrashing,
    'message-flooding': runMessageFlooding,
    'port-flooding': runPortFlooding,
    'worker-flooding': runWorkerFlooding,
    'worker-chain': runWorkerChain,
    'worker-churn': runWorkerChurn,
    'channel-storm': runChannelStorm,
    'cross-thread-channel': runCrossThreadChannel,
    'actor-supervisor-storm': runActorSupervisorStorm,
    'worker-supervisor-storm': runWorkerSupervisorStorm,
    'memory-leak': runMemoryLeak,
};

window.__loadTest = {
    scenarios: Object.keys(scenarios),
    run: (name, overrides) => {
        const scenario = scenarios[name];
        if (!scenario) return Promise.reject(new Error(`Unknown scenario: ${name}`));
        return scenario(overrides);
    },
};

const controls = document.querySelector('#controls')!;
const output = document.querySelector('#output')!;
const buttons: HTMLButtonElement[] = [];

const setBusy = (busy: boolean) => buttons.forEach((button) => (button.disabled = busy));

const print = (text: string) => {
    output.textContent = `${text}\n\n${output.textContent}`;
};

async function runAndPrint(name: string): Promise<void> {
    setBusy(true);
    print(`▶ ${name}: running...`);
    try {
        const result = await window.__loadTest.run(name);
        print(`✔ ${name} (${Math.round(result.durationMs)}ms)\n${JSON.stringify(result, null, 2)}`);
    } catch (error) {
        print(`✖ ${name}: ${error}`);
    } finally {
        setBusy(false);
    }
}

function addButton(label: string, onClick: () => Promise<void>): void {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => void onClick());
    buttons.push(button);
    controls.appendChild(button);
}

for (const name of Object.keys(scenarios)) {
    addButton(name, () => runAndPrint(name));
}

addButton('run all', async () => {
    for (const name of Object.keys(scenarios)) {
        await runAndPrint(name);
    }
});
