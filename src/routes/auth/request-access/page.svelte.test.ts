// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function chooseSource(option: string) {
	const trigger = screen.getByLabelText('How did you hear about us?');
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
	await fireEvent.pointerUp(await screen.findByRole('option', { name: option }));
}

it('shows the details that were sent, not edits typed while the request ran', async () => {
	let answer: (response: Response) => void = () => {};
	const fetchMock = vi.fn(
		(_input: RequestInfo, _init?: RequestInit) => new Promise<Response>((resolve) => (answer = resolve))
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page);

	await fireEvent.input(screen.getByLabelText('First Name'), { target: { value: 'Avery' } });
	await fireEvent.input(screen.getByLabelText('Last Name'), { target: { value: 'Quinlan' } });
	const email = screen.getByLabelText('Email Address');
	await fireEvent.input(email, { target: { value: 'avery@example.test' } });
	await chooseSource('Someone in my unit');
	await fireEvent.submit(email.closest('form')!);

	await fireEvent.input(email, { target: { value: 'changed@example.test' } });
	answer(Response.json({ ok: true }, { status: 201 }));

	expect(await screen.findByText('avery@example.test')).toBeVisible();
	expect(screen.getByText('Avery Quinlan')).toBeVisible();
	expect(screen.queryByText('changed@example.test')).toBeNull();
	expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ email: 'avery@example.test' });
});
