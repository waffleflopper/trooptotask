// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { SetupHint } from '../sections/dashboardSections';
import SetupHints from './SetupHints.svelte';

vi.mock('$lib/utils/browserStorage', () => ({ getBrowserLocalStorage: () => globalThis.localStorage }));

const hint = (feature: 'onboarding' | 'training', name: string): SetupHint => ({
	feature,
	message: `${name} is on, but nothing is set up yet, so it isn't shown here.`,
	fix: { label: `Set up ${name}`, href: `/org/org-1/${feature}` },
	turnOff: { label: `Turn off ${name.toLowerCase()}`, href: '/org/org-1/settings/features' }
});
const hints = [hint('onboarding', 'Onboarding'), hint('training', 'Training')];

describe('SetupHints', () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
	});

	it('links each gap to its fix and to Settings › Features', () => {
		render(SetupHints, { props: { hints, orgId: 'org-1', userId: 'user-1' } });

		expect(screen.getByRole('link', { name: 'Set up Onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');
		expect(screen.getByRole('link', { name: 'Turn off onboarding' }).getAttribute('href')).toBe(
			'/org/org-1/settings/features'
		);
	});

	it('keeps a dismissed hint hidden for that member and unit after the page reloads', async () => {
		render(SetupHints, { props: { hints, orgId: 'org-1', userId: 'user-1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss the Onboarding hint' }));
		expect(screen.queryByText(/Onboarding is on/)).toBeNull();
		cleanup();

		render(SetupHints, { props: { hints, orgId: 'org-1', userId: 'user-1' } });
		expect(screen.queryByText(/Onboarding is on/)).toBeNull();
		expect(screen.getByText(/Training is on/)).toBeTruthy();
		cleanup();

		render(SetupHints, { props: { hints, orgId: 'org-1', userId: 'user-2' } });
		expect(screen.getByText(/Onboarding is on/)).toBeTruthy();
		cleanup();

		render(SetupHints, { props: { hints, orgId: 'org-2', userId: 'user-1' } });
		expect(screen.getByText(/Onboarding is on/)).toBeTruthy();
	});
});
