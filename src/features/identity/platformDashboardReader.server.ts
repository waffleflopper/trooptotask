import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdentityPlatformDashboardReader } from './platformDashboardTypes';

function count(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		throw new Error('Platform account count was unavailable');
	return value;
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Platform account facts were unavailable');
	return value as Record<string, unknown>;
}

export function createIdentityPlatformDashboardReader(client: SupabaseClient): IdentityPlatformDashboardReader {
	return {
		async countPlatformUsers() {
			const { data, error } = await client.rpc('count_platform_users');
			if (error) throw new Error('Unable to count platform accounts', { cause: error });
			const stats = record(data);
			return { total: count(stats.total), last30Days: count(stats.last_30_days) };
		},
		async listDailySignupsLast30Days() {
			const { data, error } = await client.rpc('daily_signups_last_30_days');
			if (error) throw new Error('Unable to load platform signups', { cause: error });
			if (data === null) return [];
			if (!Array.isArray(data)) throw new Error('Platform signup facts were unavailable');
			return data.map((value) => {
				const row = record(value);
				if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
					throw new Error('Platform signup date was unavailable');
				const date = new Date(row.date);
				if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date)
					throw new Error('Platform signup date was unavailable');
				return { date: row.date, count: count(row.count) };
			});
		},
		async countPendingAccessRequests() {
			const { count: pending, error } = await client
				.from('access_requests')
				.select('id', { count: 'exact', head: true })
				.eq('status', 'pending');
			if (error) throw new Error('Unable to count pending Access Requests', { cause: error });
			return count(pending);
		}
	};
}
