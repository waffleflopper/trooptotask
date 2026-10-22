// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { OnboardingTemplate } from '../onboarding.types';
import { onboardingStore } from '../stores/onboarding.svelte';
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
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('StartOnboardingModal', () => {
	it('offers existing members without an Add Person action when Personnel create is denied', () => {
		render(StartOnboardingModal, {
			props: {
				personnel,
				canAddPerson: false,
				existingOnboardingPersonnelIds: [],
				groups: [],
				rankCatalogUnavailable: false,
				rankCatalog: [],
				templates: [template],
				onSubmit: vi.fn(),
				onAddPerson: vi.fn(),
				onClose: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'Member' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add Person' })).toBeNull();
	});

	it('renders as an accessible app dialog and preserves the disabled template-required state', () => {
		render(StartOnboardingModal, {
			props: {
				personnel,
				canAddPerson: true,
				existingOnboardingPersonnelIds: [],
				groups: [],
				rankCatalogUnavailable: false,
				rankCatalog: [],
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

	it('submits the selected member, start date, and template and closes only after confirmed save', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
		let confirm!: (saved: boolean) => void;
		const onSubmit = vi.fn(
			() =>
				new Promise<boolean>((resolve) => {
					confirm = resolve;
				})
		);
		const onClose = vi.fn();

		render(StartOnboardingModal, {
			props: {
				personnel,
				canAddPerson: true,
				existingOnboardingPersonnelIds: [],
				groups: [],
				rankCatalogUnavailable: false,
				rankCatalog: [],
				templates: [template],
				onSubmit,
				onAddPerson: vi.fn(),
				onClose
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
		expect(onClose).not.toHaveBeenCalled();
		expect((screen.getByRole('button', { name: /Start Onboarding/ }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: /Start Onboarding/ }));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		confirm(true);

		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(onSubmit).toHaveBeenCalledWith('person-1', '2026-03-15', 'template-1');
		});
	});

	it.each([
		[409, 'Soldier already has an active onboarding'],
		[500, 'Internal server error']
	])('keeps the dialog open and shows the reason for a %i', async (status, serverMessage) => {
		onboardingStore.load([], 'org-1');
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
		const onClose = vi.fn();
		render(StartOnboardingModal, {
			props: {
				personnel,
				canAddPerson: true,
				existingOnboardingPersonnelIds: [],
				groups: [],
				rankCatalogUnavailable: false,
				rankCatalog: [],
				templates: [template],
				onSubmit: async (personnelId: string, startedAt: string, templateId: string | null) =>
					(await onboardingStore.startOnboarding(personnelId, startedAt, templateId)) !== null,
				onAddPerson: vi.fn(),
				onClose
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));

		const alert = await screen.findByRole('alert');
		if (status === 409) {
			expect(alert.textContent).toContain(serverMessage);
		} else {
			expect(alert.textContent).toMatch(/\S/);
			expect(alert.textContent).not.toContain(serverMessage);
		}
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Member' }).textContent).toContain('SGT Smith, Jane');
		expect(onboardingStore.items).toEqual([]);
	});

	it('does not close a replacement dialog when a dismissed submission later succeeds', async () => {
		let confirm!: (saved: boolean) => void;
		const onSubmit = vi.fn(
			() =>
				new Promise<boolean>((resolve) => {
					confirm = resolve;
				})
		);
		const onClose = vi.fn();
		const props = {
			personnel,
			canAddPerson: false,
			existingOnboardingPersonnelIds: [],
			groups: [],
			rankCatalogUnavailable: false,
			rankCatalog: [],
			templates: [template],
			onSubmit,
			onAddPerson: vi.fn(),
			onClose
		};
		const first = render(StartOnboardingModal, { props });
		await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
		first.unmount();
		render(StartOnboardingModal, { props });
		confirm(true);
		await onSubmit.mock.results[0].value;
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Start Onboarding' })).toBeTruthy();
	});

	it('keeps focus in the dialog while a held submission disables Start and still closes', async () => {
		const onSubmit = vi.fn(() => new Promise<boolean>(() => {}));
		const onClose = vi.fn();
		render(StartOnboardingModal, {
			props: {
				personnel,
				canAddPerson: false,
				existingOnboardingPersonnelIds: [],
				groups: [],
				rankCatalogUnavailable: false,
				rankCatalog: [],
				templates: [template],
				onSubmit,
				onAddPerson: vi.fn(),
				onClose
			}
		});
		const dialog = screen.getByRole('dialog', { name: 'Start Onboarding' });
		await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SGT Smith, Jane' }));
		const start = screen.getByRole('button', { name: 'Start Onboarding' }) as HTMLButtonElement;
		start.focus();

		await fireEvent.click(start);

		expect(start.disabled).toBe(true);
		await waitFor(() => expect(document.activeElement).toBe(dialog));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalledTimes(1);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it('uses the local calendar date for the default start date', async () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Anchorage';
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));
		const onSubmit = vi.fn().mockResolvedValue(true);

		try {
			render(StartOnboardingModal, {
				props: {
					personnel,
					canAddPerson: true,
					existingOnboardingPersonnelIds: [],
					groups: [],
					rankCatalogUnavailable: false,
					rankCatalog: [],
					templates: [template],
					onSubmit,
					onAddPerson: vi.fn(),
					onClose: vi.fn()
				}
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
			await fireEvent.click(await screen.findByRole('option', { name: 'SGT Smith, Jane' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));

			await waitFor(() => {
				expect(onSubmit).toHaveBeenCalledWith('person-1', '2026-05-04', 'template-1');
			});
		} finally {
			vi.useRealTimers();
			if (originalTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimezone;
			}
		}
	});
});
