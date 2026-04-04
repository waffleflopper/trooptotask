// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AdvancedDutyTemplateBuilder from './AdvancedDutyTemplateBuilder.svelte';
import type { DutyTemplate } from '../duty-roster.types';

const groups = [
	{ id: 'group-alpha', name: 'Alpha' },
	{ id: 'group-hq', name: 'HQ' }
];

const personnel = [
	{ id: 'p-1', rank: 'SGT', lastName: 'Nolan', firstName: 'Casey', groupId: 'group-alpha', mos: '11B', clinicRole: 'Squad Leader' },
	{ id: 'p-2', rank: 'SPC', lastName: 'Baker', firstName: 'Jordan', groupId: 'group-hq', mos: '68W', clinicRole: 'Medic' }
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
		coverageMode: 'timed',
		startTime: '17:00',
		endTime: '09:00',
		isBlocking: true,
		cooldownHours: 12,
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

describe('AdvancedDutyTemplateBuilder', () => {
	beforeEach(() => {
		cleanup();
	});

	it('shows the permission boundary for non-privileged users', () => {
		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [],
				groups,
				personnel,
				canManageTemplates: false,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate: vi.fn()
			}
		});

		expect(screen.getByText('Advanced templates are admin-only right now.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Save Template' })).toBeNull();
	});

	it('creates a new advanced template from the builder form', async () => {
		const created = makeTemplate({ id: 'tmpl-created', name: 'Company CQ', slots: [] });
		const onCreateTemplate = vi.fn().mockResolvedValue(created);

		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [],
				groups,
				personnel,
				canManageTemplates: true,
				onCreateTemplate,
				onUpdateTemplate: vi.fn()
			}
		});

		await fireEvent.input(screen.getByLabelText('Name'), {
			target: { value: 'Company CQ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add Slot' }));
		await fireEvent.input(screen.getByLabelText('Role label'), {
			target: { value: 'Runner' }
		});
		await fireEvent.input(screen.getByLabelText('Rotation pool key'), {
			target: { value: 'staff-duty-primary' }
		});
		const preferredGroupsSelect = screen.getByLabelText('Preferred groups') as HTMLSelectElement;
		preferredGroupsSelect.options[0].selected = true;
		await fireEvent.change(preferredGroupsSelect);
		await fireEvent.click(screen.getByRole('button', { name: 'Add Baseline' }));
		await fireEvent.input(screen.getAllByLabelText('Rotation pool key')[1], {
			target: { value: 'staff-duty-primary' }
		});
		await fireEvent.change(screen.getByLabelText('Person'), {
			target: { value: 'p-1' }
		});
		await fireEvent.input(screen.getByLabelText('Last served date'), {
			target: { value: '2026-03-10' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

		await waitFor(() => {
			expect(onCreateTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					mode: 'advanced',
					status: 'draft',
					name: 'Company CQ',
					slots: [
						expect.objectContaining({
							roleLabel: 'Runner',
							quantity: 1,
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

	it('loads an existing template into the review panel and updates it', async () => {
		const existing = makeTemplate();
		const onUpdateTemplate = vi.fn().mockResolvedValue({ ...existing, status: 'active' });

		render(AdvancedDutyTemplateBuilder, {
			props: {
				templates: [existing],
				groups,
				personnel,
				canManageTemplates: true,
				onCreateTemplate: vi.fn(),
				onUpdateTemplate
			}
		});

		expect(screen.getByLabelText('Template summary').textContent).toContain('Battalion Staff Duty');
		expect(screen.getByLabelText('Template summary').textContent).toContain('1 x NCO');

		await fireEvent.input(screen.getByLabelText('Description'), {
			target: { value: 'Updated overnight policy' }
		});
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
			expect(screen.getByLabelText('Template summary').textContent).toContain('Status: active');
		});
	});
});
