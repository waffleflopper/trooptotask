import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseFeedbackReviewStore, listFeedbackExportRows } from '$features/feedback/index.server';
import {
	createSupabaseAccountAnnouncementDismissals,
	createSupabaseNotificationStore
} from '$features/notifications/index.server';
import { createSupabaseOrganizationAdministratorRecipients } from '$features/organization/index.server';
import { listActiveAnnouncementContent } from '$features/platform-admin/index.server';

const ORGANIZATION = 'org-a';
const ACCOUNT = 'account-a';
const EXPECTED_IDS = Array.from({ length: 1003 }, (_, index) => `row-${String(index).padStart(4, '0')}`);

interface ReadCase {
	name: string;
	table: string;
	identityColumn?: 'user_id' | 'announcement_id';
	review?: boolean;
	read(client: SupabaseClient): Promise<string[]>;
}

const reads: ReadCase[] = [
	{
		name: 'Feedback export',
		table: 'beta_feedback',
		read: async (client) => (await listFeedbackExportRows(client, ORGANIZATION)).map(({ id }) => id)
	},
	{
		name: 'Feedback review with tied dates',
		table: 'beta_feedback',
		review: true,
		read: async (client) => (await createSupabaseFeedbackReviewStore(client).listFeedback()).map(({ id }) => id)
	},
	{
		name: 'Organization administrator recipients',
		table: 'organization_memberships',
		identityColumn: 'user_id',
		read: async (client) =>
			(await createSupabaseOrganizationAdministratorRecipients(() => client)(ORGANIZATION)).userIds
	},
	{
		name: 'Notification unread identities',
		table: 'notifications',
		read: (client) => createSupabaseNotificationStore(client).listOwnUnreadIds(ORGANIZATION, ACCOUNT)
	},
	{
		name: 'Notification export',
		table: 'notifications',
		read: async (client) =>
			(await createSupabaseNotificationStore(client).listOwnExportRows(ORGANIZATION, ACCOUNT)).map(({ id }) =>
				String(id)
			)
	},
	{
		name: 'Account announcement dismissals',
		table: 'announcement_dismissals',
		identityColumn: 'announcement_id',
		read: (client) => createSupabaseAccountAnnouncementDismissals(client, ACCOUNT).listDismissedIds()
	},
	{
		name: 'Platform active announcement content',
		table: 'platform_announcements',
		read: async (client) => (await listActiveAnnouncementContent(client)).map(({ id }) => id)
	}
];

/** Model PostgREST reads over an unchanged dataset whose physical scan order varies per request. */
function pagedClient(testCase: ReadCase) {
	const rows: Record<string, unknown>[] = EXPECTED_IDS.map((id) => ({
		id,
		user_id: testCase.identityColumn === 'user_id' ? id : ACCOUNT,
		announcement_id: id,
		organization_id: ORGANIZATION,
		role: 'admin',
		read: false,
		is_active: true,
		expires_at: null,
		created_at: '2026-09-30T12:00:00Z',
		user_email: 'account@example.test',
		category: 'general',
		message: 'Retained communications',
		organization_name: 'Organization A',
		page_url: null,
		status: 'new',
		admin_notes: null,
		title: 'Announcement',
		type: 'info'
	}));
	if (testCase.review) {
		// Their identities sort opposite to their dates; review must retain newest-first ordering.
		rows.push(
			{ ...rows[0], id: 'zz-new-review', created_at: '2026-10-01T12:00:00Z' },
			{ ...rows[0], id: '00-old-review', created_at: '2026-09-01T12:00:00Z' }
		);
	}
	let requestNumber = 0;
	return createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (request.method !== 'GET' || url.pathname !== `/rest/v1/${testCase.table}`) {
					throw new Error('Unexpected communications provider request');
				}
				const physicalRows = requestNumber++ % 2 === 0 ? rows.toReversed() : [...rows];
				const selected = physicalRows.filter((row) => {
					for (const [column, expression] of url.searchParams) {
						if (expression.startsWith('eq.') && String(row[column]) !== expression.slice(3)) return false;
						if (expression.startsWith('in.(') && !expression.slice(4, -1).split(',').includes(String(row[column]))) {
							return false;
						}
					}
					return true;
				});
				const ordering = url.searchParams.get('order')?.split(',') ?? [];
				selected.sort((left, right) => {
					for (const term of ordering) {
						const [column, direction] = term.split('.');
						const compared = String(left[column]).localeCompare(String(right[column]));
						if (compared) return direction === 'desc' ? -compared : compared;
					}
					return 0;
				});
				const offset = Number(url.searchParams.get('offset') ?? 0);
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				const columns = url.searchParams.get('select') ?? '*';
				return Response.json(
					selected
						.slice(offset, offset + limit)
						.map((row) =>
							columns === '*'
								? row
								: Object.fromEntries(columns.split(',').map((column) => [column.trim(), row[column.trim()]]))
						)
				);
			}
		}
	});
}

describe('complete communications pagination over the actual SDK HTTP boundary', () => {
	it.each(reads)('$name retains every identity once when physical page order changes', async (testCase) => {
		const expected = testCase.review ? ['zz-new-review', ...EXPECTED_IDS, '00-old-review'] : EXPECTED_IDS;
		const ids = await testCase.read(pagedClient(testCase));

		expect(ids).toHaveLength(expected.length);
		expect(new Set(ids)).toEqual(new Set(expected));
		if (testCase.review) {
			expect(ids[0]).toBe('zz-new-review');
			expect(ids.at(-1)).toBe('00-old-review');
		}
	});
});
