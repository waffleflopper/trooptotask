// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DemoBanner from './DemoBanner.svelte';
import { demoModeStore } from '$lib/stores/demoMode.svelte';

afterEach(() => {
	cleanup();
	demoModeStore.load(false, false);
	demoModeStore.closeSandboxModal();
});

describe('DemoBanner', () => {
	it('renders the read-only demo banner through shared alert and opens the sandbox request', async () => {
		demoModeStore.load(true, false);

		render(DemoBanner);

		const alert = screen.getByRole('alert');
		expect(alert.getAttribute('data-slot')).toBe('alert');
		expect(screen.getByText(/read-only demo/i)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /try editing/i }));
		expect(demoModeStore.showSandboxModal).toBe(true);
	});

	it('renders the sandbox expiration banner through shared alert', () => {
		demoModeStore.load(false, true);

		render(DemoBanner);

		expect(screen.getByRole('alert').getAttribute('data-slot')).toBe('alert');
		expect(screen.getByText(/demo sandbox/i)).toBeTruthy();
		expect(screen.getByText(/expires in ~1 hour/i)).toBeTruthy();
	});
});
