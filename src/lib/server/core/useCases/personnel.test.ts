import { describe, it, expect, vi } from 'vitest';
import { createTestContext, createWritePortsContext } from '$lib/server/adapters/inMemory';
import { createPersonnelUseCases } from './personnel';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('Personnel — archive', () => {
	function seedPersonnel(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);
	}

	function seedPersonnelArtifacts(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-open',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status: 'open',
				archived_at: null
			},
			{
				id: 'follow-up-completed',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status: 'completed',
				archived_at: null
			}
		]);
		ctx.store.seed('counseling_records', [
			{
				id: 'counseling-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				archived_at: null
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'document-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				archived_at: null
			}
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				archived_at: null
			}
		]);
	}

	it('sets archived_at and audits', async () => {
		const ctx = buildContext();
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await archive(ctx, 'p-1');

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.archived',
			resourceId: 'p-1'
		});
	});

	it('archives personnel-owned artifacts without reopening completed follow-ups later', async () => {
		const ctx = buildContext();
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		await archive(ctx, 'p-1');

		const followUps = (await ctx.store.findMany('personnel_follow_ups', 'test-org')) as Record<string, unknown>[];
		const counselings = (await ctx.store.findMany('counseling_records', 'test-org')) as Record<string, unknown>[];
		const documents = (await ctx.store.findMany('personnel_documents', 'test-org')) as Record<string, unknown>[];
		const notes = (await ctx.store.findMany('leader_notes', 'test-org')) as Record<string, unknown>[];

		expect(followUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'follow-up-open', status: 'archived', archived_at: expect.any(String) }),
				expect.objectContaining({ id: 'follow-up-completed', status: 'completed', archived_at: null })
			])
		);
		expect(counselings[0].archived_at).toEqual(expect.any(String));
		expect(documents[0].archived_at).toEqual(expect.any(String));
		expect(notes[0].archived_at).toEqual(expect.any(String));
	});

	it.each([false, true])(
		'preserves the archive event on replay and restores its artifacts (interrupted: %s)',
		async (interrupted) => {
			const ctx = buildContext();
			const operations = createPersonnelUseCases();
			seedPersonnel(ctx);
			seedPersonnelArtifacts(ctx);
			const original = structuredClone(
				await ctx.store.findOne<Record<string, unknown>>('personnel', ctx.auth.orgId, { id: 'p-1' })
			);
			const olderArchive = '2026-08-01T12:00:00.000Z';
			await ctx.store.insert('leader_notes', ctx.auth.orgId, {
				id: 'note-independent',
				personnel_id: 'p-1',
				archived_at: olderArchive
			});
			const writes = ctx.personnelArtifactWrites!;
			const forPeople = writes.forPeople.bind(writes);
			let failNote = interrupted;
			writes.forPeople = async (...args) => {
				const writer = await forPeople(...args);
				return {
					...writer,
					async update(table, row, patch) {
						if (table === 'leader_notes' && failNote) {
							failNote = false;
							throw new Error('note archive interrupted');
						}
						await writer.update(table, row, patch);
					}
				};
			};
			const firstArchive = '2026-09-30T14:00:00.000Z';
			vi.useFakeTimers({ toFake: ['Date'] });
			try {
				vi.setSystemTime(new Date(firstArchive));
				if (interrupted) await expect(operations.archive(ctx, 'p-1')).rejects.toThrow('note archive interrupted');
				else await operations.archive(ctx, 'p-1');
				expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual({
					...original,
					archived_at: firstArchive
				});
				vi.setSystemTime(new Date('2026-09-30T14:05:00.000Z'));
				await operations.archive(ctx, 'p-1');
				expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual({
					...original,
					archived_at: firstArchive
				});
				for (const [table, id] of [
					['personnel_follow_ups', 'follow-up-open'],
					['counseling_records', 'counseling-active'],
					['personnel_documents', 'document-active'],
					['leader_notes', 'note-active']
				]) {
					expect(await ctx.store.findOne(table, ctx.auth.orgId, { id })).toMatchObject({ archived_at: firstArchive });
				}
				await operations.restore(ctx, 'p-1');
				expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual(original);
				for (const [table, id] of [
					['personnel_follow_ups', 'follow-up-open'],
					['counseling_records', 'counseling-active'],
					['personnel_documents', 'document-active'],
					['leader_notes', 'note-active']
				]) {
					expect(await ctx.store.findOne(table, ctx.auth.orgId, { id })).toMatchObject({ archived_at: null });
				}
				expect(await ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-open' })).toMatchObject(
					{ status: 'open' }
				);
				expect(
					await ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-completed' })
				).toMatchObject({ status: 'completed', archived_at: null });
				expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-independent' })).toMatchObject({
					archived_at: olderArchive
				});
			} finally {
				vi.useRealTimers();
			}
		}
	);

	it('returns requiresApproval for non-privileged, non-full-editor users', async () => {
		const ctx = buildContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archive(ctx, 'p-1');
		expect(result).toMatchObject({ requiresApproval: true });

		// Should NOT have archived
		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeNull();
	});

	it('archives directly for a configure-capable member', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archive(ctx, 'p-1');

		expect(result).toBeUndefined();
		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();
	});

	it.each([null, '2026-08-01T12:00:00.000Z'])(
		'denies out-of-scope archive and replay without effects (%s)',
		async (archivedAt) => {
			const ctx = buildContext({
				auth: {
					scopeSet: { kind: 'groups', groupIds: ['group-a'] }
				}
			});
			const { archive } = createPersonnelUseCases();
			seedPersonnel(ctx);
			await ctx.rawStore!.update('personnel', ctx.auth.orgId, 'p-1', { group_id: 'group-b', archived_at: archivedAt });
			const original = structuredClone(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'p-1' }));

			await expect(archive(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
			expect(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual(original);
			expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.archived' }));
		}
	);
});

describe('Personnel — restore', () => {
	function seedArchivedPersonnel(ctx: ReturnType<typeof buildContext>, overrides: Record<string, unknown> = {}) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: '2026-04-01T00:00:00Z',
				organization_id: ctx.auth.orgId,
				...overrides
			}
		]);
	}

	function seedArchivedArtifacts(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				status: 'archived',
				archived_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'follow-up-still-archived',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				status: 'archived',
				archived_at: '2026-03-01T00:00:00Z'
			}
		]);
		ctx.store.seed('counseling_records', [
			{
				id: 'counseling-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'document-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				archived_at: '2026-04-01T00:00:00Z'
			},
			{ id: 'note-independent', organization_id: 'test-org', personnel_id: 'p-1', archived_at: '2026-03-01T00:00:00Z' },
			{
				id: 'note-other-person',
				organization_id: 'test-org',
				personnel_id: 'p-2',
				archived_at: '2026-04-01T00:00:00Z'
			},
			{ id: 'note-other-org', organization_id: 'other-org', personnel_id: 'p-1', archived_at: '2026-04-01T00:00:00Z' }
		]);
	}

	it('restores archived personnel, owned artifacts and audit state without a subscription provider', async () => {
		const ctx = buildContext();
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx);
		seedArchivedArtifacts(ctx);

		const result = await restore(ctx, 'p-1');

		expect(result).toEqual({ success: true });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
		await expect(
			ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-restored' })
		).resolves.toMatchObject({
			status: 'open',
			archived_at: null
		});
		await expect(
			ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-still-archived' })
		).resolves.toMatchObject({ status: 'archived', archived_at: '2026-03-01T00:00:00Z' });
		await expect(
			ctx.store.findOne('counseling_records', ctx.auth.orgId, { id: 'counseling-restored' })
		).resolves.toMatchObject({ archived_at: null });
		await expect(
			ctx.store.findOne('personnel_documents', ctx.auth.orgId, { id: 'document-restored' })
		).resolves.toMatchObject({ archived_at: null });
		await expect(ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-restored' })).resolves.toMatchObject({
			archived_at: null
		});
		await expect(ctx.store.findOne('leader_notes', 'test-org', { id: 'note-independent' })).resolves.toMatchObject({
			archived_at: '2026-03-01T00:00:00Z'
		});
		await expect(ctx.store.findOne('leader_notes', 'test-org', { id: 'note-other-person' })).resolves.toMatchObject({
			archived_at: '2026-04-01T00:00:00Z'
		});
		await expect(ctx.store.findOne('leader_notes', 'other-org', { id: 'note-other-org' })).resolves.toMatchObject({
			archived_at: '2026-04-01T00:00:00Z'
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.restored',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: { name: 'SGT Smith, Jamie' }
			})
		);
	});

	it('rejects restore when the personnel record is missing', async () => {
		const ctx = buildContext();
		const { restore } = createPersonnelUseCases();

		await expect(restore(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects restore when the personnel record is not archived', async () => {
		const ctx = buildContext();
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx, { archived_at: null });

		await expect(restore(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
	});

	it('authorizes restore before returning archive-state errors', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(restore(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.restoreRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});

	it('enforces group scope using the archived personnel row group', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx, { group_id: 'group-b' });

		await expect(restore(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.restoreRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});

describe('Personnel — permanent delete', () => {
	function seedPersonnel(ctx: ReturnType<typeof createTestContext>, overrides: Record<string, unknown> = {}) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: '2026-04-01T00:00:00Z',
				organization_id: ctx.auth.orgId,
				...overrides
			}
		]);
	}

	it('deletes archived personnel, audits, and notifies admins', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await permanentlyDelete(ctx, 'p-1');

		expect(result).toEqual({ success: true });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toBeNull();
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.permanently_deleted',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: { name: 'SGT Smith, Jamie' }
			})
		);
		expect(ctx.notificationPort.notifications).toContainEqual({
			target: 'admins',
			orgId: ctx.auth.orgId,
			excludeUserId: ctx.auth.userId,
			notification: {
				type: 'personnel_permanently_deleted',
				title: 'Personnel Permanently Deleted',
				message: 'Personnel "SGT Smith, Jamie" was permanently deleted.'
			}
		});
	});

	it('rejects permanent delete when id is missing', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();

		await expect(permanentlyDelete(ctx, '')).rejects.toMatchObject({ status: 400 });
	});

	it('rejects permanent delete when the personnel record is missing', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();

		await expect(permanentlyDelete(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects permanent delete for active personnel', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx, { archived_at: null });

		await expect(permanentlyDelete(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
	});

	it('authorizes permanent delete before returning archive-state errors', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(permanentlyDelete(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
		expect(ctx.notificationPort.notifications).toHaveLength(0);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.permanentlyDeleteRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});

	it('enforces group scope using the archived personnel row group', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx, { group_id: 'group-b' });

		await expect(permanentlyDelete(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: '2026-04-01T00:00:00Z'
		});
		expect(ctx.notificationPort.notifications).toHaveLength(0);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.permanentlyDeleteRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});

describe('Personnel — archive batch', () => {
	function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			},
			{
				id: 'p-2',
				rank: 'SSG',
				last_name: 'Jones',
				first_name: 'Pat',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);
	}

	function seedPersonnelArtifacts(ctx: ReturnType<typeof createTestContext>) {
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-p1',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status: 'open',
				archived_at: null
			},
			{
				id: 'follow-up-p2',
				organization_id: 'test-org',
				personnel_id: 'p-2',
				status: 'open',
				archived_at: null
			}
		]);
		ctx.store.seed('counseling_records', [
			{ id: 'counseling-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'counseling-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
		ctx.store.seed('personnel_documents', [
			{ id: 'document-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'document-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
		ctx.store.seed('leader_notes', [
			{ id: 'note-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'note-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
	}

	it('archives multiple personnel through one use case call', async () => {
		const ctx = createTestContext();
		const { archiveBatch } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: ['p-1', 'p-2'],
			approvalRequestedIds: [],
			errors: []
		});
		const stored = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(stored.every((person) => person.archived_at)).toBe(true);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.bulk_archived',
				resourceType: 'personnel',
				details: expect.objectContaining({ count: 2, ids: ['p-1', 'p-2'] })
			})
		);
	});

	it('archives personnel-owned artifacts for every directly archived personnel record', async () => {
		const ctx = createTestContext();
		const { archiveBatch } = createPersonnelUseCases();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		const followUps = (await ctx.store.findMany('personnel_follow_ups', 'test-org')) as Record<string, unknown>[];
		const counselings = (await ctx.store.findMany('counseling_records', 'test-org')) as Record<string, unknown>[];
		const documents = (await ctx.store.findMany('personnel_documents', 'test-org')) as Record<string, unknown>[];
		const notes = (await ctx.store.findMany('leader_notes', 'test-org')) as Record<string, unknown>[];

		expect(followUps.every((row) => row.status === 'archived' && row.archived_at)).toBe(true);
		expect(counselings.every((row) => row.archived_at)).toBe(true);
		expect(documents.every((row) => row.archived_at)).toBe(true);
		expect(notes.every((row) => row.archived_at)).toBe(true);
	});

	it('retains an already-archived event while archiving the active candidate in a mixed batch', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);
		const archivedAt = '2026-08-01T12:00:00.000Z';
		await ctx.store.update('personnel', ctx.auth.orgId, 'p-2', { archived_at: archivedAt });
		const original = structuredClone(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-2' }));
		const result = await createPersonnelUseCases().archiveBatch(ctx, {
			ids: ['p-1', 'p-2', 'missing'],
			userEmail: 'requester@example.com'
		});
		expect(result).toEqual({
			archivedIds: ['p-1'],
			approvalRequestedIds: [],
			errors: [
				{ id: 'p-2', message: 'Personnel is already archived' },
				{ id: 'missing', message: 'Personnel not found' }
			]
		});
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-2' })).toEqual(original);
		expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-p2' })).toMatchObject({
			archived_at: null
		});
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toMatchObject({
			archived_at: expect.any(String)
		});
	});

	it('creates archival requests in the same call when direct archive requires approval', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		const { archiveBatch } = createPersonnelUseCases();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		const result = await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: [],
			approvalRequestedIds: ['p-1', 'p-2'],
			errors: []
		});
		await expect(ctx.store.findMany('leader_notes', 'test-org')).resolves.toEqual([
			expect.objectContaining({ id: 'note-p1', archived_at: null }),
			expect.objectContaining({ id: 'note-p2', archived_at: null })
		]);
		const requests = (await ctx.store.findMany('deletion_requests', 'test-org')) as Record<string, unknown>[];
		expect(requests).toHaveLength(2);
		expect(requests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-1', status: 'pending' }),
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-2', status: 'pending' })
			])
		);
	});
});
