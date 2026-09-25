// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({
	enhance: () => {}
}));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
});

function makePageData(overrides: Partial<PageData> = {}): PageData {
	return {
		user: {
			id: '11111111-1111-4111-8111-111111111111',
			email: 'soldier@example.mil',
			createdAt: '2026-06-01T00:00:00.000Z',
			lastSignInAt: null,
			emailConfirmedAt: null,
			emailConfirmationStatus: 'pending'
		},
		organizations: [],
		suspension: null,
		isSuspended: false,
		recentActivity: [],
		...overrides
	} as PageData;
}

describe('admin user detail page', () => {
	it('prioritizes visible success toasts over stale form errors', () => {
		render(Page, {
			props: {
				data: makePageData(),
				form: {
					success: true,
					message: 'Invite email resent',
					error: 'Previous form error'
				} as never
			}
		});

		expect(screen.getByText('Invite email resent')).toBeTruthy();
		expect(screen.queryByText('Previous form error')).toBeNull();
	});

	it('offers resend invite only while account confirmation is pending', () => {
		render(Page, { props: { data: makePageData(), form: null } });
		expect(screen.getByRole('button', { name: 'Resend Invite' })).toBeTruthy();
		cleanup();
		render(Page, {
			props: {
				data: makePageData({
					user: { ...makePageData().user, emailConfirmationStatus: 'confirmed' }
				}),
				form: null
			}
		});
		expect(screen.queryByRole('button', { name: 'Resend Invite' })).toBeNull();
	});
});
