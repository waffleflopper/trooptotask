import type { SupabaseClient } from '@supabase/supabase-js';
import { isOrgReadOnly } from '$lib/server/subscription';
import { json } from '@sveltejs/kit';

/**
 * Check if org is read-only. Returns a Response to send if blocked, or null if allowed.
 * Use in API routes: const blocked = await checkReadOnly(supabase, orgId); if (blocked) return blocked;
 */
export async function checkReadOnly(supabase: SupabaseClient, orgId: string): Promise<Response | null> {
	const readOnly = await isOrgReadOnly(supabase, orgId);
	if (readOnly) {
		return json(
			{ error: 'Organization is in read-only mode. Subscribe or remove personnel to continue.' },
			{ status: 403 }
		);
	}
	return null;
}
