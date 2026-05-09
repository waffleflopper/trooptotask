// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import StepperPrimitiveTest from './StepperPrimitiveTest.svelte';
import LegacyStepper from '../Stepper.svelte';

afterEach(() => {
	cleanup();
});

describe('ui/stepper', () => {
	it('renders an accessible progress list with active, completed, disabled, and error state hooks', () => {
		const { container } = render(StepperPrimitiveTest);
		const progress = screen.getByRole('list', { name: 'Primary progress' });

		expect(progress).toBeTruthy();
		expect(
			within(progress)
				.getByRole('button', { name: /Step 2:\s*Profile/ })
				.getAttribute('aria-current')
		).toBe('step');
		expect(screen.getByText('Profile content')).toBeTruthy();
		expect(screen.queryByText('Account content')).toBeNull();
		expect(container.querySelector('[data-slot="stepper-item"][data-state="completed"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="stepper-item"][data-state="disabled"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="stepper-item"][data-state="error"]')).toBeTruthy();
	});

	it('moves focus with keyboard navigation without changing the selected step', async () => {
		render(StepperPrimitiveTest);
		const progress = screen.getByRole('list', { name: 'Primary progress' });

		const account = within(progress).getByRole('button', { name: /Step 1:\s*Account/ });
		const profile = within(progress).getByRole('button', { name: /Step 2:\s*Profile/ });

		account.focus();
		await fireEvent.keyDown(account, { key: 'ArrowRight' });

		expect(document.activeElement).toBe(profile);
		expect(screen.getByTestId('current-value').textContent).toContain('profile');
	});

	it('runs navigation guards before moving next', async () => {
		render(StepperPrimitiveTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

		expect(screen.getByTestId('guarded-value').textContent).toContain('account');
		expect(screen.getByText('Guarded account')).toBeTruthy();
	});

	it('keeps the legacy stages/currentStage wrapper working', async () => {
		let selected = 'Submitted';
		render(LegacyStepper, {
			props: {
				stages: ['Issued', 'Submitted', 'Reviewed'],
				currentStage: selected,
				onStageClick: (stage: string) => {
					selected = stage;
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Step 3:\s*Reviewed/ }));

		expect(selected).toBe('Reviewed');
	});
});
