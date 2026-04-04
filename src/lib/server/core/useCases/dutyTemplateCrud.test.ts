import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { DutyTemplateWriteInput } from '$features/duty-roster/duty-roster.types';
import { createDutyTemplate, listDutyTemplates, updateDutyTemplate } from './dutyTemplateCrud';

function makeInput(overrides: Partial<DutyTemplateWriteInput> = {}): DutyTemplateWriteInput {
	return {
		status: 'draft',
		name: 'Battalion Staff Duty',
		description: 'Primary overnight duty team',
		scopeType: 'groups',
		scopeGroupIds: ['group-alpha'],
		coverageMode: 'timed',
		startTime: '17:00',
		endTime: '09:00',
		isBlocking: true,
		cooldownHours: 12,
		slots: [
			{
				roleLabel: 'NCO',
				quantity: 1,
				allowedRanks: ['SGT', 'SSG'],
				allowedGroupIds: ['group-alpha'],
				allowedMosValues: ['11B'],
				allowedRoleValues: ['Squad Leader']
			},
			{
				roleLabel: 'Runner',
				quantity: 2,
				allowedRanks: ['PFC', 'SPC'],
				allowedGroupIds: ['group-alpha'],
				allowedMosValues: ['11B'],
				allowedRoleValues: []
			}
		],
		...overrides
	};
}

describe('duty template CRUD use cases', () => {
	it('creates an advanced duty template with nested slot definitions', async () => {
		const ctx = createTestContext();

		const result = await createDutyTemplate(ctx, makeInput());

		expect(result).toMatchObject({
			mode: 'advanced',
			status: 'draft',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-alpha'],
			coverageMode: 'timed',
			startTime: '17:00',
			endTime: '09:00',
			isBlocking: true,
			cooldownHours: 12
		});
		expect(result.slots).toHaveLength(2);
		expect(result.slots[0]).toMatchObject({
			roleLabel: 'NCO',
			quantity: 1,
			allowedRanks: ['SGT', 'SSG'],
			allowedGroupIds: ['group-alpha'],
			allowedMosValues: ['11B'],
			allowedRoleValues: ['Squad Leader'],
			sortOrder: 0
		});
		expect(result.slots[1]).toMatchObject({
			roleLabel: 'Runner',
			quantity: 2,
			sortOrder: 1
		});
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'duty_template.created',
				resourceType: 'duty_template',
				resourceId: result.id
			})
		);
	});

	it('persists rotation pools, preferred groups, and manual fairness baselines on advanced templates', async () => {
		const ctx = createTestContext();

		const result = await createDutyTemplate(
			ctx,
			makeInput({
				slots: [
					{
						roleLabel: 'NCO',
						quantity: 1,
						allowedRanks: ['SGT', 'SSG'],
						allowedGroupIds: ['group-alpha', 'group-hq'],
						preferredGroupIds: ['group-alpha'],
						rotationPoolKey: 'staff-duty-primary',
						allowedMosValues: ['11B'],
						allowedRoleValues: ['Squad Leader']
					},
					{
						roleLabel: 'Runner',
						quantity: 1,
						allowedRanks: ['PFC', 'SPC'],
						allowedGroupIds: ['group-alpha', 'group-hq'],
						preferredGroupIds: ['group-hq'],
						rotationPoolKey: 'staff-duty-primary',
						allowedMosValues: ['11B'],
						allowedRoleValues: []
					}
				],
				rotationBaselines: [
					{
						rotationPoolKey: 'staff-duty-primary',
						personId: 'person-1',
						lastServedDate: '2026-03-10'
					}
				]
			})
		);

		expect(result.slots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					roleLabel: 'NCO',
					rotationPoolKey: 'staff-duty-primary',
					preferredGroupIds: ['group-alpha']
				}),
				expect.objectContaining({
					roleLabel: 'Runner',
					rotationPoolKey: 'staff-duty-primary',
					preferredGroupIds: ['group-hq']
				})
			])
		);
		expect(result.rotationBaselines).toEqual([
			expect.objectContaining({
				rotationPoolKey: 'staff-duty-primary',
				personId: 'person-1',
				lastServedDate: '2026-03-10'
			})
		]);
	});

	it('rejects activating a template without any slots', async () => {
		const ctx = createTestContext();

		await expect(
			createDutyTemplate(
				ctx,
				makeInput({
					status: 'active',
					slots: []
				})
			)
		).rejects.toMatchObject({ status: 400 });
	});

	it('blocks non-privileged users from creating templates', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				requirePrivileged() {
					throw { status: 403 };
				}
			}
		});

		await expect(createDutyTemplate(ctx, makeInput())).rejects.toMatchObject({ status: 403 });
	});

	it('updates template policy fields and replaces slot definitions', async () => {
		const ctx = createTestContext();
		const created = await createDutyTemplate(ctx, makeInput());

		const updated = await updateDutyTemplate(
			ctx,
			makeInput({
				id: created.id,
				status: 'active',
				scopeType: 'organization',
				scopeGroupIds: [],
				coverageMode: 'all-day',
				startTime: null,
				endTime: null,
				cooldownHours: 24,
				slots: [
					{
						roleLabel: 'Officer',
						quantity: 1,
						allowedRanks: ['1LT', 'CPT'],
						allowedGroupIds: [],
						allowedMosValues: [],
						allowedRoleValues: ['Officer of the Day']
					}
				]
			})
		);

		expect(updated).toMatchObject({
			id: created.id,
			status: 'active',
			scopeType: 'organization',
			scopeGroupIds: [],
			coverageMode: 'all-day',
			startTime: null,
			endTime: null,
			cooldownHours: 24
		});
		expect(updated.slots).toHaveLength(1);
		expect(updated.slots[0]).toMatchObject({
			roleLabel: 'Officer',
			quantity: 1,
			allowedRanks: ['1LT', 'CPT']
		});
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'duty_template.updated',
				resourceType: 'duty_template',
				resourceId: created.id
			})
		);
	});

	it('returns advanced templates with slots sorted for review', async () => {
		const ctx = createTestContext();
		await createDutyTemplate(ctx, makeInput({ name: 'Template A' }));
		await createDutyTemplate(
			ctx,
			makeInput({
				name: 'Template B',
				slots: [
					{
						roleLabel: 'Runner',
						quantity: 2,
						sortOrder: 2
					},
					{
						roleLabel: 'NCO',
						quantity: 1,
						sortOrder: 0
					}
				]
			})
		);

		const results = await listDutyTemplates(ctx);

		expect(results).toHaveLength(2);
		expect(results[1].name).toBe('Template B');
		expect(results[1].slots.map((slot) => slot.roleLabel)).toEqual(['NCO', 'Runner']);
	});
});
