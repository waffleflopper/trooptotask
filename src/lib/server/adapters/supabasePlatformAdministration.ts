import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import { countPendingFeedback } from '$features/feedback/index.server';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformAdministration,
	type PlatformAdministration,
	type PlatformAdministrationStore,
	type PlatformAdministrationUserStats
} from '$lib/server/core/useCases/platformAdministration';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
	count?: number | null;
	status?: number;
	statusText?: string;
};

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

export function createSupabasePlatformAdministrationStore(supabase: SupabaseClient): PlatformAdministrationStore {
	return {
		async countPlatformUsers(): Promise<PlatformAdministrationUserStats | null> {
			const response = await supabase.rpc('count_platform_users');
			assertSupabaseSuccess('rpc count_platform_users', response);
			return (response.data as PlatformAdministrationUserStats | null) ?? null;
		},

		async listDailySignupsLast30Days() {
			const response = await supabase.rpc('daily_signups_last_30_days');
			assertSupabaseSuccess('rpc daily_signups_last_30_days', response);
			return (response.data as Array<{ date: string; count: number }> | null) ?? null;
		},

		async countOrganizations() {
			const response = await supabase.from('organizations').select('*', { count: 'exact', head: true });
			assertSupabaseSuccess('table organizations count', response);
			return response.count ?? null;
		},

		async countPendingAccessRequests() {
			const response = await supabase
				.from('access_requests')
				.select('*', { count: 'exact', head: true })
				.eq('status', 'pending');
			assertSupabaseSuccess('table access_requests pending count', response);
			return response.count ?? null;
		},

		countPendingFeedback() {
			return countPendingFeedback(supabase);
		}
	};
}

export function createSupabasePlatformAdministration(ctx: AdminContext): PlatformAdministration {
	return createPlatformAdministration({
		auditActivity: createSupabasePlatformAudit(ctx.adminClient),
		store: createSupabasePlatformAdministrationStore(ctx.adminClient)
	});
}
