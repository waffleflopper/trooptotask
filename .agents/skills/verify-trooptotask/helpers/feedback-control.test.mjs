import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { installFeedbackControl } from './feedback-control.mjs';

function toast(window, type, text) {
	const element = window.document.createElement('li');
	element.setAttribute('data-sonner-toast', '');
	element.setAttribute('data-type', type);
	element.textContent = text;
	window.document.body.append(element);
	return element;
}

test('feedback excludes an unchanged prior success and captures a later failed action', async (t) => {
	const window = new Window();
	t.after(() => window.happyDOM.close());
	toast(window, 'success', 'Previous save');
	installFeedbackControl(window);
	window.document.body.append(window.document.createElement('div'));
	await window.happyDOM.waitUntilComplete();
	assert.deepEqual(window.__mapFeedback.entries, []);

	toast(window, 'error', 'Current save failed');
	await window.happyDOM.waitUntilComplete();
	assert.deepEqual(window.__mapFeedback.entries, [{ type: 'error', text: 'Current save failed' }]);

	// A new element with the old wording is still new feedback from a later action.
	toast(window, 'success', 'Previous save');
	await window.happyDOM.waitUntilComplete();
	assert.deepEqual(window.__mapFeedback.entries, [
		{ type: 'error', text: 'Current save failed' },
		{ type: 'success', text: 'Previous save' }
	]);
});

test('feedback captures an existing toast when its type or message changes', async (t) => {
	const window = new Window();
	t.after(() => window.happyDOM.close());
	const existing = toast(window, 'loading', 'Saving');
	installFeedbackControl(window);
	existing.setAttribute('data-type', 'success');
	await window.happyDOM.waitUntilComplete();
	assert.deepEqual(window.__mapFeedback.entries, [{ type: 'success', text: 'Saving' }]);

	existing.firstChild.data = 'Saved';
	await window.happyDOM.waitUntilComplete();
	assert.deepEqual(window.__mapFeedback.entries, [
		{ type: 'success', text: 'Saving' },
		{ type: 'success', text: 'Saved' }
	]);
	window.document.body.append(window.document.createElement('div'));
	await window.happyDOM.waitUntilComplete();
	assert.equal(window.__mapFeedback.entries.length, 2);
});
