/**
 * ReadOnlyGuard implementation backed by Supabase.
 * Use cases call `ctx.readOnlyGuard.check()` before any mutation gated by Read-Only Mode.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReadOnlyGuard } from '../core/ports';
import { readReadOnlyModeState } from '$lib/server/core/useCases/readOnlyMode';
import { createSupabaseDataStore } from './supabaseDataStore';

export function createSupabaseReadOnlyGuard(supabase: SupabaseClient, orgId: string): ReadOnlyGuard {
	const store = createSupabaseDataStore(supabase);
	const readState = () => readReadOnlyModeState({ auth: { orgId }, store });

	return {
		async check(): Promise<boolean> {
			return (await readState()).isReadOnly;
		},
		async checkState() {
			return readState();
		}
	};
}
