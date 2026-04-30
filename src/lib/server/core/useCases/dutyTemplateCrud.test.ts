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
				allowedRoleValues: [],
				blockingMode: 'non-blocking'
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
			blockingMode: 'non-blocking',
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

	it('fails create when policy fields cannot be written', async () => {
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

		await expect(createDutyTemplate(ctx, makeInput())).rejects.toMatchObject({
			status: 500,
			message: expect.stringContaining('Duty template policy settings could not be saved')
		});
	});

	it('returns a static create failure when template persistence throws an unexpected error', async () => {
		const ctx = createTestContext();
		const originalInsert = ctx.store.insert.bind(ctx.store);
		let attemptedTemplateInsert = false;

		ctx.store.insert = (async (...args) => {
			if (!attemptedTemplateInsert && args[0] === 'duty_templates') {
				attemptedTemplateInsert = true;
				throw new Error('relation "duty_templates" does not exist');
			}
			return await originalInsert(...(args as Parameters<typeof originalInsert>));
		}) as typeof ctx.store.insert;

		await expect(createDutyTemplate(ctx, makeInput())).rejects.toMatchObject({
			status: 500,
			message: 'Failed to save duty template.'
		});
	});

	it('creates templates when legacy schemas are missing exempt personnel policy column', async () => {
		const ctx = createTestContext();
		const originalInsert = ctx.store.insert.bind(ctx.store);
		let attemptedTemplateInsert = false;

		ctx.store.insert = (async (...args) => {
			if (!attemptedTemplateInsert && args[0] === 'duty_templates') {
				attemptedTemplateInsert = true;
				throw new Error("Could not find the 'exempt_personnel_ids' column of 'duty_templates' in the schema cache");
			}
			return await originalInsert(...(args as Parameters<typeof originalInsert>));
		}) as typeof ctx.store.insert;

		const created = await createDutyTemplate(ctx, makeInput());

		expect(created.name).toBe('Battalion Staff Duty');
	});

	it('persists rotation pools, DA6 ranking policy, and manual fairness baselines on advanced templates', async () => {
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
					{ type: 'longest-break', enabled: true },
					{ type: 'separate-weekend-da6', enabled: true },
					{ type: 'include-holiday-donsa-da6', enabled: true }
				]
			})
		);

		expect(result.slots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					roleLabel: 'NCO',
					rotationPoolKey: 'staff-duty-primary',
					preferredGroupIds: []
				}),
				expect.objectContaining({
					roleLabel: 'Runner',
					rotationPoolKey: 'staff-duty-primary',
					preferredGroupIds: []
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
			{ type: 'longest-break', enabled: true },
			{ type: 'separate-weekend-da6', enabled: true },
			{ type: 'include-holiday-donsa-da6', enabled: true }
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

	it('rejects unscoped full editors from creating templates without admin access', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				isFullEditor: true
			}
		});

		await expect(createDutyTemplate(ctx, makeInput())).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty templates can only be managed by organization admins and owners.'
		});
	});

	it('denies users who are not full editors from creating templates', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				isFullEditor: false,
				requireFullEditor() {
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

	it('fails update when policy fields cannot be written', async () => {
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

		await expect(
			updateDutyTemplate(ctx, {
				...makeInput({
					id: created.id,
					name: 'Battalion Staff Duty (Updated)'
				})
			})
		).rejects.toMatchObject({
			status: 500,
			message: expect.stringContaining('Duty template policy settings could not be saved')
		});
	});

	it('updates templates when legacy schemas are missing exempt personnel policy column', async () => {
		const ctx = createTestContext();
		const created = await createDutyTemplate(ctx, makeInput());
		const originalUpdate = ctx.store.update.bind(ctx.store);
		let attemptedTemplateUpdate = false;

		ctx.store.update = (async (...args) => {
			if (!attemptedTemplateUpdate && args[0] === 'duty_templates') {
				attemptedTemplateUpdate = true;
				throw new Error('column "exempt_personnel_ids" of relation "duty_templates" does not exist');
			}
			return await originalUpdate(...(args as Parameters<typeof originalUpdate>));
		}) as typeof ctx.store.update;

		const updated = await updateDutyTemplate(
			ctx,
			makeInput({
				id: created.id,
				name: 'Battalion Staff Duty (Updated)'
			})
		);

		expect(updated.id).toBe(created.id);
		expect(updated.name).toBe('Battalion Staff Duty (Updated)');
	});

	it('preserves the existing template aggregate when replacement slot persistence fails', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: ctx.auth.orgId
			}
		]);

		const created = await createDutyTemplate(
			ctx,
			makeInput({
				rotationBaselines: [
					{
						rotationPoolKey: 'nco-pool',
						personId: 'person-alpha',
						lastServedDate: '2026-04-01'
					}
				]
			})
		);

		const previousTemplateRow = JSON.parse(
			JSON.stringify(
				await ctx.store.findOne<Record<string, unknown>>('duty_templates', ctx.auth.orgId, { id: created.id })
			)
		) as Record<string, unknown>;
		const previousSlotRows = JSON.parse(
			JSON.stringify(
				await ctx.store.findMany<Record<string, unknown>>('duty_template_slots', ctx.auth.orgId, {
					template_id: created.id
				})
			)
		) as Record<string, unknown>[];
		const previousBaselineRows = JSON.parse(
			JSON.stringify(
				await ctx.store.findMany<Record<string, unknown>>('duty_template_rotation_baselines', ctx.auth.orgId, {
					template_id: created.id
				})
			)
		) as Record<string, unknown>[];

		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		let slotInsertAttempts = 0;
		ctx.store.insertMany = (async (...args) => {
			const [table] = args as [string, string, Array<Record<string, unknown>>];
			if (table === 'duty_template_slots' && slotInsertAttempts++ === 0) {
				throw new Error('Simulated template slot persistence failure');
			}

			return originalInsertMany(...args);
		}) as typeof ctx.store.insertMany;

		await expect(
			updateDutyTemplate(
				ctx,
				makeInput({
					id: created.id,
					name: 'Battalion Staff Duty (Updated)',
					slots: [
						{
							roleLabel: 'Officer',
							quantity: 1,
							allowedRanks: ['1LT'],
							allowedGroupIds: [],
							allowedMosValues: [],
							allowedRoleValues: []
						}
					],
					rotationBaselines: [
						{
							rotationPoolKey: 'officer-pool',
							personId: 'person-alpha',
							lastServedDate: '2026-04-07'
						}
					]
				})
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to update duty template.'
		});

		const restoredTemplateRow = await ctx.store.findOne<Record<string, unknown>>('duty_templates', ctx.auth.orgId, {
			id: created.id
		});
		const restoredSlotRows = await ctx.store.findMany<Record<string, unknown>>('duty_template_slots', ctx.auth.orgId, {
			template_id: created.id
		});
		const restoredBaselineRows = await ctx.store.findMany<Record<string, unknown>>(
			'duty_template_rotation_baselines',
			ctx.auth.orgId,
			{ template_id: created.id }
		);

		expect(restoredTemplateRow).toEqual(previousTemplateRow);
		expect(restoredSlotRows).toEqual(previousSlotRows);
		expect(restoredBaselineRows).toEqual(previousBaselineRows);
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

describe('advanced duty template access enforcement', () => {
	it('allows org admins to manage advanced templates', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				isFullEditor: false,
				scopedGroupId: null
			}
		});

		const created = await createDutyTemplate(ctx, makeInput());
		const updated = await updateDutyTemplate(
			ctx,
			makeInput({
				id: created.id,
				name: 'Battalion Staff Duty (Updated)'
			})
		);
		const archived = await archiveDutyTemplate(ctx, { templateId: created.id });

		expect(updated.name).toBe('Battalion Staff Duty (Updated)');
		expect(archived.status).toBe('archived');
	});

	it('rejects unscoped full editors from managing advanced templates without admin access', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				isFullEditor: true
			}
		});

		await expect(createDutyTemplate(ctx, makeInput())).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty templates can only be managed by organization admins and owners.'
		});

		const privilegedCtx = createTestContext();
		const created = await createDutyTemplate(privilegedCtx, makeInput());

		await expect(listDutyTemplates(ctx)).resolves.toHaveLength(0);
		await expect(
			updateDutyTemplate(
				ctx,
				makeInput({
					id: created.id,
					name: 'Battalion Staff Duty (Updated)'
				})
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty templates can only be managed by organization admins and owners.'
		});
		await expect(archiveDutyTemplate(ctx, { templateId: created.id })).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty templates can only be managed by organization admins and owners.'
		});
	});

	it('denies scoped full editors from advanced template management', async () => {
		const scopedCtx = createTestContext({
			auth: {
				isPrivileged: true,
				isFullEditor: true,
				scopedGroupId: 'group-alpha'
			}
		});

		await expect(createDutyTemplate(scopedCtx, makeInput())).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
		await expect(listDutyTemplates(scopedCtx)).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
		await expect(
			updateDutyTemplate(scopedCtx, {
				...makeInput(),
				id: 'template-1'
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
		await expect(archiveDutyTemplate(scopedCtx, { templateId: 'template-1' })).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
	});
});
