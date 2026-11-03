// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import HelpDrawerHost, { type HelpModule } from './HelpDrawerHost.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

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
	it('keeps the Help frame with a reload and a close when the chunk fails to load', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		const user = userEvent.setup();
		renderHost(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));

		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(screen.getByRole('complementary', { name: 'Help' })).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Reload page' }));

		expect(reload).toHaveBeenCalledOnce();
	});

	it('closes from the failure state', async () => {
		const user = userEvent.setup();
		const { onClose } = renderHost(() => Promise.reject(new Error('offline')));

		await user.click(await screen.findByRole('button', { name: 'Close help' }));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});
});
