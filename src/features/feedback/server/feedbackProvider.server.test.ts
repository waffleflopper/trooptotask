import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { FeedbackExportRow } from './feedbackPorts.server';
import {
	countPendingFeedback,
	createSupabaseFeedbackReviewStore,
	createSupabaseFeedbackSubmissionStore,
	listFeedbackExportRows
} from './feedbackProvider.server';
import { createFeedbackSubmission } from './feedbackSubmission.server';

function savedFeedback(overrides: Partial<FeedbackExportRow> = {}): FeedbackExportRow {
	return {
		id: 'feedback-1',
		user_id: 'member-a',
		user_email: 'member@example.test',
		organization_id: 'org-a',
		organization_name: 'Alpha Company',
		category: 'bug',
		message: 'Calendar selection disappeared',
		page_url: '/org/alpha/calendar?day=2026-09-30',
		status: 'new',
		admin_notes: null,
		created_at: '2026-09-30T01:00:00.000Z',
		updated_at: '2026-09-30T02:00:00.000Z',
		github_issue_number: 42,
		github_issue_url: 'https://github.com/example/repository/issues/42',
		page_section: 'Calendar',
		...overrides
	};
}

/** Fake only the provider query protocol; owner mapping and pagination execute unchanged. */
function provider(rows: FeedbackExportRow[] = []) {
	const state = {
		rows,
		staffNotes: new Map(rows.filter((row) => row.admin_notes !== null).map((row) => [row.id, row.admin_notes])),
		inserted: [] as Record<string, unknown>[],
		error: null as { message: string } | null,
		failedPage: null as number | null
	};

	function query() {
		const filters: Array<(row: FeedbackExportRow) => boolean> = [];
		let columns = '*';
		let head = false;
		const ordering: Array<{ column: keyof FeedbackExportRow; ascending: boolean }> = [];
		let patch: Partial<FeedbackExportRow> | undefined;
		function matching() {
			const selected = state.rows.filter((row) => filters.every((filter) => filter(row)));
			return selected.toSorted((left, right) => {
				for (const { column, ascending } of ordering) {
					const compared = String(left[column]).localeCompare(String(right[column]));
					if (compared) return ascending ? compared : -compared;
				}
				return 0;
			});
		}
		function project(row: FeedbackExportRow) {
			return columns === '*'
				? { ...row }
				: Object.fromEntries(
						columns
							.split(',')
							.map((column) =>
								column.trim() === 'feedback_staff_notes(body)'
									? [
											'feedback_staff_notes',
											state.staffNotes.has(row.id) ? { body: state.staffNotes.get(row.id) } : null
										]
									: [column.trim(), row[column.trim() as keyof FeedbackExportRow]]
							)
					);
		}
		const builder = {
			select(selected = '*', options?: { head?: boolean }) {
				columns = selected;
				head = options?.head ?? false;
				return builder;
			},
			eq(column: keyof FeedbackExportRow, value: string) {
				filters.push((row) => row[column] === value);
				return builder;
			},
			order(column: keyof FeedbackExportRow, options: { ascending: boolean }) {
				ordering.push({ column, ascending: options.ascending });
				return builder;
			},
			update(value: Partial<FeedbackExportRow>) {
				patch = value;
				return builder;
			},
			async insert(value: Record<string, unknown>) {
				if (!state.error) state.inserted.push({ ...value });
				return { error: state.error };
			},
			async maybeSingle() {
				const row = matching()[0];
				if (row && patch && !state.error) Object.assign(row, patch);
				return { data: row ? project(row) : null, error: state.error };
			},
			async range(from: number, to: number) {
				return {
					data: matching()
						.slice(from, Math.min(to + 1, from + 1000))
						.map(project),
					error: state.failedPage === from ? { message: 'page unavailable' } : state.error
				};
			},
			then(resolve: (value: { data: unknown; error: unknown; count: number }) => unknown) {
				const selected = matching();
				return Promise.resolve({
					data: head ? null : selected.map(project),
					error: state.error,
					count: selected.length
				}).then(resolve);
			}
		};
		return builder;
	}

	const client = {
		from(table: string) {
			if (table === 'feedback_staff_notes')
				return {
					delete: () => ({
						eq: async (_column: string, id: string) => {
							state.staffNotes.delete(id);
							return { error: state.error };
						}
					}),
					upsert: async (input: { feedback_id: string; body: string }) => {
						state.staffNotes.set(input.feedback_id, input.body);
						return { error: state.error };
					}
				};
			if (table !== 'beta_feedback') throw new Error(`Unexpected table ${table}`);
			return query();
		}
	} as unknown as SupabaseClient;
	return { client, state };
}

describe('Feedback provider', () => {
	it('keeps privileged client access lazy and inserts the exact account and message payload', async () => {
		const { client, state } = provider();
		const getClient = vi.fn(() => client);
		const submission = createFeedbackSubmission({ store: createSupabaseFeedbackSubmissionStore(getClient) });

		await expect(submission.submit({ userId: 'member-a', message: '   ' })).resolves.toMatchObject({
			status: 'validation_error'
		});
		expect(getClient).not.toHaveBeenCalled();

		await createSupabaseFeedbackSubmissionStore(getClient).insertFeedbackSubmission({
			userId: 'member-a',
			userEmail: 'member@example.test',
			organizationId: 'org-a',
			organizationName: 'Alpha Company',
			category: 'bug',
			message: 'Calendar selection disappeared',
			pageUrl: '/org/alpha/calendar',
			pageSection: 'Calendar'
		});

		expect(state.inserted).toEqual([
			{
				user_id: 'member-a',
				user_email: 'member@example.test',
				organization_id: 'org-a',
				organization_name: 'Alpha Company',
				category: 'bug',
				message: 'Calendar selection disappeared',
				page_url: '/org/alpha/calendar',
				page_section: 'Calendar'
			}
		]);
	});

	it('maps the complete review projection newest first and reads beyond the provider page', async () => {
		const rows = Array.from({ length: 1001 }, (_, index) => savedFeedback({ id: `older-${index}` }));
		rows.push(
			savedFeedback({
				id: 'newest',
				created_at: '2026-09-30T03:00:00.000Z',
				status: 'reviewed',
				admin_notes: 'Investigating'
			})
		);
		const { client } = provider(rows);

		const result = await createSupabaseFeedbackReviewStore(client).listFeedback();

		expect(result).toHaveLength(1002);
		expect(result[0]).toEqual({
			id: 'newest',
			userEmail: 'member@example.test',
			category: 'bug',
			message: 'Calendar selection disappeared',
			createdAt: '2026-09-30T03:00:00.000Z',
			organizationName: 'Alpha Company',
			pageUrl: '/org/alpha/calendar?day=2026-09-30',
			status: 'reviewed',
			adminNotes: 'Investigating'
		});
		expect(result.map((row) => row.id)).toContain('older-1000');
	});

	it('updates only the selected feedback, retains omitted fields and permits clearing notes', async () => {
		const { client, state } = provider([
			savedFeedback({ id: 'selected', status: 'reviewed', admin_notes: 'Investigating' }),
			savedFeedback({ id: 'peer', status: 'new', admin_notes: 'Leave intact' })
		]);
		const store = createSupabaseFeedbackReviewStore(client);

		await expect(store.updateFeedback({ id: 'selected', adminNotes: null })).resolves.toEqual({ id: 'selected' });
		expect(state.rows[0]).toMatchObject({
			status: 'reviewed',
			message: 'Calendar selection disappeared'
		});
		expect(state.staffNotes.has('selected')).toBe(false);
		expect(state.staffNotes.get('peer')).toBe('Leave intact');
		expect(state.rows[1]).toMatchObject({ status: 'new' });
		await expect(store.updateFeedback({ id: 'missing', status: 'resolved' })).resolves.toBeNull();
	});

	it('counts only pending feedback for the existing Platform dashboard', async () => {
		const { client } = provider([
			savedFeedback({ id: 'new-a' }),
			savedFeedback({ id: 'new-b', organization_id: 'org-b' }),
			savedFeedback({ id: 'reviewed', status: 'reviewed' }),
			savedFeedback({ id: 'resolved', status: 'resolved' })
		]);

		await expect(countPendingFeedback(client)).resolves.toBe(2);
	});

	it('exports every saved field and every request-visible page only for the requested Organization', async () => {
		const witness = savedFeedback({ id: 'last-page' });
		const { client } = provider([
			...Array.from({ length: 1000 }, (_, index) => savedFeedback({ id: `earlier-${index}` })),
			witness,
			savedFeedback({ id: 'foreign', organization_id: 'org-b' }),
			savedFeedback({ id: 'unattached', organization_id: null })
		]);

		const rows = await listFeedbackExportRows(client, 'org-a');

		expect(rows).toHaveLength(1001);
		expect(rows.find((row) => row.id === 'last-page')).toEqual({
			id: 'last-page',
			user_id: 'member-a',
			user_email: 'member@example.test',
			organization_id: 'org-a',
			organization_name: 'Alpha Company',
			category: 'bug',
			message: 'Calendar selection disappeared',
			page_url: '/org/alpha/calendar?day=2026-09-30',
			status: 'new',
			admin_notes: null,
			created_at: '2026-09-30T01:00:00.000Z',
			updated_at: '2026-09-30T02:00:00.000Z',
			github_issue_number: 42,
			github_issue_url: 'https://github.com/example/repository/issues/42',
			page_section: 'Calendar'
		});
	});

	it('rejects a later-page export failure rather than publishing a partial export', async () => {
		const { client, state } = provider(
			Array.from({ length: 1001 }, (_, index) => savedFeedback({ id: `item-${index}` }))
		);
		state.failedPage = 1000;

		await expect(listFeedbackExportRows(client, 'org-a')).rejects.toThrow('Failed to export feedback');
	});

	it('surfaces provider failures without accepting accompanying rows/counts or mutating records', async () => {
		const { client, state } = provider([savedFeedback()]);
		state.error = { message: 'provider unavailable' };
		const store = createSupabaseFeedbackReviewStore(client);

		await expect(store.listFeedback()).rejects.toThrow('Failed to list feedback');
		await expect(store.updateFeedback({ id: 'feedback-1', status: 'resolved' })).rejects.toThrow(
			'Failed to update feedback'
		);
		await expect(countPendingFeedback(client)).rejects.toThrow('Failed to count pending feedback');
		await expect(listFeedbackExportRows(client, 'org-a')).rejects.toThrow('Failed to export feedback');
		await expect(
			createSupabaseFeedbackSubmissionStore(() => client).insertFeedbackSubmission({
				userId: 'member-a',
				userEmail: null,
				organizationId: null,
				organizationName: null,
				category: 'general',
				message: 'Keep the failed attempt visible',
				pageUrl: null,
				pageSection: null
			})
		).rejects.toThrow('Failed to insert feedback');
		expect(state.rows[0].status).toBe('new');
		expect(state.inserted).toEqual([]);
	});
});
