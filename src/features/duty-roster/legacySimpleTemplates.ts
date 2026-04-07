import type { AssignmentType } from '$lib/types';

export interface LegacySimpleTemplate {
	id: string;
	templateKind: 'legacy-simple';
	legacyRecordMode: 'assignment-type';
	assignmentTypeId: string;
	name: string;
	shortName: string;
	description: string;
	exemptPersonnelCount: number;
}

export function getLegacySimpleTemplates(assignmentTypes: AssignmentType[]): LegacySimpleTemplate[] {
	return assignmentTypes
		.filter((assignmentType) => assignmentType.assignTo === 'personnel')
		.map((assignmentType) => ({
			id: `legacy-simple-${assignmentType.id}`,
			templateKind: 'legacy-simple' as const,
			legacyRecordMode: 'assignment-type' as const,
			assignmentTypeId: assignmentType.id,
			name: assignmentType.name,
			shortName: assignmentType.shortName,
			description: 'Uses the existing one-person duty roster rules and current calendar records.',
			exemptPersonnelCount: assignmentType.exemptPersonnelIds.length
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
