// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import SelectNamingTest from './SelectNamingTest.svelte';

afterEach(cleanup);

async function openListbox(triggerName: string) {
	await fireEvent.keyDown(screen.getByRole('button', { name: triggerName }), { key: 'ArrowDown' });
	await screen.findByRole('listbox');
}

describe('Select listbox name', () => {
	it('is the field label that names its trigger', async () => {
		render(SelectNamingTest);

		await openListbox('Unit status');
		expect(screen.getByRole('listbox', { name: 'Unit status' })).toBeTruthy();
	});

	it("is the trigger's aria-label", async () => {
		render(SelectNamingTest);

		await openListbox('Status filter');
		expect(screen.getByRole('listbox', { name: 'Status filter' })).toBeTruthy();
	});

	it('keeps a name the consumer gives the content', async () => {
		render(SelectNamingTest);

		await openListbox('Board status');
		expect(screen.getByRole('listbox', { name: 'Board status choices' })).toBeTruthy();
	});
});
