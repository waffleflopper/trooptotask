// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import OnboardingPacketListTest from './OnboardingPacketListTest.svelte';

afterEach(() => {
	cleanup();
});

describe('OnboardingPacketList', () => {
	it('renders packet summaries and progress', () => {
		render(OnboardingPacketListTest);

		expect(screen.getByText('Jordan Lee')).toBeTruthy();
		expect(screen.getByText('Initial Entry')).toBeTruthy();
		expect(screen.getByText('2/4 complete')).toBeTruthy();
	});

	it('controls single open packet behavior', async () => {
		render(OnboardingPacketListTest);

		expect(screen.getByRole('button', { name: /Jordan Lee/i }).getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('button', { name: /Morgan Price/i }).getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(screen.getByRole('button', { name: /Morgan Price/i }));

		await waitFor(() => {
			expect(screen.getByTestId('expanded-value').textContent).toBe('packet-b');
			expect(screen.getByRole('button', { name: /Jordan Lee/i }).getAttribute('aria-expanded')).toBe('false');
			expect(screen.getByRole('button', { name: /Morgan Price/i }).getAttribute('aria-expanded')).toBe('true');
		});
	});

	it('renders action region, step rows, and step states', () => {
		render(OnboardingPacketListTest);

		expect(screen.getByRole('button', { name: 'Mark Complete' })).toBeTruthy();
		expect(screen.getByText('Training')).toBeTruthy();
		expect(screen.getByText('Paperwork')).toBeTruthy();
		expect(screen.getByText('Removed from template')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Record Training' })).toBeTruthy();
	});

	it('supports checkbox completion controls', async () => {
		render(OnboardingPacketListTest);

		const checkbox = screen.getByRole('checkbox', { name: 'Mark sponsor brief complete' });
		expect((checkbox as HTMLButtonElement).getAttribute('aria-checked')).toBe('false');

		await fireEvent.click(checkbox);
		expect((checkbox as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
	});

	it('toggles independent notes and renders note count', async () => {
		render(OnboardingPacketListTest);

		expect(screen.getByText('2')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Toggle notes' }).getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle notes' }));

		expect(screen.getByRole('button', { name: 'Toggle notes' }).getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByText('Bring packet to S1.')).toBeTruthy();
		expect(screen.getByText('Sponsor assigned.')).toBeTruthy();
	});

	it('renders disabled read-only and loading states', () => {
		render(OnboardingPacketListTest, { readOnly: true, loading: true });

		expect((screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Re-sync' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('checkbox', { name: 'Mark sponsor brief complete' }) as HTMLButtonElement).disabled).toBe(
			true
		);
	});

	it('wires accessible trigger and content relationships through accordion primitives', () => {
		render(OnboardingPacketListTest);

		const trigger = screen.getByRole('button', { name: /Jordan Lee/i });
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('data-state')).toBe('open');
	});

	it('supports keyboard disclosure through the trigger', async () => {
		render(OnboardingPacketListTest);

		const trigger = screen.getByRole('button', { name: /Morgan Price/i });
		trigger.focus();
		await fireEvent.keyDown(trigger, { key: 'Enter' });

		await waitFor(() => {
			expect(screen.getByTestId('expanded-value').textContent).toBe('packet-b');
		});
	});
});
