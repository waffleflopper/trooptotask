// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DropdownMenuTest from './DropdownMenuTest.svelte';

afterEach(cleanup);

function focusedItem() {
	return document.activeElement?.textContent?.trim();
}

describe('DropdownMenu keyboard', () => {
	it('moves through items by arrows, Home, End and typeahead, and Escape returns focus to the trigger', async () => {
		render(DropdownMenuTest);
		const trigger = screen.getByRole('button', { name: 'Account menu' });
		trigger.focus();

		await fireEvent.keyDown(trigger, { key: 'Enter' });
		const menu = await screen.findByRole('menu');
		await waitFor(() => expect(focusedItem()).toBe('Profile'));

		const press = (key: string) => fireEvent.keyDown(document.activeElement ?? menu, { key });
		await press('ArrowDown');
		expect(focusedItem()).toBe('Security');
		await press('ArrowUp');
		expect(focusedItem()).toBe('Profile');
		await press('End');
		expect(focusedItem()).toBe('Sign out');
		await press('Home');
		expect(focusedItem()).toBe('Profile');
		await press('t');
		expect(focusedItem()).toBe('Toggle theme');

		await press('Escape');
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});
});
