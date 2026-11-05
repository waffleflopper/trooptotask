import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createQueryPortsContext } from '$lib/server/adapters/inMemory';
import {
	createSupabaseOrganizationAuditStore,
	type OrganizationAuditRow,
	type OrganizationAuditStore
} from '$lib/audit/index.server';
import { createSupabasePersonnelNamesReader } from '$features/personnel/index.server';
import { createSupabaseTrainingTypeNamesReader } from '$features/training/index.server';
import { createSupabaseStatusTypeNamesReader } from '$features/calendar/index.server';
import { createSupabaseOrganizationMemberEmailsReader } from '$features/organization/index.server';
import type { Personnel, PersonnelRosterReader } from '$features/personnel/contracts';
import { loadLogsFilterOptions, loadLogsSettings } from './settingsLogs.server';

const VIEWER = { timeZone: 'America/New_York', now: new Date('2026-10-20T02:00:00Z'), filters: {} };

const none = async () => new Map<string, string>();
const NO_LABELS = { personnelNames: none, trainingTypeNames: none, statusTypeNames: none, actorEmails: none };

describe('loadLogsSettings', () => {
	it("reads the first page for the URL filters, with days read in the viewer's time zone", async () => {
		const ctx = createQueryPortsContext();
		const requested: Parameters<OrganizationAuditStore['listLogs']>[0][] = [];
		const store: OrganizationAuditStore = {
			listLogs: async (request) => {
				requested.push(request);
				return { logs: [], hasMore: false };
			},
			listActions: async () => []
		};
		const filters = { kind: 'availability.deleted', from: '2026-10-19', to: '2026-10-19' };

		const result = loadLogsSettings(ctx, store, NO_LABELS, { ...VIEWER, filters });

		expect(result).toMatchObject({ today: '2026-10-19', timeZone: 'America/New_York', filters });
		await expect(result.auditLog).resolves.toEqual({ logs: [], nextCursor: null });
		expect(requested).toHaveLength(1);
		expect(requested[0]).toMatchObject({
			orgId: ctx.auth.orgId,
			filters: {
				action: 'availability.deleted',
				since: '2026-10-19T04:00:00.000Z',
				until: '2026-10-20T04:00:00.000Z'
			}
		});
	});

	it('offers a cursor when more entries follow the page', async () => {
		const ctx = createQueryPortsContext();
		const id = '11111111-1111-4111-8111-111111111111';
		const store: OrganizationAuditStore = {
			listLogs: async () => ({
				logs: [
					{ id, action: 'personnel.updated', timestamp: '2026-10-01T12:00:00.123456+00:00' } as OrganizationAuditRow
				],
				hasMore: true
			}),
			listActions: async () => []
		};

		const result = await loadLogsSettings(ctx, store, NO_LABELS, VIEWER).auditLog;

		expect(result.nextCursor).toBe(`2026-10-01T12:00:00.123456+00:00_${id}`);
	});
});

describe('loadLogsFilterOptions', () => {
	const people = [
		{ id: 'p-1', rank: 'SGT', lastName: 'Rivera', firstName: 'Sam', archivedAt: null },
		{ id: 'p-2', rank: 'SPC', lastName: 'Able', firstName: 'Jane', archivedAt: '2026-01-01T00:00:00Z' }
	] as Personnel[];
	const store = { listLogs: async () => ({ logs: [], hasMore: false }), listActions: async () => ['org.renamed'] };
	const roster = { list: async () => people } as unknown as PersonnelRosterReader;

	it('offers every person on the roster, the members and the recorded actions', async () => {
		const ctx = createQueryPortsContext();

		await expect(
			loadLogsFilterOptions(ctx, { roster, memberLabels: async () => ({ 'u-1': 'SSG Doe, Pat' }), store })
		).resolves.toEqual({
			people: [
				{ id: 'p-1', label: 'SGT Rivera, Sam', archived: false },
				{ id: 'p-2', label: 'SPC Able, Jane', archived: true }
			],
			members: [{ userId: 'u-1', label: 'SSG Doe, Pat' }],
			actions: ['org.renamed']
		});
	});

	it('fails as a whole when one source fails, so the pickers never show a partial list', async () => {
		const ctx = createQueryPortsContext();
		const failing = async () => {
			throw new Error('Members unavailable');
		};

		await expect(loadLogsFilterOptions(ctx, { roster, memberLabels: failing, store })).rejects.toThrow(
			'Members unavailable'
		);
	});
});

describe('admitted Logs source composition', () => {
	it('binds same-Organization source labels and exact emails while preserving masking and saved actor precedence', async () => {
		const ctx = createQueryPortsContext();
		const orgId = ctx.auth.orgId;
		const person = '11111111-1111-4111-8111-111111111111';
		const training = '22222222-2222-4222-8222-222222222222';
		const status = '33333333-3333-4333-8333-333333333333';
		const foreign = '44444444-4444-4444-8444-444444444444';
		const sourceRows: Record<string, Record<string, unknown>[]> = {};
		sourceRows.personnel = [
			{
				id: person,
				organization_id: orgId,
				rank: 'SPC',
				last_name: 'Able',
				first_name: 'Synthetic',
				archived_at: '2026-01-01'
			},
			{ id: foreign, organization_id: 'foreign-org', rank: 'SFC', last_name: 'Foreign', first_name: 'Person' }
		];
		sourceRows.training_types = [
			{ id: training, organization_id: orgId, name: 'Training Required' },
			{ id: foreign, organization_id: 'foreign-org', name: 'Foreign Training' }
		];
		sourceRows.status_types = [
			{ id: status, organization_id: orgId, name: 'Leave' },
			{ id: foreign, organization_id: 'foreign-org', name: 'Foreign Status' }
		];
		sourceRows.organization_memberships = [
			{
				id: 'membership',
				organization_id: orgId,
				user_id: 'actor-a',
				email: ' Owner@Example.test ',
				name: 'Wrong display name'
			},
			{ id: 'foreign-membership', organization_id: 'foreign-org', user_id: 'actor-b', email: 'foreign@example.test' }
		];
		const base = {
			action: 'training_record.updated',
			resource_type: 'training_record',
			resource_id: training,
			timestamp: '2026-10-01T12:00:00Z'
		};
		const rows = [
			{
				...base,
				id: 'labeled',
				user_id: 'actor-a',
				details: {
					personnel_id: person,
					training_type_id: training,
					status_type_id: status,
					notes: '[redacted]',
					email: 's***@example.test'
				}
			},
			{ ...base, id: 'saved-actor', user_id: 'actor-a', details: { actor: '' } },
			{
				...base,
				id: 'unresolved',
				user_id: 'actor-b',
				details: {
					personnel_id: foreign,
					training_type_id: foreign,
					status_type_id: foreign,
					unknown_reference: foreign.toUpperCase(),
					subject_label: 'Saved subject'
				}
			}
		];
		const client = createClient('http://127.0.0.1:1', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (url.pathname.includes('/rpc/')) return Response.json([{ action: base.action }]);
					if (url.pathname.endsWith('/audit_logs'))
						return new Response(request.method === 'HEAD' ? null : JSON.stringify(rows), {
							headers: { 'Content-Type': 'application/json', 'Content-Range': '0-2/3' }
						});
					const table = url.pathname.split('/').at(-1)!;
					const result = sourceRows[table].filter((row) =>
						[...url.searchParams].every(([column, filter]) => {
							if (['select', 'order', 'offset', 'limit'].includes(column)) return true;
							if (filter.startsWith('eq.')) return row[column] === filter.slice(3);
							if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[column]));
							throw new Error('Unexpected provider filter');
						})
					);
					return Response.json(result);
				}
			}
		});
		const result = await loadLogsSettings(
			ctx,
			createSupabaseOrganizationAuditStore(client),
			{
				personnelNames: createSupabasePersonnelNamesReader(client, orgId),
				trainingTypeNames: createSupabaseTrainingTypeNamesReader(client, orgId),
				statusTypeNames: createSupabaseStatusTypeNamesReader(client, orgId),
				actorEmails: createSupabaseOrganizationMemberEmailsReader(client, orgId)
			},
			VIEWER
		).auditLog;
		expect(result.logs).toEqual([
			expect.objectContaining({
				id: 'labeled',
				userId: 'actor-a',
				resourceId: training,
				actor: ' Owner@Example.test ',
				details: {
					personnel: 'SPC Able Synthetic',
					training_type: 'Training Required',
					status_type: 'Leave',
					notes: '[redacted]',
					email: 's***@example.test'
				}
			}),
			expect.objectContaining({ id: 'saved-actor', actor: '', details: { actor: '' } }),
			expect.objectContaining({ id: 'unresolved', actor: null, details: { subject_label: 'Saved subject' } })
		]);
		expect(result.nextCursor).toBeNull();
	});

	it.each(['personnel', 'training_types', 'status_types', 'organization_memberships'])(
		'rejects Logs when the required %s label source fails',
		async (failedTable) => {
			const ctx = createQueryPortsContext();
			const reference = '11111111-1111-4111-8111-111111111111';
			const client = createClient('http://logs.invalid', 'synthetic-privileged-key', {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
				global: {
					fetch: async (input, init) => {
						const request = new Request(input, init);
						const table = new URL(request.url).pathname.split('/').at(-1);
						if (table === failedTable) return Response.json({ message: 'Current labels unavailable' }, { status: 400 });
						if (table !== 'audit_logs') return Response.json([]);
						return new Response(
							request.method === 'HEAD'
								? null
								: JSON.stringify([
										{
											id: 'event-1',
											user_id: 'actor-1',
											action: 'training_record.updated',
											resource_type: 'training_record',
											resource_id: reference,
											details: { personnel_id: reference, training_type_id: reference, status_type_id: reference },
											timestamp: '2026-10-01T12:00:00Z'
										}
									]),
							{ headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }
						);
					}
				}
			});
			await expect(
				loadLogsSettings(
					ctx,
					createSupabaseOrganizationAuditStore(client),
					{
						personnelNames: createSupabasePersonnelNamesReader(client, ctx.auth.orgId),
						trainingTypeNames: createSupabaseTrainingTypeNamesReader(client, ctx.auth.orgId),
						statusTypeNames: createSupabaseStatusTypeNamesReader(client, ctx.auth.orgId),
						actorEmails: createSupabaseOrganizationMemberEmailsReader(client, ctx.auth.orgId)
					},
					VIEWER
				).auditLog
			).rejects.toThrow('Current labels unavailable');
		}
	);
});
