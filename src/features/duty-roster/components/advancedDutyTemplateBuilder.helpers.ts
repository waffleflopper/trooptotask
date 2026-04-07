import {
	cloneDefaultSoftPreferences,
	type DutyTemplate,
	type DutyTemplateRotationBaselineInput,
	type DutyTemplateSlotBlockingMode,
	type DutyTemplateSlotInput,
	type DutyTemplateWriteInput,
	type SoftPreferenceConfig,
	type SoftPreferenceType
} from '../duty-roster.types';

export interface GroupOption {
	id: string;
	name: string;
}

export interface PersonnelOption {
	id: string;
	rank?: string;
	lastName?: string;
	firstName?: string;
	groupId?: string | null;
	mos: string;
	clinicRole: string;
}

export interface EditableSlot {
	key: string;
	roleLabel: string;
	quantity: number;
	allowedRanks: string[];
	allowedGroupIds: string[];
	preferredGroupIds: string[];
	allowedMosValues: string[];
	allowedRoleValues: string[];
	rotationPoolKey: string;
	blockingMode: DutyTemplateSlotBlockingMode;
}

export interface EditableBaseline {
	key: string;
	rotationPoolKey: string;
	personId: string;
	lastServedDate: string;
}

export interface BuilderFormState {
	templateName: string;
	templateDescription: string;
	templateStatus: 'draft' | 'active' | 'archived';
	scopeType: 'organization' | 'groups';
	scopeGroupIds: string[];
	exemptPersonnelIds: string[];
	exemptStatusTypeIds: string[];
	coverageMode: 'all-day' | 'timed';
	startTime: string;
	endTime: string;
	spansMidnight: boolean;
	isBlocking: boolean;
	cooldownHours: number;
	draftSoftPreferences: SoftPreferenceConfig[];
	draftSlots: EditableSlot[];
	draftRotationBaselines: EditableBaseline[];
}

export type SetupMode = 'quick' | 'full';
export type BuilderStep = 'basics' | 'policy' | 'series' | 'review';

export interface SoftPreferenceOption {
	type: SoftPreferenceType;
	label: string;
	description: string;
}

export interface TemplateStarterPreset {
	id: string;
	label: string;
	description: string;
	name: string;
	templateDescription: string;
	scopeType: 'organization' | 'groups';
	scopeGroupIds: string[];
	coverageMode: 'all-day' | 'timed';
	startTime: string;
	endTime: string;
	isBlocking: boolean;
	cooldownHours: number;
	slots: Array<{
		roleLabel: string;
		quantity: number;
		allowedRanks: string[];
		allowedGroupIds: string[];
		preferredGroupIds: string[];
		allowedMosValues: string[];
		allowedRoleValues: string[];
		rotationPoolKey: string;
		blockingMode: DutyTemplateSlotBlockingMode;
	}>;
}

export const softPreferenceOptions: SoftPreferenceOption[] = [
	{
		type: 'longest-break',
		label: 'Longest break',
		description: 'Prefer whoever has gone the longest since this rotation group last served.'
	},
	{
		type: 'holiday-closure',
		label: 'Holiday / closure spacing',
		description: 'On holidays or closures, avoid sending the same person back too soon.'
	},
	{
		type: 'weekend',
		label: 'Weekend spacing',
		description: 'On weekends, avoid handing recent weekend duty back to the same person.'
	},
	{
		type: 'preferred-group',
		label: 'Preferred groups',
		description: 'Use preferred groups as a soft tie-break instead of a hard eligibility rule.'
	}
];

export const BUILDER_STEPS: Array<{ id: BuilderStep; label: string }> = [
	{ id: 'basics', label: 'Template Basics' },
	{ id: 'policy', label: 'Duty Rules' },
	{ id: 'series', label: 'Series Setup' },
	{ id: 'review', label: 'Review & Save' }
];

export function createTemplateStarterPresets(groups: GroupOption[]): TemplateStarterPreset[] {
	const primaryGroupId = groups[0]?.id ?? '';

	return [
		{
			id: 'battalion-staff-duty',
			label: 'Battalion Staff Duty',
			description: 'Two-person overnight coverage with a shared rotation group for the core team.',
			name: 'Battalion Staff Duty',
			templateDescription: 'Overnight battalion staff duty with one NCO and one runner rotating together.',
			scopeType: 'organization',
			scopeGroupIds: [],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT', 'SSG', 'SFC'],
					allowedGroupIds: [],
					preferredGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: [],
					rotationPoolKey: 'staff-duty-core',
					blockingMode: 'inherit'
				},
				{
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['PFC', 'SPC', 'CPL'],
					allowedGroupIds: [],
					preferredGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: [],
					rotationPoolKey: 'staff-duty-core',
					blockingMode: 'inherit'
				}
			]
		},
		{
			id: 'company-cq',
			label: 'Company CQ',
			description: 'A common CQ starting point with one desk NCO and one runner.',
			name: 'Company CQ',
			templateDescription: 'Company charge of quarters with overnight desk coverage and one runner.',
			scopeType: 'groups',
			scopeGroupIds: primaryGroupId ? [primaryGroupId] : [],
			coverageMode: 'timed',
			startTime: '17:00',
			endTime: '09:00',
			isBlocking: true,
			cooldownHours: 12,
			slots: [
				{
					roleLabel: 'CQ NCO',
					quantity: 1,
					allowedRanks: ['SGT', 'SSG'],
					allowedGroupIds: primaryGroupId ? [primaryGroupId] : [],
					preferredGroupIds: primaryGroupId ? [primaryGroupId] : [],
					allowedMosValues: [],
					allowedRoleValues: [],
					rotationPoolKey: 'cq-core',
					blockingMode: 'inherit'
				},
				{
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['PFC', 'SPC', 'CPL'],
					allowedGroupIds: primaryGroupId ? [primaryGroupId] : [],
					preferredGroupIds: primaryGroupId ? [primaryGroupId] : [],
					allowedMosValues: [],
					allowedRoleValues: [],
					rotationPoolKey: 'cq-core',
					blockingMode: 'inherit'
				}
			]
		}
	];
}

export function formatPersonLabel(person: PersonnelOption): string {
	if (person.rank && person.lastName) {
		return `${person.rank} ${person.lastName}`;
	}
	if (person.lastName && person.firstName) {
		return `${person.lastName}, ${person.firstName}`;
	}
	return person.id;
}

export function enabledSoftPreferenceSummary(
	draftSoftPreferences: SoftPreferenceConfig[],
	options: SoftPreferenceOption[]
): string {
	const labels = draftSoftPreferences
		.filter((preference) => preference.enabled)
		.map((preference) => options.find((option) => option.type === preference.type)?.label ?? preference.type);
	return labels.length > 0 ? labels.join(' -> ') : 'Eligibility rules and name tie-breakers only';
}

export function slotSummaryLine(slot: EditableSlot, groups: GroupOption[]): string {
	const parts: string[] = [`${slot.quantity}×`];
	if (slot.roleLabel) parts.push(slot.roleLabel);
	if (slot.allowedRanks.length) {
		parts.push(`Ranks: ${slot.allowedRanks.slice(0, 3).join(', ')}${slot.allowedRanks.length > 3 ? '…' : ''}`);
	}
	if (slot.allowedGroupIds.length) {
		const names = slot.allowedGroupIds.slice(0, 2).map((id) => groups.find((g) => g.id === id)?.name ?? id);
		parts.push(`Groups: ${names.join(', ')}${slot.allowedGroupIds.length > 2 ? '…' : ''}`);
	}
	if (slot.rotationPoolKey) parts.push(`Pool: ${slot.rotationPoolKey}`);
	if (slot.blockingMode !== 'inherit') {
		parts.push(slot.blockingMode === 'blocking' ? 'Force blocking' : 'Force non-blocking');
	}
	return parts.join(' · ');
}

export function createBlankSlot(nextKey: () => string): EditableSlot {
	return {
		key: nextKey(),
		roleLabel: '',
		quantity: 1,
		allowedRanks: [],
		allowedGroupIds: [],
		preferredGroupIds: [],
		allowedMosValues: [],
		allowedRoleValues: [],
		rotationPoolKey: '',
		blockingMode: 'inherit'
	};
}

export function createBlankBaseline(nextKey: () => string, defaultRotationPoolKey: string): EditableBaseline {
	return {
		key: nextKey(),
		rotationPoolKey: defaultRotationPoolKey,
		personId: '',
		lastServedDate: ''
	};
}

export function createBlankBuilderState(): BuilderFormState {
	return {
		templateName: '',
		templateDescription: '',
		templateStatus: 'active',
		scopeType: 'organization',
		scopeGroupIds: [],
		exemptPersonnelIds: [],
		exemptStatusTypeIds: [],
		coverageMode: 'all-day',
		startTime: '',
		endTime: '',
		spansMidnight: false,
		isBlocking: false,
		cooldownHours: 0,
		draftSoftPreferences: cloneDefaultSoftPreferences(),
		draftSlots: [],
		draftRotationBaselines: []
	};
}

export function createBuilderStateFromTemplate(template: DutyTemplate, nextKey: () => string): BuilderFormState {
	return {
		templateName: template.name,
		templateDescription: template.description ?? '',
		templateStatus: template.status,
		scopeType: template.scopeType,
		scopeGroupIds: Array.isArray(template.scopeGroupIds) ? [...template.scopeGroupIds] : [],
		exemptPersonnelIds: Array.isArray(template.exemptPersonnelIds) ? [...template.exemptPersonnelIds] : [],
		exemptStatusTypeIds: Array.isArray(template.exemptStatusTypeIds) ? [...template.exemptStatusTypeIds] : [],
		coverageMode: template.coverageMode,
		startTime: template.startTime ?? '',
		endTime: template.endTime ?? '',
		spansMidnight: template.spansMidnight ?? false,
		isBlocking: template.isBlocking,
		cooldownHours: template.cooldownHours,
		draftSoftPreferences:
			Array.isArray(template.softPreferences) && template.softPreferences.length > 0
				? template.softPreferences.map((preference) => ({ type: preference.type, enabled: preference.enabled }))
				: cloneDefaultSoftPreferences(),
		draftSlots: (Array.isArray(template.slots) ? template.slots : []).map((slot) => ({
			key: nextKey(),
			roleLabel: slot.roleLabel,
			quantity: slot.quantity,
			allowedRanks: [...slot.allowedRanks],
			allowedGroupIds: [...slot.allowedGroupIds],
			preferredGroupIds: [...slot.preferredGroupIds],
			allowedMosValues: [...slot.allowedMosValues],
			allowedRoleValues: [...slot.allowedRoleValues],
			rotationPoolKey: slot.rotationPoolKey,
			blockingMode: slot.blockingMode ?? 'inherit'
		})),
		draftRotationBaselines: (Array.isArray(template.rotationBaselines) ? template.rotationBaselines : []).map(
			(baseline) => ({
				key: nextKey(),
				rotationPoolKey: baseline.rotationPoolKey,
				personId: baseline.personId,
				lastServedDate: baseline.lastServedDate
			})
		)
	};
}

export function createBuilderStateFromPreset(preset: TemplateStarterPreset, nextKey: () => string): BuilderFormState {
	return {
		templateName: preset.name,
		templateDescription: preset.templateDescription,
		templateStatus: 'draft',
		scopeType: preset.scopeType,
		scopeGroupIds: [...preset.scopeGroupIds],
		exemptPersonnelIds: [],
		exemptStatusTypeIds: [],
		coverageMode: preset.coverageMode,
		startTime: preset.startTime,
		endTime: preset.endTime,
		spansMidnight: false,
		isBlocking: preset.isBlocking,
		cooldownHours: preset.cooldownHours,
		draftSoftPreferences: cloneDefaultSoftPreferences(),
		draftSlots: preset.slots.map((slot) => ({ key: nextKey(), ...slot })),
		draftRotationBaselines: []
	};
}

export function buildPayload(state: {
	templateStatus: 'draft' | 'active' | 'archived';
	templateName: string;
	templateDescription: string;
	scopeType: 'organization' | 'groups';
	scopeGroupIds: string[];
	exemptPersonnelIds: string[];
	exemptStatusTypeIds: string[];
	coverageMode: 'all-day' | 'timed';
	startTime: string;
	endTime: string;
	spansMidnight: boolean;
	isBlocking: boolean;
	cooldownHours: number;
	draftSoftPreferences: SoftPreferenceConfig[];
	draftSlots: EditableSlot[];
	draftRotationBaselines: EditableBaseline[];
}): DutyTemplateWriteInput {
	const slots: DutyTemplateSlotInput[] = state.draftSlots.map((slot, index) => ({
		roleLabel: slot.roleLabel.trim(),
		quantity: slot.quantity,
		allowedRanks: slot.allowedRanks,
		allowedGroupIds: slot.allowedGroupIds,
		preferredGroupIds: slot.preferredGroupIds,
		allowedMosValues: slot.allowedMosValues,
		allowedRoleValues: slot.allowedRoleValues,
		rotationPoolKey: slot.rotationPoolKey.trim() || `slot-${index + 1}`,
		blockingMode: slot.blockingMode,
		sortOrder: index
	}));
	const rotationBaselines: DutyTemplateRotationBaselineInput[] = state.draftRotationBaselines
		.map((baseline) => ({
			rotationPoolKey: baseline.rotationPoolKey.trim(),
			personId: baseline.personId,
			lastServedDate: baseline.lastServedDate
		}))
		.filter((baseline) => baseline.rotationPoolKey && baseline.personId && baseline.lastServedDate);

	return {
		mode: 'advanced',
		status: state.templateStatus,
		name: state.templateName.trim(),
		description: state.templateDescription.trim() || null,
		scopeType: state.scopeType,
		scopeGroupIds: state.scopeType === 'groups' ? state.scopeGroupIds : [],
		exemptPersonnelIds: state.exemptPersonnelIds,
		exemptStatusTypeIds: state.exemptStatusTypeIds,
		coverageMode: state.coverageMode,
		startTime: state.coverageMode === 'timed' ? state.startTime || null : null,
		endTime: state.coverageMode === 'timed' ? state.endTime || null : null,
		spansMidnight: state.coverageMode === 'timed' ? state.spansMidnight : false,
		isBlocking: state.isBlocking,
		cooldownHours: state.cooldownHours,
		softPreferences: state.draftSoftPreferences.map((preference) => ({
			type: preference.type,
			enabled: preference.enabled
		})),
		slots,
		rotationBaselines
	};
}
