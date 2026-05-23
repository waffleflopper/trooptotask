/**
 * ReadOnlyGuard implementation backed by Supabase.
 * Returns `true` when the org's subscription has lapsed and all writes should be blocked.
 * Use cases call `ctx.readOnlyGuard.check()` before any mutation that should be gated
 * by subscription status.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReadOnlyGuard } from '../core/ports';
import { getOrgReadOnlyState, isOrgReadOnly } from '$lib/server/subscription';

export function createSupabaseReadOnlyGuard(supabase: SupabaseClient, orgId: string): ReadOnlyGuard {
	return {
		async check(): Promise<boolean> {
			return isOrgReadOnly(supabase, orgId);
		},
		async checkState() {
			return getOrgReadOnlyState(supabase, orgId);
		}
	};
}
