import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { describe, it, expect, vi } from 'vitest';
import {
	createTestContext as basecreateTestContext,
	createWritePortsContext as basecreateWritePortsContext
} from '$lib/server/adapters/inMemory';

import {
	archivePersonnelRecord,
	restorePersonnelRecord,
	permanentlyDeletePersonnelRecord,
	archiveApprovedPersonnelRecord
} from './personnelLifecycle.server';
const createWritePortsContext = (overrides?: Parameters<typeof basecreateWritePortsContext>[0]) =>
	withPersonnelPersistence(basecreateWritePortsContext(overrides));
const createTestContext = (overrides?: Parameters<typeof basecreateTestContext>[0]) =>
	withPersonnelPersistence(basecreateTestContext(overrides));
function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

function deleteWithTestNotification(ctx: ReturnType<typeof createTestContext>, id: string) {
	return permanentlyDeletePersonnelRecord(ctx, id, () =>
		ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'synthetic_notification',
			title: 'Synthetic notification',
			message: 'Synthetic notification'
		})
	);
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
		seedPersonnel(ctx);

		await archivePersonnelRecord(ctx, 'p-1');

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.archived',
			resourceId: 'p-1'
		});
	});

	it('archives personnel-owned artifacts without reopening completed follow-ups later', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		await archivePersonnelRecord(ctx, 'p-1');

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
					async setLeaderNoteArchivedAt(row, archivedAt) {
						if (failNote) {
							failNote = false;
							throw new Error('note archive interrupted');
						}
						await writer.setLeaderNoteArchivedAt(row, archivedAt);
					}
				};
			};
			const firstArchive = '2026-09-30T14:00:00.000Z';
			vi.useFakeTimers({ toFake: ['Date'] });
			try {
				vi.setSystemTime(new Date(firstArchive));
				if (interrupted) await expect(archivePersonnelRecord(ctx, 'p-1')).rejects.toThrow('note archive interrupted');
				else await archivePersonnelRecord(ctx, 'p-1');
				expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual({
					...original,
					archived_at: firstArchive
				});
				vi.setSystemTime(new Date('2026-09-30T14:05:00.000Z'));
				await archivePersonnelRecord(ctx, 'p-1');
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
				await restorePersonnelRecord(ctx, 'p-1');
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
		seedPersonnel(ctx);

		const result = await archivePersonnelRecord(ctx, 'p-1');
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
		seedPersonnel(ctx);

		const result = await archivePersonnelRecord(ctx, 'p-1');

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
			seedPersonnel(ctx);
			await ctx.rawStore!.update('personnel', ctx.auth.orgId, 'p-1', { group_id: 'group-b', archived_at: archivedAt });
			const original = structuredClone(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'p-1' }));

			await expect(archivePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
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
		seedArchivedPersonnel(ctx);
		seedArchivedArtifacts(ctx);

		const result = await restorePersonnelRecord(ctx, 'p-1');

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

		await expect(restorePersonnelRecord(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects restore when the personnel record is not archived', async () => {
		const ctx = buildContext();
		seedArchivedPersonnel(ctx, { archived_at: null });

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
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
		seedArchivedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
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
		seedArchivedPersonnel(ctx, { group_id: 'group-b' });

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
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

	it('deletes archived personnel, audits, and supplies its saved name to delivery', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);

		const notify = vi.fn(async (_name: string) => {});
		const result = await permanentlyDeletePersonnelRecord(ctx, 'p-1', notify);

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
		expect(notify).toHaveBeenCalledWith('SGT Smith, Jamie');
	});

	it.each(['resolve', 'reject'] as const)(
		'persists deletion and audit before waiting for administrator notification to %s',
		async (completion) => {
			const ctx = createTestContext();
			seedPersonnel(ctx);
			let startNotification!: () => void;
			const notificationStarted = new Promise<void>((resolve) => {
				startNotification = resolve;
			});
			let releaseNotification!: () => void;
			let rejectNotification!: (reason: Error) => void;
			const notificationPending = new Promise<void>((resolve, reject) => {
				releaseNotification = resolve;
				rejectNotification = reject;
			});
			let atNotification: { person: unknown; auditEvents: typeof ctx.auditPort.events } | undefined;
			const notifyAdmins = ctx.notifications.notifyAdmins.bind(ctx.notifications);
			ctx.notifications.notifyAdmins = async (...args) => {
				atNotification = {
					person: structuredClone(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })),
					auditEvents: structuredClone(ctx.auditPort.events)
				};
				startNotification();
				await notificationPending;
				await notifyAdmins(...args);
			};

			let settled = false;
			const deletion = deleteWithTestNotification(ctx, 'p-1');
			void deletion.then(
				() => {
					settled = true;
				},
				() => {
					settled = true;
				}
			);
			await notificationStarted;
			await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toBeNull();
			expect(atNotification?.person).toBeNull();
			expect(atNotification?.auditEvents).toContainEqual(
				expect.objectContaining({ action: 'personnel.permanently_deleted', resourceId: 'p-1' })
			);
			expect(settled).toBe(false);

			if (completion === 'resolve') {
				releaseNotification();
				await expect(deletion).resolves.toEqual({ success: true });
			} else {
				const failure = new Error('administrator notification interrupted');
				rejectNotification(failure);
				await expect(deletion).rejects.toThrow('administrator notification interrupted');
			}
			await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toBeNull();
			expect(ctx.auditPort.events).toContainEqual(
				expect.objectContaining({ action: 'personnel.permanently_deleted', resourceId: 'p-1' })
			);
		}
	);

	it('rejects permanent delete when id is missing', async () => {
		const ctx = createTestContext();

		await expect(deleteWithTestNotification(ctx, '')).rejects.toMatchObject({ status: 400 });
	});

	it('rejects permanent delete when the personnel record is missing', async () => {
		const ctx = createTestContext();

		await expect(deleteWithTestNotification(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects permanent delete for active personnel', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, { archived_at: null });

		await expect(deleteWithTestNotification(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
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
		seedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(deleteWithTestNotification(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
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
		seedPersonnel(ctx, { group_id: 'group-b' });

		await expect(deleteWithTestNotification(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
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

describe('Personnel — approved archive effect', () => {
	it('rejects a direct approved-effect call from an ordinary Personnel configurator without changing the target', async () => {
		const ctx = createTestContext({ auth: { role: 'member', isPrivileged: false } });
		const person = {
			id: 'approved-person',
			organization_id: ctx.auth.orgId,
			group_id: null,
			archived_at: null
		};
		const note = {
			id: 'approved-note',
			organization_id: ctx.auth.orgId,
			personnel_id: person.id,
			archived_at: null
		};
		ctx.rawStore.seed('personnel', [structuredClone(person)]);
		ctx.rawStore.seed('leader_notes', [structuredClone(note)]);
		await expect(archiveApprovedPersonnelRecord(ctx, person.id)).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: person.id })).resolves.toEqual(person);
		await expect(ctx.rawStore.findOne('leader_notes', ctx.auth.orgId, { id: note.id })).resolves.toEqual(note);
		expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.archived' }));
	});
});
