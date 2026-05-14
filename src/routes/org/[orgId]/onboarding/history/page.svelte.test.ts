// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';

afterEach(() => {
	cleanup();
	onboardingStore.load([], 'org-1');
});

describe('onboarding history page', () => {
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
