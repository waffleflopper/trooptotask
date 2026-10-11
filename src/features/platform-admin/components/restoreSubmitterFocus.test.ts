// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { restoreSubmitterFocus } from './restoreSubmitterFocus';

afterEach(() => {
	document.body.replaceChildren();
});

function button(label: string, { refusesFocus = false } = {}) {
	const element = document.createElement('button');
	element.textContent = label;
	if (refusesFocus) element.focus = () => {};
	document.body.append(element);
	return element;
}

describe('restoreSubmitterFocus', () => {
	it('focuses the pressed button once it is enabled again', async () => {
		const pressed = button('Save');
		await restoreSubmitterFocus(pressed, () => [button('Other')]);
		expect(document.activeElement).toBe(pressed);
	});

	it('skips a disabled button and a fallback that refuses focus, then takes the next fallback', async () => {
		const pressed = button('Save');
		pressed.disabled = true;
		const hidden = button('Hidden trigger', { refusesFocus: true });
		const tab = button('Active tab');
		await restoreSubmitterFocus(pressed, () => [null, hidden, tab]);
		expect(document.activeElement).toBe(tab);
	});

	it('leaves focus alone when the user already moved it', async () => {
		const elsewhere = button('Elsewhere');
		elsewhere.focus();
		await restoreSubmitterFocus(button('Save'), () => [button('Other')]);
		expect(document.activeElement).toBe(elsewhere);
	});
});
