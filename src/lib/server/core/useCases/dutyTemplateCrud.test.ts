import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { cloneDefaultSoftPreferences, type DutyTemplateWriteInput } from '$features/duty-roster/duty-roster.types';
import { archiveDutyTemplate, createDutyTemplate, listDutyTemplates, updateDutyTemplate } from './dutyTemplateCrud';

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
			cooldownHours: 12,
			softPreferences: cloneDefaultSoftPreferences()
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

	it('creates templates even when policy columns are missing in the database schema', async () => {
		const ctx = createTestContext();
		const originalInsert = ctx.store.insert.bind(ctx.store);
		let attemptedTemplateInsert = false;

		ctx.store.insert = (async (...args) => {
			if (!attemptedTemplateInsert && args[0] === 'duty_templates') {
				attemptedTemplateInsert = true;
				throw new Error("Could not find the 'exempt_status_type_ids' column of 'duty_templates' in the schema cache");
			}
			return await originalInsert(...(args as Parameters<typeof originalInsert>));
		}) as typeof ctx.store.insert;

		const result = await createDutyTemplate(ctx, makeInput());

		expect(result.name).toBe('Battalion Staff Duty');
		expect(result.exemptPersonnelIds).toEqual([]);
		expect(result.exemptStatusTypeIds).toEqual([]);
		expect(result.softPreferences).toEqual(cloneDefaultSoftPreferences());
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
				],
				softPreferences: [
					{ type: 'preferred-group', enabled: true },
					{ type: 'longest-break', enabled: true },
					{ type: 'holiday-closure', enabled: true },
					{ type: 'weekend', enabled: false }
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
		expect(result.softPreferences).toEqual([
			{ type: 'preferred-group', enabled: true },
			{ type: 'longest-break', enabled: true },
			{ type: 'holiday-closure', enabled: true },
			{ type: 'weekend', enabled: false }
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

	it('updates templates even when policy columns are missing in the database schema', async () => {
		const ctx = createTestContext();
		const created = await createDutyTemplate(ctx, makeInput());
		const originalUpdate = ctx.store.update.bind(ctx.store);
		let attemptedTemplateUpdate = false;

		ctx.store.update = (async (...args) => {
			if (!attemptedTemplateUpdate && args[0] === 'duty_templates') {
				attemptedTemplateUpdate = true;
				throw new Error('column "soft_preferences" of relation "duty_templates" does not exist');
			}
			return await originalUpdate(...(args as Parameters<typeof originalUpdate>));
		}) as typeof ctx.store.update;

		const updated = await updateDutyTemplate(ctx, {
			...makeInput({
				id: created.id,
				name: 'Battalion Staff Duty (Updated)'
			})
		});

		expect(updated.id).toBe(created.id);
		expect(updated.name).toBe('Battalion Staff Duty (Updated)');
		expect(updated.exemptPersonnelIds).toEqual([]);
		expect(updated.exemptStatusTypeIds).toEqual([]);
		expect(updated.softPreferences).toEqual(cloneDefaultSoftPreferences());
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

	it('archives an existing advanced template', async () => {
		const ctx = createTestContext();
		const created = await createDutyTemplate(ctx, makeInput({ status: 'active' }));

		const archived = await archiveDutyTemplate(ctx, { templateId: created.id });

		expect(archived).toMatchObject({
			id: created.id,
			status: 'archived'
		});
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'duty_template.archived',
				resourceType: 'duty_template',
				resourceId: created.id
			})
		);
	});
});

describe('updateDutyTemplate — group scope enforcement', () => {
	it('allows a group-scoped user to update a template whose scope includes their group', async () => {
		const ctx = createTestContext();
		const template = await createDutyTemplate(ctx, makeInput({ scopeType: 'groups', scopeGroupIds: ['group-alpha'] }));

		const scopedCtx = createTestContext({ auth: { scopedGroupId: 'group-alpha' } });
		// Pre-seed the template into the scoped store so findOne can find it
		scopedCtx.store.seed('duty_templates', [
			{
				id: template.id,
				organization_id: scopedCtx.auth.orgId,
				mode: 'advanced',
				status: 'draft',
				name: template.name,
				description: template.description ?? null,
				scope_type: 'groups',
				scope_group_ids: ['group-alpha'],
				coverage_mode: template.coverageMode,
				start_time: '17:00',
				end_time: '09:00',
				is_blocking: template.isBlocking,
				cooldown_hours: template.cooldownHours,
				rotation_baselines: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		]);

		await expect(
			updateDutyTemplate(scopedCtx, {
				...makeInput({ scopeType: 'groups', scopeGroupIds: ['group-alpha'] }),
				id: template.id
			})
		).resolves.toBeTruthy();
	});

	it('denies a group-scoped user from updating a template for a different group', async () => {
		const ctx = createTestContext();
		const template = await createDutyTemplate(ctx, makeInput({ scopeType: 'groups', scopeGroupIds: ['group-bravo'] }));

		const scopedCtx = createTestContext({ auth: { scopedGroupId: 'group-alpha' } });
		scopedCtx.store.seed('duty_templates', [
			{
				id: template.id,
				organization_id: scopedCtx.auth.orgId,
				mode: 'advanced',
				status: 'draft',
				name: template.name,
				description: template.description ?? null,
				scope_type: 'groups',
				scope_group_ids: ['group-bravo'],
				coverage_mode: template.coverageMode,
				start_time: '17:00',
				end_time: '09:00',
				is_blocking: template.isBlocking,
				cooldown_hours: template.cooldownHours,
				rotation_baselines: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		]);

		await expect(
			updateDutyTemplate(scopedCtx, {
				...makeInput({ scopeType: 'groups', scopeGroupIds: ['group-bravo'] }),
				id: template.id
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('denies a group-scoped user from updating an org-scoped template', async () => {
		const ctx = createTestContext();
		const template = await createDutyTemplate(ctx, makeInput({ scopeType: 'organization', scopeGroupIds: [] }));

		const scopedCtx = createTestContext({ auth: { scopedGroupId: 'group-alpha' } });
		scopedCtx.store.seed('duty_templates', [
			{
				id: template.id,
				organization_id: scopedCtx.auth.orgId,
				mode: 'advanced',
				status: 'draft',
				name: template.name,
				description: template.description ?? null,
				scope_type: 'organization',
				scope_group_ids: [],
				coverage_mode: template.coverageMode,
				start_time: '17:00',
				end_time: '09:00',
				is_blocking: template.isBlocking,
				cooldown_hours: template.cooldownHours,
				rotation_baselines: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		]);

		await expect(
			updateDutyTemplate(scopedCtx, { ...makeInput({ scopeType: 'organization', scopeGroupIds: [] }), id: template.id })
		).rejects.toMatchObject({ status: 403 });
	});
});
