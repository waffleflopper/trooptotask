// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import MultiSelectTest from './MultiSelectTest.svelte';

afterEach(cleanup);

function focusedOption() {
	return document.activeElement?.textContent?.trim();
}

describe('WorkspaceToolbar.MultiSelect', () => {
	it('reaches every option by arrow keys, toggles with Space while staying open, and Escape returns to the trigger', async () => {
		render(MultiSelectTest);
		const trigger = screen.getByRole('button', { name: 'Filter by MOS' });
		trigger.focus();

		await fireEvent.keyDown(trigger, { key: 'Enter' });
		await screen.findByRole('menu');
		await waitFor(() => expect(focusedOption()).toBe('11B Infantry'));

		const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
		await press('ArrowDown');
		expect(focusedOption()).toBe('25U Signal');
		await press('ArrowDown');
		expect(focusedOption()).toBe('68W Medic');
		await press('ArrowUp');
		expect(focusedOption()).toBe('25U Signal');

		await press(' ');
		await press('ArrowDown');
		await press(' ');
		expect(screen.getByLabelText('Selected MOS').textContent).toBe('25U,68W');
		expect(screen.getByRole('menu')).toBeTruthy();
		expect(screen.getByRole('menuitemcheckbox', { name: '25U Signal' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('menuitemcheckbox', { name: '11B Infantry' }).getAttribute('aria-checked')).toBe('false');

		await press(' ');
		expect(screen.getByLabelText('Selected MOS').textContent).toBe('25U');

		await press('Escape');
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filter by MOS, 1 selected' }))
		);
	});
});
