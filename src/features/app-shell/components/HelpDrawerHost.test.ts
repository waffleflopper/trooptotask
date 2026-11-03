// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import HelpDrawerHost, { type HelpModule } from './HelpDrawerHost.svelte';

afterEach(cleanup);

const noAccess: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

function renderHost(load: () => Promise<HelpModule>, onClose = vi.fn()) {
	render(HelpDrawerHost, {
		props: {
			load,
			viewer: { role: 'member', capabilityMap: noAccess, scopeKind: 'organization', disabledFeatures: [] },
			routeKey: 'calendar',
			orgUrlSegment: 'c-co',
			url: new URL('https://example.test/org/c-co/calendar?help='),
			guideId: null,
			onOpenGuide: vi.fn(),
			onShowList: vi.fn(),
			onClose,
			onFeedback: vi.fn()
		}
	});
	return { onClose };
}

describe('Help drawer host', () => {
	it('keeps the Help frame with a way to retry or close when the chunk fails to load', { timeout: 15000 }, async () => {
		const user = userEvent.setup();
		const load = vi
			.fn<() => Promise<HelpModule>>()
			.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
			.mockImplementation(() => import('$features/help'));
		const { onClose } = renderHost(load);

		expect(await screen.findByRole('alert')).toHaveTextContent('Help could not load');
		expect(screen.getByRole('complementary', { name: 'Help' })).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Try again' }));

		expect(await screen.findByRole('searchbox', { name: 'Search guides' }, { timeout: 8000 })).toBeInTheDocument();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('closes from the failure state', async () => {
		const user = userEvent.setup();
		const { onClose } = renderHost(() => Promise.reject(new Error('offline')));

		await user.click(await screen.findByRole('button', { name: 'Close help' }));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});
});
