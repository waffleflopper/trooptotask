import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { createSupabasePlatformMetrics } from './supabasePlatformMetrics';
import {
	createPlatformOrganizationLedger,
	type PlatformOrganizationLedger,
	type PlatformOrganizationLedgerBaseRow,
	type PlatformOrganizationLedgerPage,
	type PlatformOrganizationLedgerQuery,
	type PlatformOrganizationLedgerStore
} from '$lib/server/core/useCases/platformOrganizationLedger';

const ORGANIZATION_SELECT = 'id, name, suspended_at, created_at';

type SupabasePageResponse<T> = {
	data: T[] | null;
	count: number | null;
	error: unknown;
};

function throwIfSupabaseError(error: unknown): void {
	if (!error) return;
	throw error;
}

function mapOrganizationLedgerBaseRow(row: PlatformOrganizationLedgerBaseRow): PlatformOrganizationLedgerBaseRow {
	return {
		id: row.id,
		name: row.name,
		suspended_at: row.suspended_at,
		created_at: row.created_at
	};
}

export function createSupabasePlatformOrganizationLedgerStore(
	supabase: SupabaseClient
): PlatformOrganizationLedgerStore {
	return {
		async listOrganizationsPage(query: PlatformOrganizationLedgerQuery): Promise<PlatformOrganizationLedgerPage> {
			let builder = supabase
				.from('organizations')
				.select(ORGANIZATION_SELECT, { count: 'exact' })
				.order('created_at', { ascending: false });

			if (query.q) {
				builder = builder.ilike('name', `%${query.q}%`);
			}

			if (query.status === 'active') {
				builder = builder.is('suspended_at', null);
			} else if (query.status === 'suspended') {
				builder = builder.not('suspended_at', 'is', null);
			}

			const response = (await builder.range(
				query.from,
				query.to
			)) as SupabasePageResponse<PlatformOrganizationLedgerBaseRow>;
			throwIfSupabaseError(response.error);

			return {
				organizations: (response.data ?? []).map(mapOrganizationLedgerBaseRow),
				totalCount: response.count ?? 0
			};
		}
	};
}

export function createSupabasePlatformOrganizationLedger(ctx: AdminContext): PlatformOrganizationLedger {
	return createPlatformOrganizationLedger({
		store: createSupabasePlatformOrganizationLedgerStore(ctx.adminClient),
		metrics: createSupabasePlatformMetrics(ctx)
	});
}
