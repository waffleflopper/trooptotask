// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AdminPager from './AdminPager.svelte';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

afterEach(() => {
	cleanup();
	goto.mockReset();
});

const pageHref = (page: number) => `/admin/people?page=${page}`;

function renderPager(page: number, totalPages: number) {
	const view = render(AdminPager, { page, totalPages, pageHref });
	goto.mockImplementation(async (href: string) => {
		await view.rerender({
			page: Number(new URL(href, 'http://localhost').searchParams.get('page')),
			totalPages,
			pageHref
		});
	});
	return view;
}

describe('AdminPager', () => {
	it('keeps focus on Next while another page remains', async () => {
		renderPager(1, 3);
		const next = screen.getByRole('button', { name: 'Next' });
		next.focus();

		await fireEvent.click(next);

		await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeTruthy());
		expect(goto).toHaveBeenCalledWith('/admin/people?page=2', { keepFocus: true });
		expect(document.activeElement).toBe(next);
	});

	it('moves focus to Previous when Next reaches the last page', async () => {
		renderPager(1, 2);
		const next = screen.getByRole('button', { name: 'Next' });
		next.focus();

		await fireEvent.click(next);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous' })));
		expect((next as HTMLButtonElement).disabled).toBe(true);
	});

	it('moves focus to Next when Previous reaches the first page', async () => {
		renderPager(2, 2);
		const previous = screen.getByRole('button', { name: 'Previous' });
		previous.focus();

		await fireEvent.click(previous);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' })));
	});

	it('names the pager and renders nothing for a single page', () => {
		const { unmount } = render(AdminPager, { page: 1, totalPages: 2, pageHref });
		expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy();
		unmount();

		render(AdminPager, { page: 1, totalPages: 1, pageHref });
		expect(screen.queryByRole('navigation')).toBeNull();
	});
});
