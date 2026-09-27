import type { SupabaseClient } from '@supabase/supabase-js';

export interface StatusTypeSeed {
	name: string;
	color: string;
	textColor: string;
	sortOrder: number;
}

const DEFAULT_STATUS_TYPES: StatusTypeSeed[] = [
	{ name: 'Leave', color: '#48bb78', textColor: '#ffffff', sortOrder: 0 },
	{ name: 'School', color: '#4299e1', textColor: '#ffffff', sortOrder: 1 },
	{ name: 'Training / TDY', color: '#9f7aea', textColor: '#ffffff', sortOrder: 2 },
	{ name: 'Appointment', color: '#ed8936', textColor: '#ffffff', sortOrder: 3 },
	{ name: 'Sick', color: '#e53e3e', textColor: '#ffffff', sortOrder: 4 },
	{ name: 'Other Duty / Detail', color: '#a0522d', textColor: '#ffffff', sortOrder: 5 },
	{ name: 'CQ/SD', color: '#dc2626', textColor: '#ffffff', sortOrder: 6 }
];

/** Seed retained Calendar defaults after Organization owner creation. */
export async function seedDefaultStatusTypes(
	supabase: SupabaseClient,
	organizationId: string,
	statusTypes: StatusTypeSeed[] = DEFAULT_STATUS_TYPES
): Promise<string | null> {
	const { error } = await supabase.from('status_types').insert(
		statusTypes.map((statusType) => ({
			organization_id: organizationId,
			name: statusType.name,
			color: statusType.color,
			text_color: statusType.textColor,
			sort_order: statusType.sortOrder
		}))
	);
	return error?.message ?? null;
}
