// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import OverlayDismissalTest from './OverlayDismissalTest.svelte';

afterEach(cleanup);

const cases = [
	{ kind: 'sheet', trigger: 'Manage access' },
	{ kind: 'popover', trigger: 'Pick date' }
] as const;

async function open(name: string) {
	const trigger = screen.getByRole('button', { name });
	trigger.focus();
	await fireEvent.click(trigger);
	await screen.findByRole('button', { name: 'Inside control' });
	return trigger;
}

async function clickOutside() {
	const outside = screen.getByRole('button', { name: 'Outside control' });
	const point = { clientX: 5, clientY: 5 };
	await fireEvent.pointerDown(outside, point);
	await fireEvent.pointerUp(outside, point);
	await fireEvent.click(outside, point);
}

describe.each(cases)('$kind dismissal', ({ kind, trigger: triggerName }) => {
	it('closes on Escape and returns focus to its trigger', async () => {
		render(OverlayDismissalTest, { kind });
		const trigger = await open(triggerName);

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Inside control' }), { key: 'Escape' });

		await waitFor(() => expect(screen.queryByRole('button', { name: 'Inside control' })).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it('closes on an outside click', async () => {
		render(OverlayDismissalTest, { kind });
		await open(triggerName);

		await clickOutside();

		await waitFor(() => expect(screen.queryByRole('button', { name: 'Inside control' })).toBeNull());
		expect(screen.getByRole('button', { name: triggerName }).getAttribute('aria-expanded')).toBe('false');
	});
});

describe('sheet focus', () => {
	it('keeps focus inside when its focused control disables', async () => {
		render(OverlayDismissalTest, { kind: 'sheet' });
		await open('Manage access');
		const sheet = screen.getByRole('dialog', { name: 'Manage Access' });
		const save = screen.getByRole('button', { name: 'Save access' });
		save.focus();

		await fireEvent.click(save);
		await new Promise((resolve) => setTimeout(resolve));

		expect((save as HTMLButtonElement).disabled).toBe(true);
		expect(document.activeElement).toBe(sheet);
	});
});
