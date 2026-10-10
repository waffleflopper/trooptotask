import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { installBusyControl } from './busy-control.mjs';

test('busy records each distinct submit label and disabled state, including a transient one', async (t) => {
	const window = new Window();
	t.after(() => window.happyDOM.close());
	const button = window.document.createElement('button');
	button.type = 'submit';
	button.textContent = 'Sign In';
	window.document.body.append(button);
	installBusyControl(window);

	button.disabled = true;
	button.textContent = 'Signing In...';
	await window.happyDOM.waitUntilComplete();
	button.disabled = false;
	button.textContent = 'Sign In';
	await window.happyDOM.waitUntilComplete();

	assert.deepEqual(window.__mapBusy.entries, [
		{ text: 'Sign In', disabled: false, ariaBusy: null },
		{ text: 'Signing In...', disabled: true, ariaBusy: null },
		{ text: 'Sign In', disabled: false, ariaBusy: null }
	]);
	assert.throws(() => installBusyControl(window), /Restore the previous busy observer/);
});
