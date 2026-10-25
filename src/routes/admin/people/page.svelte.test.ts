// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { IdentityPeoplePage, IdentityPerson } from '$features/identity/contracts';
import type { PersonRegion } from '$features/platform-admin/contracts';
import PeoplePage from './+page.svelte';

const { goto, invalidate } = vi.hoisted(() => ({
	goto: vi.fn(async (..._args: unknown[]) => {}),
	invalidate: vi.fn(async (..._args: unknown[]) => {})
}));
vi.mock('$app/navigation', () => ({ goto, invalidate }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin/people') } }));

const ACTIVE = '11111111-1111-4111-8111-111111111111';
const WAITING = '22222222-2222-4222-8222-222222222222';

const result = (people: IdentityPeoplePage['people'], totalCount = people.length): IdentityPeoplePage => ({
	people,
	totalCount,
	page: 1,
	limit: 20
});
const active: IdentityPerson = {
	id: ACTIVE,
	name: 'Dana Reyes',
	email: 'dana@example.test',
	createdAt: '2026-09-01T00:00:00Z',
	lastSignInAt: null,
	emailConfirmedAt: '2026-09-01T00:00:00Z',
	organizationCount: 2,
	state: { kind: 'active', userId: ACTIVE }
};
const waiting: IdentityPerson = {
	id: WAITING,
	name: 'Sam Rivera',
	email: 'sam@example.test',
	createdAt: '2026-10-01T00:00:00Z',
	lastSignInAt: null,
	emailConfirmedAt: null,
	organizationCount: 0,
	state: { kind: 'notSetUp', requestId: WAITING, approvedAt: '2026-10-01T00:00:00Z', linkExpiresAt: null }
};

function data(people: Promise<PersonRegion<IdentityPeoplePage>>, overrides: Record<string, unknown> = {}) {
	return { people, filter: 'all', search: '', page: 1, ...overrides } as never;
}
const ok = (page: IdentityPeoplePage): Promise<PersonRegion<IdentityPeoplePage>> =>
	Promise.resolve({ status: 'ok', data: page });

beforeEach(() => {
	goto.mockClear();
	invalidate.mockClear();
});
afterEach(cleanup);

describe('People list', () => {
	it('shows a loading region until the page arrives, then the people', async () => {
		let answer!: (value: PersonRegion<IdentityPeoplePage>) => void;
		render(PeoplePage, { data: data(new Promise((resolve) => (answer = resolve))) });

		expect(screen.getByRole('status', { name: 'Loading people' })).toBeTruthy();
		answer({ status: 'ok', data: result([active]) });

		expect(await screen.findByRole('link', { name: 'Dana Reyes' })).toBeTruthy();
		expect(screen.queryByRole('status', { name: 'Loading people' })).toBeNull();
	});

	it('opens an account from its name and a not-set-up person from the request', async () => {
		render(PeoplePage, { data: data(ok(result([active, waiting]))) });

		expect((await screen.findByRole('link', { name: 'Dana Reyes' })).getAttribute('href')).toBe(
			`/admin/people/${ACTIVE}`
		);
		expect(screen.getByRole('link', { name: 'Sam Rivera' }).getAttribute('href')).toBe(
			`/admin/people/not-set-up/${WAITING}`
		);
	});

	it('names the state of each person without relying on colour', async () => {
		render(PeoplePage, { data: data(ok(result([active, waiting]))) });

		const rows = await screen.findAllByRole('listitem');
		expect(within(rows[0]).getByText('Active')).toBeTruthy();
		expect(within(rows[1]).getByText('Not set up')).toBeTruthy();
	});

	it('keeps the search and filter and offers a retry when the list cannot be loaded', async () => {
		render(PeoplePage, {
			data: data(Promise.resolve({ status: 'error', message: 'down' }), { filter: 'suspended', search: 'dana' })
		});

		await fireEvent.click(await screen.findByRole('button', { name: 'Retry People' }));

		expect(invalidate).toHaveBeenCalledWith('admin:people');
		expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('dana');
	});

	it('treats a rejected read as a load error, not a broken page', async () => {
		render(PeoplePage, { data: data(Promise.reject(new Error('boom'))) });

		expect(await screen.findByRole('button', { name: 'Retry People' })).toBeTruthy();
	});

	it('goes to the filter the person picks, starting from the first page', async () => {
		render(PeoplePage, { data: data(ok(result([active])), { page: 3 }) });

		await fireEvent.click(await screen.findByRole('radio', { name: 'Not set up' }));

		await waitFor(() => expect(goto).toHaveBeenCalled());
		expect(String(goto.mock.calls[0][0])).toBe('/admin/people?filter=notSetUp');
	});

	it('offers a way back from an empty search', async () => {
		render(PeoplePage, { data: data(ok(result([])), { search: 'zzz' }) });

		await fireEvent.click(await screen.findByRole('button', { name: 'Clear search and filter' }));

		expect(String(goto.mock.calls[0][0])).toBe('/admin/people');
	});
});
