// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(cleanup);

describe('landing page', () => {
	it('opens with one heading and sends a visitor to reviewed access', () => {
		const { container } = render(Page, { props: { data: { session: null, user: null } } });
		const main = within(container.querySelector('main')!);

		expect(main.getAllByRole('heading', { level: 1 })).toHaveLength(1);
		expect(main.getByRole('link', { name: 'Request access' })).toHaveAttribute('href', '/auth/request-access');
		expect(main.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
		expect(container.querySelector('#faq')).not.toBeNull();
	});

	it('sends an admitted user to the dashboard', () => {
		const { container } = render(Page, {
			props: {
				data: {
					session: null,
					user: {
						id: 'synthetic-user',
						app_metadata: {},
						user_metadata: {},
						aud: 'authenticated',
						created_at: '2026-09-25T00:00:00Z'
					}
				}
			}
		});
		const main = within(container.querySelector('main')!);

		expect(main.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard?show=all');
		expect(main.queryByRole('link', { name: 'Request access' })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard?show=all');
	});
});
