// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';

afterEach(() => {
	cleanup();
	onboardingStore.load([], 'org-1');
});

describe('onboarding history page', () => {
	it('uses a floating toolbar to return to active onboarding', () => {
		onboardingStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1'
				}
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding history controls' });
		const nav = within(toolbar).getByRole('navigation', { name: 'Onboarding sections' });
		expect(within(nav).getByRole('link', { name: 'Onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');
		expect(screen.queryByRole('heading', { name: 'Onboarding History' })).toBeNull();
	});

	it('does not render redundant archived summary cards', () => {
		onboardingStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1'
				}
			}
		});

		expect(screen.queryByText('Completed or cancelled onboarding records')).toBeNull();
		expect(screen.queryByText('Packets closed successfully')).toBeNull();
		expect(screen.queryByText('Packets stopped before completion')).toBeNull();
	});
});
