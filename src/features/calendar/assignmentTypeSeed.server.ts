import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_ASSIGNMENT_TYPES = [
	{
		name: 'Staff Duty',
		short_name: 'SD',
		assign_to: 'personnel',
		color: '#dc2626',
		sort_order: 0
	}
];

/** Seed the retained manual assignment type after Organization owner creation. */
export async function seedDefaultAssignmentTypes(
	supabase: SupabaseClient,
	organizationId: string
): Promise<string | null> {
	const { error } = await supabase
		.from('assignment_types')
		.insert(DEFAULT_ASSIGNMENT_TYPES.map((assignmentType) => ({ organization_id: organizationId, ...assignmentType })));
	return error?.message ?? null;
}
