import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformFeedback,
	type PlatformFeedback,
	type PlatformFeedbackItem,
	type PlatformFeedbackStatus,
	type PlatformFeedbackStore,
	type PlatformFeedbackStoreUpdateResult,
	type PlatformFeedbackUpdateInput
} from '$lib/server/core/useCases/platformFeedback';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';

interface FeedbackRow {
	id: string;
	user_email: string;
	category: string;
	message: string;
	created_at: string;
	organization_name: string | null;
	page_url: string | null;
	status: PlatformFeedbackStatus;
	admin_notes: string | null;
}

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

type SupabaseQueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;

function formatSupabaseError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; code?: unknown };
		const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
		return typeof candidate.code === 'string' ? `${message} (${candidate.code})` : message;
	}
	return String(error);
}

function assertSupabaseSuccess<T>(operation: string, response: SupabaseResponse<T>): void {
	if (response.error) {
		throw new Error(`${operation} failed: ${formatSupabaseError(response.error)}`);
	}
}

function mapFeedback(row: FeedbackRow): PlatformFeedbackItem {
	return {
		id: row.id,
		userEmail: row.user_email,
		category: row.category,
		message: row.message,
		createdAt: row.created_at,
		organizationName: row.organization_name,
		pageUrl: row.page_url,
		status: row.status,
		adminNotes: row.admin_notes
	};
}

export function createSupabasePlatformFeedbackStore(supabase: SupabaseClient): PlatformFeedbackStore {
	return {
		async listFeedback() {
			const { data, error } = await selectAllSupabaseRows<FeedbackRow>(
				(from, to) =>
					supabase
						.from('beta_feedback')
						.select('*')
						.order('created_at', { ascending: false })
						.range(from, to) as unknown as SupabaseQueryResult<FeedbackRow>
			);
			if (error) throw new Error(`table beta_feedback list failed: ${formatSupabaseError(error)}`);
			return (data ?? []).map(mapFeedback);
		},

		async updateFeedback(input: PlatformFeedbackUpdateInput): Promise<PlatformFeedbackStoreUpdateResult | null> {
			const updateData: { status?: PlatformFeedbackStatus; admin_notes?: string | null } = {};
			if (input.status !== undefined) updateData.status = input.status;
			if (input.adminNotes !== undefined) updateData.admin_notes = input.adminNotes;

			const response = (await supabase
				.from('beta_feedback')
				.update(updateData)
				.eq('id', input.id)
				.select('id')
				.maybeSingle()) as SupabaseResponse<{ id: string }>;
			assertSupabaseSuccess('table beta_feedback update', response);
			if (!response.data) return null;
			return { id: response.data.id };
		}
	};
}

export function createSupabasePlatformFeedback(ctx: AdminContext): PlatformFeedback {
	return createPlatformFeedback({
		store: createSupabasePlatformFeedbackStore(ctx.adminClient)
	});
}
