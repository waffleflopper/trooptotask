// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$lib/types';
import type { OnboardingTemplate } from '../onboarding.types';
import StartOnboardingModal from './StartOnboardingModal.svelte';

const personnel = [
	{
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: null,
		groupName: ''
	}
] as Personnel[];

const template: OnboardingTemplate = {
	id: 'template-1',
	orgId: 'org-1',
	name: 'Standard Inprocessing',
	description: null,
	createdAt: '2026-03-01'
};

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('StartOnboardingModal', () => {
	it('renders as an accessible app dialog and preserves the disabled template-required state', () => {
		render(StartOnboardingModal, {
			props: {
				personnel,
				existingOnboardingPersonnelIds: [],
				groups: [],
				templates: [template],
				hasTemplateSteps: false,
				onSubmit: vi.fn(),
				onAddPerson: vi.fn(),
				onClose: vi.fn()
			}
		});

		expect(screen.getByRole('dialog', { name: 'Start Onboarding' })).toBeTruthy();
		expect(screen.getByText('Template Required')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Start Onboarding' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('submits the selected member, start date, and template through the existing close-first flow', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
		const onSubmit = vi.fn();
		const onClose = vi.fn();

		render(StartOnboardingModal, {
			props: {
				personnel,
				existingOnboardingPersonnelIds: [],
				groups: [],
				templates: [template],
				onSubmit,
				onAddPerson: vi.fn(),
				onClose
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));

		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(onSubmit).toHaveBeenCalledWith('person-1', '2026-03-15', 'template-1');
		});
	});
});
