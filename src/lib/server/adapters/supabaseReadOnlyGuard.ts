import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReadOnlyGuard } from '../core/ports';
import { isOrgReadOnly } from '$lib/server/subscription';

export function createSupabaseReadOnlyGuard(supabase: SupabaseClient, orgId: string): ReadOnlyGuard {
	return {
		async check(): Promise<boolean> {
			return isOrgReadOnly(supabase, orgId);
		}
	};
}
