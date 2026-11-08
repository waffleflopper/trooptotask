import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationSettingsReader } from './settingsProvider.server';
import { loadPersonnelDocumentStorageCapBytes } from './personnelDocumentSettings.server';

const ORG = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const OTHER = '22222222-2222-4222-8222-222222222222';

function fixture(value: number | null | 'missing' | 'failure') {
	const requests: { method: string; select: string | null }[] = [];
	const columns = [
		'name',
		'archive_retention_months',
		'loss_warning_window_days',
		'training_readiness_goal_percent',
		'strength_floor_percent',
		'personnel_document_storage_cap_bytes'
	];
	const rows: { id: string; [field: string]: unknown }[] = [
		{ id: ORG, ...Object.fromEntries(columns.map((column) => [column, value])), name: 'Alpha Company' },
		{ id: OTHER, ...Object.fromEntries(columns.map((column) => [column, 99])), name: 'Other Company' }
	];
	const invitations = [
		{ id: 'later', email: 'later@example.invalid', expires_at: '2030-01-09T00:00:00.000Z', outbox: ['sent'] },
		{ id: 'failed', email: 'failed@example.invalid', expires_at: '2030-01-05T00:00:00.000Z', outbox: ['failed'] },
		{ id: 'undelivered', email: 'none@example.invalid', expires_at: '2030-01-07T00:00:00.000Z', outbox: [] },
		{ id: 'lapsed', email: 'lapsed@example.invalid', expires_at: '2029-12-31T00:00:00.000Z', outbox: ['failed'] }
	].map((row) => ({ organization_id: ORG, status: 'pending', ...row }));
	invitations.push(
		{
			id: 'accepted',
			email: 'a@example.invalid',
			expires_at: '2030-01-08T00:00:00.000Z',
			outbox: [],
			organization_id: ORG,
			status: 'accepted'
		},
		{
			id: 'foreign',
			email: 'f@example.invalid',
			expires_at: '2030-01-08T00:00:00.000Z',
			outbox: [],
			organization_id: OTHER,
			status: 'pending'
		}
	);
	const supabase = createClient('http://settings.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const select = url.searchParams.get('select');
				requests.push({ method: init?.method ?? 'GET', select });
				if (value === 'failure') return Response.json({ message: 'Settings unavailable' }, { status: 400 });
				if (url.pathname === '/rest/v1/organization_invitations') {
					const floor = url.searchParams.get('expires_at')?.replace('gt.', '') ?? '';
					const selected = invitations
						.filter(
							(row) =>
								url.searchParams.get('organization_id') === `eq.${row.organization_id}` &&
								url.searchParams.get('status') === `eq.${row.status}` &&
								row.expires_at > floor
						)
						.sort((a, b) => a.expires_at.localeCompare(b.expires_at));
					return Response.json(
						selected.map((row) => ({
							id: row.id,
							email: row.email,
							expires_at: row.expires_at,
							organization_invitation_email_outbox: row.outbox.map((status) => ({ status }))
						}))
					);
				}
				if (url.pathname !== '/rest/v1/organizations' || !select) throw new Error('Unexpected settings source');
				const fields = select.split(',').map((column) => column.trim());
				if (fields.some((field) => !columns.includes(field))) throw new Error('Unrequested Organization data');
				const row = value === 'missing' ? null : rows.find((row) => url.searchParams.get('id') === `eq.${row.id}`);
				return Response.json(row ? Object.fromEntries(fields.map((field) => [field, row[field]])) : null);
			}
		}
	});
	return { reader: createSupabaseOrganizationSettingsReader(supabase), requests };
}

describe('Organization runtime settings with the actual SDK', () => {
	it('resolves only requested same-Organization contributor labels and skips empty inputs', async () => {
		const first = '11111111-1111-4111-8111-111111111111';
		const second = '33333333-3333-4333-8333-333333333333';
		const calls: URL[] = [];
		const members = [
			{
				id: 'a',
				organization_id: ORG,
				user_id: first,
				display_name: '  Alpha Medic  ',
				email: 'alpha@example.invalid'
			},
			{ id: 'b', organization_id: ORG, user_id: second, email: 'second@example.invalid' },
			{ id: 'c', organization_id: OTHER, user_id: first, display_name: 'Foreign Member' }
		];
		const client = createClient('http://settings.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input) => {
					const url = new URL(String(input));
					calls.push(url);
					const ids = url.searchParams.get('user_id')?.slice(4, -1).split(',') ?? [];
					return Response.json(
						members.filter(
							(row) =>
								url.searchParams.get('organization_id') === `eq.${row.organization_id}` && ids.includes(row.user_id)
						)
					);
				}
			}
		});
		const reader = createSupabaseOrganizationSettingsReader(client);
		expect(await reader.findMemberLabels(ORG, ['invalid'])).toEqual(new Map());
		expect(calls).toHaveLength(0);
		expect(await reader.findMemberLabels(ORG.toUpperCase(), [first, first, second])).toEqual(
			new Map([
				[first, 'Alpha Medic'],
				[second, 'second@example.invalid']
			])
		);
		await expect(fixture('failure').reader.findMemberLabels(ORG, [first])).rejects.toThrow('Settings unavailable');
	});
	it('constructs lazily and reads only the requested policy/scalar facts for the canonical Organization', async () => {
		const { reader, requests } = fixture(0);
		expect(requests).toEqual([]);
		expect(await reader.findPolicies(ORG.toUpperCase())).toEqual({
			archiveRetentionMonths: 0,
			lossWarningWindowDays: 0,
			trainingReadinessGoalPercent: 0,
			strengthFloorPercent: 0
		});
		expect(await reader.findArchiveRetentionMonths(ORG)).toBe(0);
		expect(await reader.findLossWarningWindowDays(ORG)).toBe(0);
		expect(await reader.findStorageCapBytes(ORG)).toBe(0);
		expect(requests.map((request) => request.select?.split(',').map((column) => column.trim()))).toEqual([
			[
				'archive_retention_months',
				'loss_warning_window_days',
				'training_readiness_goal_percent',
				'strength_floor_percent'
			],
			['archive_retention_months'],
			['loss_warning_window_days'],
			['personnel_document_storage_cap_bytes']
		]);
	});
	it('reads only the canonical Organization name and readiness goal for a Training briefing', async () => {
		const { reader, requests } = fixture(85);
		expect(await reader.findTrainingBriefingContext(ORG.toUpperCase())).toEqual({
			name: 'Alpha Company',
			trainingReadinessGoalPercent: 85
		});
		expect(await fixture('missing').reader.findTrainingBriefingContext(ORG)).toBeNull();
		await expect(fixture('failure').reader.findTrainingBriefingContext(ORG)).rejects.toThrow('Settings unavailable');
		expect(requests.map((request) => request.select)).toEqual(['name,training_readiness_goal_percent']);
	});
	it("lists only this Organization's pending invitations that have not expired, with the latest delivery status", async () => {
		const { reader } = fixture(0);
		expect(
			await reader.listUnexpiredPendingInvitations(ORG.toUpperCase(), new Date('2030-01-01T00:00:00.000Z'))
		).toEqual([
			{
				id: 'failed',
				email: 'failed@example.invalid',
				expiresAt: '2030-01-05T00:00:00.000Z',
				latestDeliveryStatus: 'failed'
			},
			{
				id: 'undelivered',
				email: 'none@example.invalid',
				expiresAt: '2030-01-07T00:00:00.000Z',
				latestDeliveryStatus: null
			},
			{
				id: 'later',
				email: 'later@example.invalid',
				expiresAt: '2030-01-09T00:00:00.000Z',
				latestDeliveryStatus: 'sent'
			}
		]);
	});
	it.each([null, 'missing'] as const)(
		'keeps missing document defaults at the owning application boundary (%s)',
		async (value) => {
			const { reader } = fixture(value);
			expect(await loadPersonnelDocumentStorageCapBytes(reader, ORG)).toBe(104857600);
		}
	);
	it('propagates provider failures from each narrow read and document-cap loading', async () => {
		const { reader } = fixture('failure');
		await expect(reader.findPolicies(ORG)).rejects.toThrow('Settings unavailable');
		await expect(reader.findArchiveRetentionMonths(ORG)).rejects.toThrow('Settings unavailable');
		await expect(reader.findLossWarningWindowDays(ORG)).rejects.toThrow('Settings unavailable');
		await expect(reader.findStorageCapBytes(ORG)).rejects.toThrow('Settings unavailable');
		await expect(reader.listUnexpiredPendingInvitations(ORG, new Date())).rejects.toThrow('Settings unavailable');
		await expect(loadPersonnelDocumentStorageCapBytes(reader, ORG)).rejects.toThrow('Settings unavailable');
	});
});
