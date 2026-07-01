// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({ destroy: vi.fn() })
}));

afterEach(() => {
	cleanup();
});

describe('account profile page', () => {
	it('explains that profile rank is not scoped to an Organization rank catalog', () => {
		render(ProfilePage, {
			props: {
				data: {
					session: null,
					accountPathname: '/account/profile',
					profile: {
						userId: 'user-1',
						firstName: 'Emma',
						lastName: 'Hayes',
						rank: 'CPT'
					},
					ranks: ['CPT', 'SGT']
				},
				form: null
			}
		});

		expect(
			screen.getByText(
				'This account-level rank uses the registration rank list and is not connected to any Organization rank catalog.'
			)
		).toBeTruthy();
	});
});
