import type { ApplicabilityChip, ApplicabilityDraft } from './trainingTypeDraft';

const KIND_LABEL: Record<ApplicabilityChip['kind'], string> = { role: 'Role', mos: 'MOS', rank: 'Rank' };
const KIND_ORDER: ApplicabilityChip['kind'][] = ['role', 'mos', 'rank'];

function describeChips(chips: ApplicabilityChip[], separator: string): string {
	return KIND_ORDER.flatMap((kind) => {
		const values = chips.filter((chip) => chip.kind === kind).map((chip) => chip.value);
		return values.length > 0 ? [`${KIND_LABEL[kind]}${separator}${values.join(', ')}`] : [];
	}).join('; ');
}

/** One line for who a Training type applies to, such as "Role: Driver" or "Everyone except MOS 68W". */
export function summarizeApplicability(applicability: ApplicabilityDraft): string {
	if (applicability.mode === 'optional') return 'Optional';
	const only = applicability.mode === 'onlySome' ? describeChips(applicability.only, ': ') : '';
	const except = describeChips(applicability.except, ' ');
	const audience = only || 'Everyone';
	return except ? `${audience} except ${except}` : audience;
}
