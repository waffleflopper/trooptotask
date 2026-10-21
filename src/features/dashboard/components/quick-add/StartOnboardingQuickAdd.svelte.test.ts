// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import type { DashboardRecordChange } from '../../dashboardPageUpdates';
import StartOnboardingQuickAdd from './StartOnboardingQuickAdd.svelte';

const { startPacket } = vi.hoisted(() => ({ startPacket: vi.fn() }));
vi.mock('$features/onboarding', async () => ({
	...(await vi.importActual<typeof import('$features/onboarding')>('$features/onboarding')),
	loadOnboardingStartOptions: async () => ({
		rankCatalog: [],
		rankCatalogUnavailable: false,
		templates: [{ id: 'template-1', name: 'Arrival' }],
		hasTemplateSteps: true
	}),
	startOnboardingPacket: startPacket
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const packet: PersonnelOnboarding = {
	id: 'packet-1',
	personnelId: 'person-1',
	startedAt: '2026-10-19',
	completedAt: null,
	cancelledAt: null,
	status: 'in_progress',
	templateId: 'template-1',
	steps: []
};

function openStart() {
	const saved: DashboardRecordChange[] = [];
	const refreshPopulations: string[][] = [];
	const model = {
		data: { orgId: 'org-1' },
		inputs: {
			personnel: [{ id: 'person-1', rank: 'SPC', lastName: 'Able', firstName: 'Synthetic', groupId: 'alpha' }],
			groups: [],
			page: { dashboard: { data: { activeOnboardings: [] } } }
		}
	} as unknown as DashboardScreenModel;
	const view = render(StartOnboardingQuickAdd, {
		props: {
			model,
			access: { can: () => true },
			onClose: vi.fn(),
			updates: {
				putRecord: (orgId, change) => {
					if (orgId === 'org-1') saved.push(change);
				},
				refreshSummary: () => {
					refreshPopulations.push(saved.map((change) => change.record.personnelId));
				}
			}
		}
	});
	return { ...view, saved, refreshPopulations };
}
async function submitStart() {
	await screen.findByRole('dialog', { name: 'Start Onboarding' });
	await fireEvent.click(await screen.findByRole('button', { name: 'Member' }));
	await fireEvent.click(await screen.findByRole('option', { name: 'SPC Able, Synthetic' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
}

describe('Start onboarding from the Dashboard', () => {
	it('refreshes the summary with the saved person already in the Dashboard population', async () => {
		startPacket.mockResolvedValue(packet);
		const view = openStart();
		await submitStart();
		await waitFor(() => expect(view.refreshPopulations).toEqual([['person-1']]));
		expect(view.saved).toEqual([{ list: 'activeOnboardings', record: packet }]);
	});

	it('keeps a failed start out of the population and permits another attempt', async () => {
		startPacket.mockRejectedValueOnce(new Error('Start failed')).mockResolvedValueOnce(packet);
		const view = openStart();
		await submitStart();
		await screen.findByRole('alert');
		expect(view.saved).toEqual([]);
		expect(view.refreshPopulations).toEqual([]);
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
		await waitFor(() => expect(view.refreshPopulations).toEqual([['person-1']]));
	});
});
