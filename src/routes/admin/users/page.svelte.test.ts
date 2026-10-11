// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import UsersPage from './+page.svelte';
import type { PageData } from './$types';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/admin/users?page=1') }) };
});

afterEach(() => {
	cleanup();
});

it('names each Inspect action by its account', () => {
	render(UsersPage, {
		data: {
			users: [
				{
					id: '11111111-1111-4111-8111-111111111111',
					email: 'soldier@example.mil',
					organizationCount: 1,
					createdAt: '2026-06-01T00:00:00.000Z',
					isSuspended: false,
					emailConfirmationStatus: 'confirmed'
				}
			],
			totalCount: 1,
			page: 1,
			limit: 20,
			search: '',
			authError: null
		} as unknown as PageData
	});

	expect(screen.getByRole('link', { name: 'Inspect soldier@example.mil' }).getAttribute('href')).toBe(
		'/admin/users/11111111-1111-4111-8111-111111111111'
	);
});
