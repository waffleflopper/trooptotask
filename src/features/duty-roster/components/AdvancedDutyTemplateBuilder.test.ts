// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AdvancedDutyTemplateBuilder from './AdvancedDutyTemplateBuilder.svelte';
import { cloneDefaultSoftPreferences, type DutyTemplate } from '../duty-roster.types';

const groups = [
	{ id: 'group-alpha', name: 'Alpha' },
	{ id: 'group-hq', name: 'HQ' }
];

const personnel = [
	{
		id: 'p-1',
		rank: 'SGT',
		lastName: 'Nolan',
		firstName: 'Casey',
		groupId: 'group-alpha',
		mos: '11B',
		clinicRole: 'Squad Leader'
	},
	{
		id: 'p-2',
		rank: 'SPC',
		lastName: 'Baker',
		firstName: 'Jordan',
		groupId: 'group-hq',
		mos: '68W',
		clinicRole: 'Medic'
	}
];

const statusTypes = [
	{ id: 'st-leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff' },
	{ id: 'st-tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff' }
];

function makeTemplate(overrides: Partial<DutyTemplate> = {}): DutyTemplate {
	return {
		id: 'tmpl-1',
		orgId: 'test-org',
		mode: 'advanced',
		status: 'draft',
		name: 'Battalion Staff Duty',
		description: 'Primary overnight duty',
		scopeType: 'groups',
		scopeGroupIds: ['group-alpha'],
		exemptPersonnelIds: [],
		exemptStatusTypeIds: [],
		coverageMode: 'timed',
		startTime: '17:00',
		endTime: '09:00',
		spansMidnight: false,
		isBlocking: true,
		cooldownHours: 12,
		softPreferences: cloneDefaultSoftPreferences(),
		createdAt: '2026-04-04T00:00:00.000Z',
		updatedAt: '2026-04-04T00:00:00.000Z',
		slots: [
			{
				id: 'slot-1',
				templateId: 'tmpl-1',
				roleLabel: 'NCO',
				quantity: 1,
				allowedRanks: ['SGT'],
				allowedGroupIds: ['group-alpha'],
				preferredGroupIds: ['group-alpha'],
				allowedMosValues: ['11B'],
				allowedRoleValues: ['Squad Leader'],
				rotationPoolKey: 'staff-duty-primary',
				sortOrder: 0
			}
		],
		rotationBaselines: [],
		...overrides
	};
}

async function selectMultiTagOptions(ariaLabel: string, labels: string[]) {
	const input = screen.getByLabelText(ariaLabel);
	await fireEvent.focus(input);
	for (const label of labels) {
		const listbox = await screen.findByRole('listbox', { name: ariaLabel });
		const option = Array.from(listbox.querySelectorAll('[role="option"]')).find(
			(el) => el.textContent?.trim() === label
		);
		if (!option) throw new Error(`Option "${label}" not found in ${ariaLabel}`);
		await fireEvent.mouseDown(option);
	}
}

async function goToPolicyStep() {
	await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

async function goToSeriesStep() {
	await goToPolicyStep();
	await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

async function goToReviewStep() {
	await goToSeriesStep();
	await fireEvent.click(screen.getByRole('button', { name: 'Review Template' }));
}

describe('AdvancedDutyTemplateBuilder', () => {
	beforeEach(() => {
		cleanup();
	});

	it('shows the permission boundary for non-privileged users', () => {
		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: false,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate: vi.fn(),
				onArchiveTemplate: vi.fn()
			}
		});

		expect(screen.getByText('Advanced templates are admin-only right now.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Save Template' })).toBeNull();
	});

	it('starts a new advanced setup from a preset in quick setup, then expands to full configuration', async () => {
		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate: vi.fn(),
				onArchiveTemplate: vi.fn()
			}
		});

		expect(screen.getByText(/Choose a starting point/)).toBeTruthy();
		expect(screen.getByRole('button', { name: /Use Battalion Staff Duty Preset/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Build from Blank/ })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /Use Battalion Staff Duty Preset/ }));

		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Battalion Staff Duty');
		expect(screen.getByText('Quick Setup')).toBeTruthy();
		expect(screen.queryByLabelText('MOS filter')).toBeNull();
		expect(screen.queryByText('Rotation Starting Points')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Full Configuration' }));
		await goToSeriesStep();

		expect(screen.getAllByLabelText('MOS filter').length).toBeGreaterThan(0);
		expect(screen.getByText('Rotation Starting Points')).toBeTruthy();
	});

	it('creates a new advanced template from the builder form', async () => {
		const created = makeTemplate({ id: 'tmpl-created', name: 'Company CQ', slots: [] });
		const onCreateTemplate = vi.fn().mockResolvedValue(created);

		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate,
				onUpdateTemplate: vi.fn(),
				onArchiveTemplate: vi.fn()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Build from Blank/ }));
		await fireEvent.input(screen.getByLabelText('Name'), {
			target: { value: 'Company CQ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Full Configuration' }));
		await goToSeriesStep();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Slot' }));
		await fireEvent.input(screen.getByLabelText('Role label'), {
			target: { value: 'Runner' }
		});
		await selectMultiTagOptions('MOS filter', ['11B', '68W']);
		await selectMultiTagOptions('Personnel role filter', ['Medic', 'Squad Leader']);
		await fireEvent.input(screen.getByLabelText(/^Rotation group/), {
			target: { value: 'staff-duty-primary' }
		});
		await selectMultiTagOptions('Preferred groups', ['Alpha']);
		await fireEvent.click(screen.getByRole('button', { name: 'Add Baseline' }));
		await fireEvent.input(screen.getAllByLabelText(/^Rotation group/)[1], {
			target: { value: 'staff-duty-primary' }
		});
		await fireEvent.change(screen.getByLabelText('Person'), {
			target: { value: 'p-1' }
		});
		await fireEvent.input(screen.getByLabelText('Last served date'), {
			target: { value: '2026-03-10' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Review Template' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

		await waitFor(() => {
			expect(onCreateTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					mode: 'advanced',
					status: 'draft',
					name: 'Company CQ',
					softPreferences: cloneDefaultSoftPreferences(),
					slots: [
						expect.objectContaining({
							roleLabel: 'Runner',
							quantity: 1,
							allowedMosValues: ['11B', '68W'],
							allowedRoleValues: ['Medic', 'Squad Leader'],
							preferredGroupIds: ['group-alpha'],
							rotationPoolKey: 'staff-duty-primary',
							sortOrder: 0
						})
					],
					rotationBaselines: [
						expect.objectContaining({
							rotationPoolKey: 'staff-duty-primary',
							personId: 'p-1',
							lastServedDate: '2026-03-10'
						})
					]
				})
			);
		});
	});

	it('lets a slot override the template conflict policy before save', async () => {
		const created = makeTemplate({ id: 'tmpl-created', name: 'Company CQ', slots: [] });
		const onCreateTemplate = vi.fn().mockResolvedValue(created);

		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate,
				onUpdateTemplate: vi.fn(),
				onArchiveTemplate: vi.fn()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Build from Blank/ }));
		await fireEvent.input(screen.getByLabelText('Name'), {
			target: { value: 'Company CQ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Full Configuration' }));
		await goToSeriesStep();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Slot' }));
		await fireEvent.input(screen.getByLabelText('Role label'), {
			target: { value: 'Runner' }
		});
		await fireEvent.change(screen.getByLabelText('Conflict behavior for this slot'), {
			target: { value: 'non-blocking' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Review Template' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

		await waitFor(() => {
			expect(onCreateTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					slots: [
						expect.objectContaining({
							roleLabel: 'Runner',
							blockingMode: 'non-blocking'
						})
					]
				})
			);
		});
	});

	it('lets full configuration reorder and disable soft preferences before save', async () => {
		const existing = makeTemplate();
		const onUpdateTemplate = vi.fn().mockResolvedValue(existing);

		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [existing],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate,
				onArchiveTemplate: vi.fn()
			}
		});

		await goToPolicyStep();
		await fireEvent.click(screen.getAllByRole('button', { name: 'Move Down' })[0]);
		await fireEvent.click(screen.getAllByLabelText('Enabled')[2]);
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Review Template' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

		await waitFor(() => {
			expect(onUpdateTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'tmpl-1',
					softPreferences: [
						{ type: 'holiday-closure', enabled: true },
						{ type: 'longest-break', enabled: true },
						{ type: 'weekend', enabled: false },
						{ type: 'preferred-group', enabled: true }
					]
				})
			);
		});
	});

	it('persists status-based exemption selections in template payloads', async () => {
		const existing = makeTemplate();
		const onUpdateTemplate = vi.fn().mockResolvedValue(existing);

		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [existing],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate,
				onArchiveTemplate: vi.fn()
			}
		});

		await goToPolicyStep();
		await fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
		await fireEvent.click(screen.getByRole('button', { name: 'TDY' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Review Template' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

		await waitFor(() => {
			expect(onUpdateTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'tmpl-1',
					exemptStatusTypeIds: ['st-leave', 'st-tdy']
				})
			);
		});
	});

	it('shows archive on step 1 and not on the final review step', async () => {
		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [makeTemplate()],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate: vi.fn(),
				onArchiveTemplate: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'Archive Template' })).toBeTruthy();
		await goToReviewStep();
		expect(screen.queryByRole('button', { name: 'Archive Template' })).toBeNull();
	});

	it('uses plain-language copy for rotation groups and manual filters', async () => {
		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [makeTemplate()],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate: vi.fn(),
				onArchiveTemplate: vi.fn()
			}
		});

		await goToSeriesStep();
		expect(screen.getByLabelText('MOS filter')).toBeTruthy();
		expect(screen.getByLabelText('Personnel role filter')).toBeTruthy();
		expect(screen.getByLabelText(/^Rotation group/)).toBeTruthy();
		expect(
			screen.getByText('Use the same rotation group on multiple slots when those positions should rotate together.')
		).toBeTruthy();
		expect(screen.getByText('Set a starting point when you do not have enough duty history yet.')).toBeTruthy();
	});

	it('loads an existing template into the review panel and updates it', async () => {
		const existing = makeTemplate();
		const onUpdateTemplate = vi.fn().mockResolvedValue({ ...existing, status: 'active' });

		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [existing],
				groups,
				statusTypes,
				personnel,
				canManageTemplates: true,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate,
				onArchiveTemplate: vi.fn()
			}
		});

		await fireEvent.input(screen.getByLabelText('Description'), {
			target: { value: 'Updated overnight policy' }
		});
		await goToReviewStep();
		expect(screen.getByLabelText('Template summary').textContent).toContain('Battalion Staff Duty');
		expect(screen.getByLabelText('Template summary').textContent).toContain('1 x NCO');
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

		await waitFor(() => {
			expect(onUpdateTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'tmpl-1',
					description: 'Updated overnight policy'
				})
			);
		});

		await waitFor(() => {
			expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('active');
		});
	});
});
