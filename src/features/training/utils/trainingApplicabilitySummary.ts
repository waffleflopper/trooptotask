import type { TrainingRequirementFacts } from '../training.types';

type ApplicabilityFacts = Pick<
	TrainingRequirementFacts,
	| 'isOptional'
	| 'appliesToRoles'
	| 'appliesToMos'
	| 'appliesToRanks'
	| 'excludedRoles'
	| 'excludedMos'
	| 'excludedRanks'
>;

function parts(roles: string[], mos: string[], ranks: string[], separator: string): string[] {
	return [
		['Role', roles],
		['MOS', mos],
		['Rank', ranks]
	].flatMap(([label, values]) => (values.length > 0 ? [`${label}${separator}${(values as string[]).join(', ')}`] : []));
}

/** Who a Training type applies to, in a few words: "Everyone", "Optional", "Role: Driver", "Everyone except MOS 68W". */
export function summarizeTrainingApplicability(type: ApplicabilityFacts): string {
	if (type.isOptional) return 'Optional';
	const only = parts(type.appliesToRoles, type.appliesToMos, type.appliesToRanks, ': ');
	const except = parts(type.excludedRoles, type.excludedMos, type.excludedRanks, ' ');
	const exceptText = except.length > 0 ? `except ${except.join(' · ')}` : '';
	if (only.length === 0) return exceptText ? `Everyone ${exceptText}` : 'Everyone';
	return [only.join(' · '), exceptText].filter(Boolean).join(' · ');
}
