import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { NamedPeople } from './staffingModel';

const labelRowSchema = z.object({ personnel_id: z.string(), label: z.string() });

/** "RANK Last, First" for the People the reader's roster scope covers; anyone else is absent. */
export async function readPersonLabels(
	client: SupabaseClient,
	orgId: string,
	ids: string[]
): Promise<Map<string, string>> {
	if (ids.length === 0) return new Map();
	const { data, error } = await selectAllSupabaseRows<unknown>(
		async (from, to) =>
			await client
				.rpc('calendar_person_labels', { p_organization_id: orgId, p_personnel_ids: [...new Set(ids)] })
				.range(from, to)
	);
	if (error) throw new Error((error as { message: string }).message);
	return new Map(
		z
			.array(labelRowSchema)
			.parse(data)
			.map((row) => [row.personnel_id, row.label])
	);
}

export function namedPeople(ids: string[], labels: Map<string, string>): NamedPeople {
	const names = ids.flatMap((id) => labels.get(id) ?? []);
	return { names: names.sort((a, b) => a.localeCompare(b)), others: ids.length - names.length };
}
