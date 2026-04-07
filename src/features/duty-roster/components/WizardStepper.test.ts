// @vitest-environment happy-dom
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import WizardStepper from './WizardStepper.svelte';

describe('WizardStepper', () => {
	it('marks the active step with aria-current', () => {
		render(WizardStepper, {
			steps: [
				{ id: 'template', label: 'Choose Template' },
				{ id: 'policy', label: 'Review Policy' },
				{ id: 'preview', label: 'Preview & Apply' }
			],
			current: 'policy'
		});

		expect(screen.getByText('Review Policy').getAttribute('aria-current')).toBe('step');
		expect(screen.getByText('Choose Template').getAttribute('aria-current')).toBeNull();
		expect(screen.getByText('Preview & Apply').getAttribute('aria-current')).toBeNull();
	});
});
