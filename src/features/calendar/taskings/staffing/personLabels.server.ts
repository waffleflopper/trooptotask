import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { NamedPeople } from './staffingModel';

const labelRowSchema = z.object({ personnel_id: z.string(), label: z.string() });

/** "RANK First Last" for the People the reader's roster scope covers; anyone else is absent. */
export async function readPersonLabels(
	client: SupabaseClient,
	orgId: string,
	ids: string[]
): Promise<Map<string, string>> {
	if (ids.length === 0) return new Map();
	const { data, error } = await client.rpc('calendar_person_labels', {
		p_organization_id: orgId,
		p_personnel_ids: [...new Set(ids)]
	});
	if (error) throw new Error(error.message);
	return new Map(z.array(labelRowSchema).parse(data).map((row) => [row.personnel_id, row.label]));
}

export function namedPeople(ids: string[], labels: Map<string, string>): NamedPeople {
	const names = ids.flatMap((id) => labels.get(id) ?? []);
	return { names: names.sort((a, b) => a.localeCompare(b)), others: ids.length - names.length };
}
