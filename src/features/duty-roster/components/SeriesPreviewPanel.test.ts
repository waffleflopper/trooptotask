// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type {
	DutyEventPreview,
	DutyEventPreviewSlotInstance,
	DutyEventSeriesPreview,
	DutyTemplate
} from '../duty-roster.types';
import type { Personnel } from '$lib/types';
import SeriesPreviewPanel from './SeriesPreviewPanel.svelte';

afterEach(() => {
	cleanup();
});

function makeSlot(
	overrides: Partial<DutyEventPreviewSlotInstance> & { roleLabel: string; slotIndex: number }
): DutyEventPreviewSlotInstance {
	const { roleLabel, slotIndex, ...rest } = overrides;

	return {
		templateSlotId: `slot-${roleLabel.toLowerCase()}-${slotIndex}`,
		roleLabel,
		slotIndex,
		assigneeId: 'person-nolan',
		assignmentSource: 'generated',
		warningState: 'none',
		fairnessConfidence: 'high',
		selectionReason: 'Longest break in pool',
		unfilledReason: null,
		sortOrder: slotIndex,
		...rest
	};
}

function makeEvent(eventDate: string, slotInstances: DutyEventPreviewSlotInstance[]): DutyEventPreview {
	return {
		templateId: 'template-1',
		templateName: 'Battalion Staff Duty',
		eventDate,
		coverageMode: 'timed',
		coverageStart: '08:00',
		coverageEnd: '08:00',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: {
			templateId: 'template-1',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			spansMidnight: true,
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 24,
			slots: []
		},
		fillSummary: {
			totalSlots: slotInstances.length,
			filledSlots: slotInstances.filter((slot) => slot.assigneeId).length,
			unfilledSlots: slotInstances.filter((slot) => !slot.assigneeId).length
		},
		collisionSummary: { hasConflicts: false, conflicts: [] },
		slotInstances
	};
}

const personnelOptions: Personnel[] = [
	{
		id: 'person-nolan',
		firstName: 'Casey',
		lastName: 'Nolan',
		rank: 'SGT',
		groupId: 'group-hq',
		groupName: 'HQ',
		mos: '11B',
		clinicRole: 'NCO',
		archivedAt: null
	},
	{
		id: 'person-chen',
		firstName: 'Avery',
		lastName: 'Chen',
		rank: 'SPC',
		groupId: 'group-alpha',
		groupName: 'Alpha',
		mos: '25B',
		clinicRole: 'Runner',
		archivedAt: null
	}
];

const template: DutyTemplate = {
	id: 'template-1',
	orgId: 'org-1',
	mode: 'advanced',
	status: 'active',
	name: 'Battalion Staff Duty',
	description: null,
	scopeType: 'organization',
	scopeGroupIds: [],
	exemptPersonnelIds: [],
	coverageMode: 'timed',
	startTime: '08:00',
	endTime: '08:00',
	spansMidnight: true,
	isBlocking: true,
	cooldownHours: 24,
	softPreferences: [],
	createdAt: '',
	updatedAt: '',
	slots: [
		{
			id: 'slot-nco-0',
			templateId: 'template-1',
			roleLabel: 'NCO',
			quantity: 1,
			allowedRanks: [],
			allowedGroupIds: [],
			preferredGroupIds: [],
			allowedMosValues: [],
			allowedRoleValues: [],
			rotationPoolKey: 'NCO',
			sortOrder: 0
		},
		{
			id: 'slot-runner-0',
			templateId: 'template-1',
			roleLabel: 'Runner',
			quantity: 1,
			allowedRanks: [],
			allowedGroupIds: [],
			preferredGroupIds: [],
			allowedMosValues: [],
			allowedRoleValues: [],
			rotationPoolKey: 'Runner',
			sortOrder: 1
		}
	],
	rotationBaselines: []
};

const preview: DutyEventSeriesPreview = {
	snapshotId: 'snapshot-series-1',
	snapshotFingerprint: 'fingerprint-series-1',
	snapshotVersion: 1,
	templateId: 'template-1',
	templateName: 'Battalion Staff Duty',
	pattern: 'custom-dates',
	eventDates: ['2026-05-01', '2026-05-02'],
	events: [
		makeEvent('2026-05-01', [
			makeSlot({
				roleLabel: 'NCO',
				slotIndex: 0,
				templateSlotId: 'slot-nco-0',
				candidateRankings: [
					{ personnelId: 'person-nolan', rank: 1 },
					{ personnelId: 'person-chen', rank: 2 }
				]
			}),
			makeSlot({ roleLabel: 'Runner', slotIndex: 0, templateSlotId: 'slot-runner-0', assigneeId: 'person-chen' })
		]),
		makeEvent('2026-05-02', [
			makeSlot({ roleLabel: 'NCO', slotIndex: 0, templateSlotId: 'slot-nco-0' }),
			makeSlot({ roleLabel: 'Runner', slotIndex: 0, templateSlotId: 'slot-runner-0', assigneeId: null })
		])
	]
};

function renderPanel(overrides: Partial<Record<string, unknown>> = {}) {
	return render(SeriesPreviewPanel, {
		props: {
			preview,
			template,
			isRefreshing: false,
			isApplying: false,
			collisionReviewConfirmed: false,
			shortfallReviewConfirmed: false,
			previewCollisionMessages: [],
			personnelOptions,
			formatAssignee: (id: string | null) =>
				personnelOptions.find((person) => person.id === id)?.lastName ?? 'Unfilled',
			formatCoverageLabel: () => '0800-0800',
			getExplanationSections: () => [],
			hasSeriesSlotOverride: () => false,
			onApply: vi.fn(),
			onCollisionConfirmedChange: vi.fn(),
			onShortfallConfirmedChange: vi.fn(),
			onUpdateSlotAssignee: vi.fn(),
			onToggleSlotLock: vi.fn(),
			onClearSlot: vi.fn(),
			onResetSlot: vi.fn(),
			...overrides
		}
	});
}

describe('SeriesPreviewPanel', () => {
	it('renders advanced duty slot proposals in a dense table with date and pool filters', async () => {
		renderPanel();

		const table = screen.getByRole('table', { name: 'Advanced duty run review' });
		for (const column of ['Date', 'Coverage', 'Slot', 'Proposed Soldier', 'Source', 'Issue', 'Actions']) {
			expect(within(table).getByRole('columnheader', { name: column })).toBeTruthy();
		}
		expect(
			within(table).getByRole('row', { name: /2026-05-01 0800-0800 NCO #1 .*Nolan Generated No issue/ })
		).toBeTruthy();
		expect(within(table).getByRole('row', { name: /2026-05-02 0800-0800 Runner #1 .*Unfilled Unfilled/ })).toBeTruthy();

		await fireEvent.change(screen.getByLabelText('Filter by date'), { target: { value: '2026-05-02' } });
		await waitFor(() => expect(within(table).queryByRole('row', { name: /2026-05-01/ })).toBeNull());
		expect(within(table).getAllByRole('row', { name: /2026-05-02/ })).toHaveLength(2);

		await fireEvent.change(screen.getByLabelText('Filter by rotation pool'), { target: { value: 'Runner' } });
		await waitFor(() =>
			expect(within(table).getByRole('row', { name: /2026-05-02 0800-0800 Runner #1/ })).toBeTruthy()
		);
		expect(within(table).queryByRole('row', { name: /NCO #1/ })).toBeNull();
	});

	it('keeps replace, lock, clear, and reset controls wired to slot review callbacks', async () => {
		const onUpdateSlotAssignee = vi.fn();
		const onToggleSlotLock = vi.fn();
		const onClearSlot = vi.fn();
		const onResetSlot = vi.fn();
		renderPanel({
			hasSeriesSlotOverride: (eventDate: string, slot: DutyEventPreviewSlotInstance) =>
				eventDate === '2026-05-01' && slot.roleLabel === 'NCO',
			onUpdateSlotAssignee,
			onToggleSlotLock,
			onClearSlot,
			onResetSlot
		});

		await fireEvent.change(screen.getByLabelText('Assignee for 2026-05-01 NCO #1'), {
			target: { value: 'person-chen' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Lock 2026-05-01 NCO #1' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Clear 2026-05-01 NCO #1' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset 2026-05-01 NCO #1' }));

		expect(onUpdateSlotAssignee).toHaveBeenCalledWith(
			'2026-05-01',
			expect.objectContaining({ roleLabel: 'NCO' }),
			'person-chen'
		);
		expect(onToggleSlotLock).toHaveBeenCalledWith('2026-05-01', expect.objectContaining({ roleLabel: 'NCO' }));
		expect(onClearSlot).toHaveBeenCalledWith('2026-05-01', expect.objectContaining({ roleLabel: 'NCO' }));
		expect(onResetSlot).toHaveBeenCalledWith('2026-05-01', expect.objectContaining({ roleLabel: 'NCO' }));
	});

	it('labels replacement choices with the generator rotation order and next-up person', () => {
		renderPanel();

		const assigneeSelect = screen.getByLabelText('Assignee for 2026-05-01 NCO #1') as HTMLSelectElement;
		const optionLabels = Array.from(assigneeSelect.options).map((option) => option.textContent);

		expect(optionLabels).toContain('SGT Nolan (current pick, #1)');
		expect(optionLabels).toContain('SPC Chen (next up, #2)');
	});

	it('keeps assignment rationale attached to the table row instead of duplicating notes below the table', async () => {
		renderPanel({
			getExplanationSections: (slot: DutyEventPreviewSlotInstance) =>
				slot.roleLabel === 'NCO'
					? [
							{
								label: 'Fairness confidence',
								lines: ['High confidence: longest break in pool.'],
								tone: 'neutral'
							},
							{
								label: 'Why selected',
								lines: ['SGT Nolan has the longest eligible break since last staff duty.'],
								tone: 'neutral'
							}
						]
					: []
		});

		expect(screen.queryByRole('region', { name: 'Advanced duty review notes' })).toBeNull();

		const detailsButton = screen.getByLabelText('Show assignment details for 2026-05-01 NCO #1');
		const details = detailsButton.closest('details');
		expect(details).toBeTruthy();
		expect(details?.open).toBe(false);

		await fireEvent.click(detailsButton);

		expect(details?.open).toBe(true);
		expect(screen.getAllByText('Fairness confidence')).toHaveLength(2);
		expect(screen.getAllByText('SGT Nolan has the longest eligible break since last staff duty.')).toHaveLength(2);
	});

	it('blocks apply until collision and unfilled slot review are acknowledged', async () => {
		const onApply = vi.fn();
		renderPanel({
			previewCollisionMessages: ['SPC Chen has a conflicting duty event.'],
			onApply
		});

		const applyButton = screen.getByRole('button', { name: 'Apply Series' });
		expect(applyButton).toHaveProperty('disabled', true);

		cleanup();
		renderPanel({
			previewCollisionMessages: ['SPC Chen has a conflicting duty event.'],
			collisionReviewConfirmed: true,
			shortfallReviewConfirmed: true,
			onApply
		});
		const acknowledgedApplyButton = screen.getByRole('button', { name: 'Apply Series' });
		expect(acknowledgedApplyButton).toHaveProperty('disabled', false);

		await fireEvent.click(acknowledgedApplyButton);
		expect(onApply).toHaveBeenCalled();
	});

	it('keeps draft run actions and preview-only export reachable while the run is under review', async () => {
		const onRegenerate = vi.fn();
		const onExportPreview = vi.fn();
		const onApply = vi.fn();
		renderPanel({
			shortfallReviewConfirmed: true,
			onRegenerate,
			onExportPreview,
			onApply
		});

		const actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByText('Draft preview')).toBeTruthy();
		expect(within(actionBar).getByText('This generated run is under review.')).toBeTruthy();
		expect(within(actionBar).getByText('Preview export: not applied output')).toBeTruthy();

		await fireEvent.click(within(actionBar).getByRole('button', { name: 'Regenerate preview' }));
		await fireEvent.click(within(actionBar).getByRole('button', { name: 'Export preview, not applied output' }));
		await fireEvent.click(within(actionBar).getByRole('button', { name: 'Apply Series' }));

		expect(onRegenerate).toHaveBeenCalled();
		expect(onExportPreview).toHaveBeenCalled();
		expect(onApply).toHaveBeenCalled();
	});

	it('uses lifecycle state copy to limit apply, retry, and recovery actions', () => {
		const { rerender } = renderPanel({
			snapshotState: 'stale',
			shortfallReviewConfirmed: true
		});
		let actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByText('Stale preview')).toBeTruthy();
		expect(
			within(actionBar).getByText('Source data or reviewed inputs changed. Regenerate before applying.')
		).toBeTruthy();
		expect(within(actionBar).getByRole('button', { name: 'Apply Series' })).toHaveProperty('disabled', true);
		expect(within(actionBar).getByRole('button', { name: 'Regenerate preview' })).toHaveProperty('disabled', false);

		rerender({ snapshotState: 'expired', shortfallReviewConfirmed: true });
		actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByText('Expired preview')).toBeTruthy();
		expect(within(actionBar).getByText('This 24-hour draft snapshot can no longer be applied.')).toBeTruthy();
		expect(within(actionBar).getByRole('button', { name: 'Export preview, not applied output' })).toHaveProperty(
			'disabled',
			true
		);

		rerender({ snapshotState: 'applying', isApplying: true, shortfallReviewConfirmed: true });
		actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByText('Applying')).toBeTruthy();
		expect(within(actionBar).getByRole('button', { name: 'Regenerate preview' })).toHaveProperty('disabled', true);
		expect(within(actionBar).getByRole('button', { name: 'Applying Series...' })).toHaveProperty('disabled', true);

		rerender({ snapshotState: 'applied', isApplying: false, shortfallReviewConfirmed: true });
		actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByText('Applied')).toBeTruthy();
		expect(within(actionBar).getByText('This run is finalized and cannot be normally applied again.')).toBeTruthy();
		expect(within(actionBar).getByRole('button', { name: 'Apply Series' })).toHaveProperty('disabled', true);

		rerender({
			snapshotState: 'failed-before-persistence',
			canRetryApply: true,
			shortfallReviewConfirmed: true
		});
		actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByText('Failed before persistence')).toBeTruthy();
		expect(within(actionBar).getByRole('button', { name: 'Retry apply' })).toHaveProperty('disabled', false);

		rerender({
			snapshotState: 'partial-recovery',
			canRecoverPartialApply: true,
			shortfallReviewConfirmed: true
		});
		actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByText('Partial recovery')).toBeTruthy();
		expect(within(actionBar).getByRole('button', { name: 'Recover partial apply' })).toHaveProperty('disabled', false);
	});

	it('requires snapshot identity and fingerprint before enabling apply', () => {
		renderPanel({
			preview: {
				...preview,
				snapshotId: undefined,
				snapshotFingerprint: undefined
			},
			shortfallReviewConfirmed: true
		});

		const actionBar = screen.getByRole('region', { name: 'Advanced run actions and snapshot state' });
		expect(within(actionBar).getByRole('button', { name: 'Apply Series' })).toHaveProperty('disabled', true);
		expect(within(actionBar).getByText('Snapshot identity is missing. Regenerate before applying.')).toBeTruthy();
	});
});
