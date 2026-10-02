// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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
		expect(screen.getByText('1/2 complete')).toBeTruthy();
	});

	it('controls single open packet behavior', async () => {
		render(OnboardingPacketListTest);

		expect(screen.getByRole('button', { name: /Jordan Lee/i }).getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('button', { name: /Morgan Price/i }).getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(screen.getByRole('button', { name: /Morgan Price/i }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Jordan Lee/i }).getAttribute('aria-expanded')).toBe('false');
			expect(screen.getByRole('button', { name: /Morgan Price/i }).getAttribute('aria-expanded')).toBe('true');
		});
	});

	it('renders saved step labels and removed work', () => {
		render(OnboardingPacketListTest);

		expect(screen.getByText('Training')).toBeTruthy();
		expect(screen.getByText('Removed from template')).toBeTruthy();
	});

	it('toggles independent notes and renders note count', async () => {
		render(OnboardingPacketListTest);

		const notesTrigger = screen.getByRole('button', { name: 'Toggle notes' });
		expect(within(notesTrigger).getByText('2')).toBeTruthy();
		expect(notesTrigger.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle notes' }));

		expect(screen.getByRole('button', { name: 'Toggle notes' }).getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByText('Bring packet to S1.')).toBeTruthy();
		expect(screen.getByText('Sponsor assigned.')).toBeTruthy();
		expect(screen.getByText('May 1')).toBeTruthy();
		expect(screen.getByText('May 2')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Jordan Lee/i }).getAttribute('aria-expanded')).toBe('true');
	});

	it('supports keyboard disclosure through the trigger', async () => {
		render(OnboardingPacketListTest);

		const trigger = screen.getByRole('button', { name: /Morgan Price/i });
		trigger.focus();
		await fireEvent.keyDown(trigger, { key: 'Enter' });

		await waitFor(() => {
			expect(trigger.getAttribute('aria-expanded')).toBe('true');
			expect(screen.getByRole('button', { name: /Jordan Lee/i }).getAttribute('aria-expanded')).toBe('false');
		});
	});
});
