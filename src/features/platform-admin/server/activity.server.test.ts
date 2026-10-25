import { describe, expect, it } from 'vitest';
import type { PlatformActivityInput, PlatformActivityResult } from '$lib/audit/contracts';
import { activityScope, describeAuditEvent } from '../auditSentences';
import { listPlatformActivity } from './activity.server';

const viewer = 'viewer-1';
const noSuspensions = { listCurrentSuspensions: async () => [] };
const everything = { category: null, q: '', from: '', to: '', page: 1 };

function recordingAudit(result: Partial<PlatformActivityResult> = {}) {
	const inputs: PlatformActivityInput[] = [];
	return {
		inputs,
		audit: {
			async listActivity(input: PlatformActivityInput): Promise<PlatformActivityResult> {
				inputs.push(input);
				return { events: [], totalCount: 0, page: input.page, limit: input.limit ?? 0, ...result };
			}
		}
	};
}

describe('listPlatformActivity', () => {
	it('asks for one page of 50 with the registry scope for the chosen category and the search text', async () => {
		const { audit, inputs } = recordingAudit();

		await listPlatformActivity(
			audit,
			{ ...everything, category: 'security', q: 'pat', page: 3 },
			'UTC',
			viewer,
			noSuspensions
		);

		expect(inputs).toEqual([{ ...activityScope('security'), search: 'pat', from: null, to: null, page: 3, limit: 50 }]);
		expect(inputs[0].prefixes).toEqual([]);
	});

	it('widens All to every platform prefix', async () => {
		const { audit, inputs } = recordingAudit();

		await listPlatformActivity(audit, everything, 'UTC', viewer, noSuspensions);

		expect(inputs[0].prefixes).toContain('admin.');
		expect(inputs[0].actions).toContain('suspend_user');
	});

	it('turns the chosen days into a half-open range in the viewer time zone', async () => {
		const { audit, inputs } = recordingAudit();
		const range = { ...everything, from: '2026-10-21', to: '2026-10-22' };

		await listPlatformActivity(audit, range, 'UTC', viewer, noSuspensions);
		await listPlatformActivity(audit, range, 'America/Los_Angeles', viewer, noSuspensions);

		expect(inputs.map(({ from, to }) => [from?.toISOString(), to?.toISOString()])).toEqual([
			['2026-10-21T00:00:00.000Z', '2026-10-23T00:00:00.000Z'],
			['2026-10-21T07:00:00.000Z', '2026-10-23T07:00:00.000Z']
		]);
	});

	it('returns the page the database answered with, not the one asked for', async () => {
		const { audit } = recordingAudit({ page: 2, limit: 50, totalCount: 51 });

		await expect(
			listPlatformActivity(audit, { ...everything, page: 9 }, 'UTC', viewer, noSuspensions)
		).resolves.toEqual({
			events: [],
			page: 2,
			pageSize: 50,
			totalCount: 51,
			viewerId: viewer
		});
	});
});

it('joins private reasons for the current suspension in one batch without altering shared audit details', async () => {
	const row = (id: string, organizationId: string, timestamp: string, action = 'suspend_org') => ({
		id,
		timestamp,
		action,
		severity: 'critical',
		userId: viewer,
		orgId: organizationId,
		orgName: 'Alpha Company',
		actorEmail: 'operator@example.test',
		actorName: null,
		resourceType: 'organization',
		resourceId: organizationId,
		ipAddress: null,
		details: {}
	});
	const { audit } = recordingAudit({
		events: [
			row('current-a', 'org-a', '2026-10-25T12:00:01Z'),
			row('current-b', 'org-b', '2026-10-25T12:00:02Z'),
			row('older', 'org-a', '2026-10-24T12:00:00Z'),
			row('lifted', 'org-a', '2026-10-25T11:00:00Z', 'unsuspend_org'),
			row('legacy', 'org-c', '2026-10-24T12:00:00Z')
		]
	});
	const batches: string[][] = [];
	const page = await listPlatformActivity(audit, everything, 'UTC', viewer, {
		async listCurrentSuspensions(ids) {
			batches.push(ids);
			return [
				{ organizationId: 'org-a', reason: 'Confirm unit ownership', suspendedAt: '2026-10-25T12:00:00Z' },
				{ organizationId: 'org-b', reason: 'Requested by commander', suspendedAt: '2026-10-25T12:00:00Z' }
			];
		}
	});
	expect(batches).toEqual([['org-a', 'org-b', 'org-c']]);
	expect(page.events.map((event) => describeAuditEvent(event).secondary)).toEqual([
		'Reason: Confirm unit ownership',
		'Reason: Requested by commander',
		null,
		null,
		null
	]);
	expect(describeAuditEvent(page.events[0], { viewerId: viewer }).sentence).toBe('You suspended Alpha Company');
	expect(page.events.map((event) => event.details)).toEqual([{}, {}, {}, {}, {}]);
});

it('does not look up private notes for a page without Organization suspensions', async () => {
	const { audit } = recordingAudit();
	const page = await listPlatformActivity(audit, everything, 'UTC', viewer, {
		listCurrentSuspensions: async () => {
			throw new Error('No lookup expected');
		}
	});
	expect(page).toEqual({ events: [], page: 1, pageSize: 50, totalCount: 0, viewerId: viewer });
});

it('fails Activity when its required private-note source is unavailable', async () => {
	const { audit } = recordingAudit({
		events: [
			{
				id: 'event',
				timestamp: '2026-10-25T12:00:00Z',
				action: 'suspend_org',
				severity: 'critical',
				userId: viewer,
				orgId: 'org-a',
				orgName: 'Alpha',
				actorEmail: null,
				actorName: null,
				resourceType: 'organization',
				resourceId: 'org-a',
				ipAddress: null,
				details: {}
			}
		]
	});
	await expect(
		listPlatformActivity(audit, everything, 'UTC', viewer, {
			listCurrentSuspensions: async () => {
				throw new Error('Organization support facts were unavailable');
			}
		})
	).rejects.toThrow('Organization support facts were unavailable');
});
