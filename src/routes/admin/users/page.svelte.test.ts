// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import UsersPage from './+page.svelte';
import type { PageData } from './$types';

const { goto } = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/admin/users?page=1') }) };
});

afterEach(() => {
	cleanup();
	goto.mockClear();
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

it('applies the search from the first page and keeps focus on the control that applied it', async () => {
	render(UsersPage, {
		data: {
			users: [],
			totalCount: 0,
			page: 3,
			limit: 20,
			search: '',
			authError: null
		} as unknown as PageData
	});
	const input = screen.getByRole('textbox', { name: 'Search' });
	await fireEvent.input(input, { target: { value: 'a&b@example.mil' } });

	input.focus();
	await fireEvent.submit(input.closest('form')!);
	expect(goto).toHaveBeenLastCalledWith('/admin/users?search=a%26b%40example.mil&page=1', { keepFocus: true });

	const apply = screen.getByRole('button', { name: 'Apply' });
	apply.focus();
	await fireEvent.click(apply);
	expect(goto).toHaveBeenCalledTimes(2);
	expect(goto).toHaveBeenLastCalledWith('/admin/users?search=a%26b%40example.mil&page=1', { keepFocus: true });
});
