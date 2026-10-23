// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import StartingNumbersRow from './StartingNumbersRow.svelte';

vi.mock('$app/state', () => ({ page: { params: { orgId: 'c-co' } } }));

function respond(body: unknown, status = 200) {
	const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(body), { status }));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Starting numbers row', () => {
	it('links an editable form to DA 6 setup', async () => {
		const fetchMock = respond({ state: 'editable', numbered: false });
		render(StartingNumbersRow, { typeId: 'cq', shortName: 'CQ', blocked: false });

		const link = await screen.findByRole('link', { name: 'Copy it in' });

		expect(link.getAttribute('href')).toBe('/org/c-co/calendar/rosters/cq?setup=1');
		expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/org\/c-co\/api\/duty-rosters\/starting-numbers\?typeId=cq&/);
	});

	it('holds the link while the sheet has unsaved changes', async () => {
		respond({ state: 'editable', numbered: true });
		render(StartingNumbersRow, { typeId: 'cq', shortName: 'CQ', blocked: true });

		const button = await screen.findByRole('button', { name: 'Change them' });

		expect(button.hasAttribute('disabled')).toBe(true);
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('offers no change once the numbers are part of the record', async () => {
		respond({ state: 'locked', numbered: true });
		render(StartingNumbersRow, { typeId: 'cq', shortName: 'CQ', blocked: false });

		await screen.findByText(/part of the record/);

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('explains a failed read and tries again', async () => {
		respond({ message: 'Unavailable' }, 503);
		render(StartingNumbersRow, { typeId: 'cq', shortName: 'CQ', blocked: false });

		await screen.findByRole('alert');
		respond({ state: 'editable', numbered: false });
		(await screen.findByRole('button', { name: 'Try again' })).click();

		await screen.findByRole('link', { name: 'Copy it in' });
	});
});
