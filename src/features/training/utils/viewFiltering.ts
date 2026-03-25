import type { TrainingType, TrainingView } from '../training.types';

/**
 * Filters and orders training types based on a view's column configuration.
 * - null view ("All Trainings"): returns all types sorted by global sortOrder
 * - saved view: returns only matching types in the view's columnIds order
 */
export function filterColumnsByView(allTypes: TrainingType[], view: TrainingView | null): TrainingType[] {
	if (!view) {
		return [...allTypes].sort((a, b) => a.sortOrder - b.sortOrder);
	}

	const typeMap = new Map(allTypes.map((t) => [t.id, t]));

	const result: TrainingType[] = [];
	for (const id of view.columnIds) {
		const type = typeMap.get(id);
		if (type) {
			result.push(type);
		}
	}

	return result;
}
