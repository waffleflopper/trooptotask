import type { Band, GroupTree } from '$features/personnel/contracts';
import type { GroupLabels } from '../../taskingModel';
import { groupLabel } from './staffingLabels';

export interface PickerSection<T> {
	key: string;
	label: string;
	rows: T[];
}

/**
 * The responsible Group's own people first, then each sub-group depth-first, keeping the rows' order inside each.
 * Rows outside the subtree, such as a pick that moved away, close the list under their own Group.
 */
export function pickerSections<T extends { groupId: string | null }>(
	tree: GroupTree,
	responsibleId: string,
	rows: readonly T[],
	labels: GroupLabels
): PickerSection<T>[] {
	const sections: PickerSection<T>[] = [];
	const visit = (band: Band<T>) => {
		const label = tree.label(band.node.id);
		if (band.hq.length > 0)
			sections.push({ key: band.node.id, label: band.children.length > 0 ? `${label} HQ` : label, rows: [...band.hq] });
		band.children.forEach(visit);
	};
	tree.bands(rows, (row) => row.groupId, responsibleId).forEach(visit);

	const outside = new Map<string, PickerSection<T>>();
	for (const row of rows) {
		if (row.groupId !== null && tree.contains(responsibleId, row.groupId)) continue;
		const key = `outside:${row.groupId ?? 'none'}`;
		const section = outside.get(key) ?? { key, label: groupLabel(row.groupId, labels), rows: [] };
		section.rows.push(row);
		outside.set(key, section);
	}
	return [...sections, ...outside.values()];
}
