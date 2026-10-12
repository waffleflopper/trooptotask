// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(cleanup);

const member = {
	id: 'synthetic-user',
	app_metadata: {},
	user_metadata: {},
	aud: 'authenticated',
	created_at: '2026-09-25T00:00:00Z'
};

function bodyLinks(user: typeof member | null) {
	const { container } = render(Page, { props: { data: { viewer: null, user } } });
	return within(container.querySelector('main')!);
}

describe('about page actions', () => {
	it('offers reviewed access to a visitor', () => {
		const main = bodyLinks(null);

		expect(main.getByRole('link', { name: 'Request access' }).getAttribute('href')).toBe('/auth/request-access');
		expect(main.queryByRole('link', { name: 'Go to Dashboard' })).toBeNull();
	});

	it('sends a signed-in member to the dashboard instead of the access request', () => {
		const main = bodyLinks(member);

		expect(main.getByRole('link', { name: 'Go to Dashboard' }).getAttribute('href')).toBe('/dashboard?show=all');
		expect(main.queryByRole('link', { name: 'Request access' })).toBeNull();
		expect(screen.getAllByRole('link', { name: 'See how TroopToTask works' })).toHaveLength(1);
	});
});
