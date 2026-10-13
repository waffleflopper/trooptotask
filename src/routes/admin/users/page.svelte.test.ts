// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
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

function usersData(overrides: Record<string, unknown> = {}) {
	return {
		users: [],
		totalCount: 0,
		page: 3,
		limit: 20,
		search: '',
		authError: null,
		...overrides
	} as unknown as PageData;
}

const searchbox = () => screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement;

describe('users toolbar', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('applies the search from the first page once typing pauses, keeping focus on the field', async () => {
		render(UsersPage, { data: usersData() });
		searchbox().focus();
		await fireEvent.input(searchbox(), { target: { value: 'a&b' } });
		await fireEvent.input(searchbox(), { target: { value: 'a&b@example.mil' } });
		await vi.advanceTimersByTimeAsync(299);
		expect(goto).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(goto).toHaveBeenCalledOnce();
		expect(goto).toHaveBeenLastCalledWith('/admin/users?search=a%26b%40example.mil&page=1', { keepFocus: true });
		expect(document.activeElement).toBe(searchbox());
	});

	it('drops the search key when the field is cleared', async () => {
		render(UsersPage, { data: usersData({ search: 'soldier' }) });
		expect(searchbox().value).toBe('soldier');
		await fireEvent.input(searchbox(), { target: { value: '' } });
		await vi.advanceTimersByTimeAsync(300);
		expect(goto).toHaveBeenLastCalledWith('/admin/users?page=1', { keepFocus: true });
	});

	it('has no Apply button and links Open Access Requests from the toolbar', () => {
		render(UsersPage, { data: usersData() });
		const toolbar = within(screen.getByRole('toolbar', { name: 'Users controls' }));
		expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
		expect(toolbar.getByRole('link', { name: 'Open Access Requests' }).getAttribute('href')).toBe(
			'/admin/access-requests'
		);
	});

	it('keeps newer typing when an earlier search finishes loading, then follows the URL again', async () => {
		const view = render(UsersPage, { data: usersData() });
		await fireEvent.input(searchbox(), { target: { value: 'ab' } });
		await vi.advanceTimersByTimeAsync(300);
		await fireEvent.input(searchbox(), { target: { value: 'abc' } });

		await view.rerender({ data: usersData({ search: 'ab' }) });
		expect(searchbox().value).toBe('abc');
		await vi.advanceTimersByTimeAsync(300);
		expect(goto).toHaveBeenLastCalledWith('/admin/users?search=abc&page=1', { keepFocus: true });

		await view.rerender({ data: usersData({ search: 'abc' }) });
		await view.rerender({ data: usersData({ search: '' }) });
		expect(searchbox().value).toBe('');
	});

	it('follows the URL back to an empty search after a committed search lands', async () => {
		const view = render(UsersPage, { data: usersData() });
		await fireEvent.input(searchbox(), { target: { value: 'abc' } });
		await vi.advanceTimersByTimeAsync(300);
		expect(goto).toHaveBeenLastCalledWith('/admin/users?search=abc&page=1', { keepFocus: true });

		await view.rerender({ data: usersData({ search: 'abc' }) });
		expect(searchbox().value).toBe('abc');
		await view.rerender({ data: usersData({ search: '' }) });
		expect(searchbox().value).toBe('');
	});
});
