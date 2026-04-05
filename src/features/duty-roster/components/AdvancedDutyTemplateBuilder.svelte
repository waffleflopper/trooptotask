<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import WizardStepper from './WizardStepper.svelte';
	import MultiTagSelect from './MultiTagSelect.svelte';
	import type { TagOption } from './MultiTagSelect.svelte';
	import { ALL_RANKS } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import {
		cloneDefaultSoftPreferences,
		type DutyTemplate,
		type DutyTemplateRotationBaselineInput,
		type DutyTemplateSlotInput,
		type DutyTemplateWriteInput,
		type SoftPreferenceConfig,
		type SoftPreferenceType
	} from '../duty-roster.types';

	interface GroupOption {
		id: string;
		name: string;
	}

	interface PersonnelOption {
		id: string;
		rank?: string;
		lastName?: string;
		firstName?: string;
		groupId?: string | null;
		mos: string;
		clinicRole: string;
	}

	interface Props {
		templates: DutyTemplate[];
		groups: GroupOption[];
		personnel: PersonnelOption[];
		statusTypes: StatusType[];
		canManageTemplates: boolean;
		onCreateTemplate: (payload: DutyTemplateWriteInput) => Promise<DutyTemplate | null>;
		onUpdateTemplate: (payload: DutyTemplateWriteInput & { id: string }) => Promise<DutyTemplate | null>;
		onArchiveTemplate: (templateId: string) => Promise<DutyTemplate | null>;
	}

	interface EditableSlot {
		key: string;
		roleLabel: string;
		quantity: number;
		allowedRanks: string[];
		allowedGroupIds: string[];
		preferredGroupIds: string[];
		allowedMosValues: string[];
		allowedRoleValues: string[];
		rotationPoolKey: string;
	}

	interface EditableBaseline {
		key: string;
		rotationPoolKey: string;
		personId: string;
		lastServedDate: string;
	}

	type SetupMode = 'quick' | 'full';
	type BuilderStep = 'basics' | 'policy' | 'series' | 'review';

	interface SoftPreferenceOption {
		type: SoftPreferenceType;
		label: string;
		description: string;
	}

	interface TemplateStarterPreset {
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
		}>;
	}

	let {
		templates,
		groups,
		personnel,
		statusTypes,
		canManageTemplates,
		onCreateTemplate,
		onUpdateTemplate,
		onArchiveTemplate
	}: Props = $props();

	let selectedTemplateId = $state<string | null>(null);
	let isCreatingNew = $state(false);
	let initialized = false;
	let saveError = $state('');
	let isSaving = $state(false);
	let isDirty = $state(false);
	let slotKeyIndex = 0;
	let setupMode = $state<SetupMode>('quick');
	let builderStep = $state<BuilderStep>('basics');
	let showArchivedTemplates = $state(false);
	let collapsedSlots = $state<Set<string>>(new Set());
	let pendingArchiveTemplateId = $state<string | null>(null);

	let templateName = $state('');
	let templateDescription = $state('');
	let templateStatus = $state<'draft' | 'active' | 'archived'>('draft');
	let scopeType = $state<'organization' | 'groups'>('organization');
	let scopeGroupIds = $state<string[]>([]);
	let exemptPersonnelIds = $state<string[]>([]);
	let exemptStatusTypeIds = $state<string[]>([]);
	let coverageMode = $state<'all-day' | 'timed'>('all-day');
	let startTime = $state('');
	let endTime = $state('');
	let isBlocking = $state(false);
	let cooldownHours = $state(0);
	let draftSoftPreferences = $state<SoftPreferenceConfig[]>(cloneDefaultSoftPreferences());
	let draftSlots = $state<EditableSlot[]>([]);
	let draftRotationBaselines = $state<EditableBaseline[]>([]);

	const softPreferenceOptions: SoftPreferenceOption[] = [
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

	const templateStarterPresets = $derived.by<TemplateStarterPreset[]>(() => {
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
						rotationPoolKey: 'staff-duty-core'
					},
					{
						roleLabel: 'Runner',
						quantity: 1,
						allowedRanks: ['PFC', 'SPC', 'CPL'],
						allowedGroupIds: [],
						preferredGroupIds: [],
						allowedMosValues: [],
						allowedRoleValues: [],
						rotationPoolKey: 'staff-duty-core'
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
						rotationPoolKey: 'cq-core'
					},
					{
						roleLabel: 'Runner',
						quantity: 1,
						allowedRanks: ['PFC', 'SPC', 'CPL'],
						allowedGroupIds: primaryGroupId ? [primaryGroupId] : [],
						preferredGroupIds: primaryGroupId ? [primaryGroupId] : [],
						allowedMosValues: [],
						allowedRoleValues: [],
						rotationPoolKey: 'cq-core'
					}
				]
			}
		];
	});

	const availableMosValues = $derived(
		[...new Set(personnel.map((person) => person.mos.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
	);
	const availableRoleValues = $derived(
		[...new Set(personnel.map((person) => person.clinicRole.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
	);
	const visibleTemplates = $derived(
		showArchivedTemplates ? templates : templates.filter((template) => template.status !== 'archived')
	);
	const selectedTemplate = $derived(templates.find((template) => template.id === selectedTemplateId) ?? null);
	const hasInvalidSlots = $derived(draftSlots.some((slot) => !slot.roleLabel.trim() || slot.quantity < 1));
	const canSave = $derived(templateName.trim().length > 0 && !hasInvalidSlots);
	const canSaveDraft = $derived(templateName.trim().length > 0);
	const rotationPoolOptions = $derived(
		[...new Set(draftSlots.map((slot) => slot.rotationPoolKey.trim()).filter(Boolean))].sort((a, b) =>
			a.localeCompare(b)
		)
	);
	const rankTagOptions = $derived<TagOption[]>(ALL_RANKS.map((r) => ({ value: r, label: r })));
	const groupTagOptions = $derived<TagOption[]>(groups.map((g) => ({ value: g.id, label: g.name })));
	const mosTagOptions = $derived<TagOption[]>(availableMosValues.map((v) => ({ value: v, label: v })));
	const roleTagOptions = $derived<TagOption[]>(availableRoleValues.map((v) => ({ value: v, label: v })));
	const personnelTagOptions = $derived<TagOption[]>(
		personnel.map((p) => ({ value: p.id, label: formatPersonLabel(p) }))
	);
	const enabledSoftPreferenceSummary = $derived.by(() => {
		const labels = draftSoftPreferences
			.filter((preference) => preference.enabled)
			.map(
				(preference) =>
					softPreferenceOptions.find((option) => option.type === preference.type)?.label ?? preference.type
			);
		return labels.length > 0 ? labels.join(' -> ') : 'Eligibility rules and name tie-breakers only';
	});
	const BUILDER_STEPS: Array<{ id: BuilderStep; label: string }> = [
		{ id: 'basics', label: 'Template Basics' },
		{ id: 'policy', label: 'Duty Rules' },
		{ id: 'series', label: 'Series Setup' },
		{ id: 'review', label: 'Review & Save' }
	];

	function nextSlotKey(): string {
		slotKeyIndex += 1;
		return `slot-${slotKeyIndex}`;
	}

	function makeBlankSlot(): EditableSlot {
		return {
			key: nextSlotKey(),
			roleLabel: '',
			quantity: 1,
			allowedRanks: [],
			allowedGroupIds: [],
			preferredGroupIds: [],
			allowedMosValues: [],
			allowedRoleValues: [],
			rotationPoolKey: ''
		};
	}

	function makeBlankBaseline(): EditableBaseline {
		return {
			key: nextSlotKey(),
			rotationPoolKey: rotationPoolOptions[0] ?? '',
			personId: '',
			lastServedDate: ''
		};
	}

	function formatPersonLabel(person: PersonnelOption): string {
		if (person.rank && person.lastName) {
			return `${person.rank} ${person.lastName}`;
		}
		if (person.lastName && person.firstName) {
			return `${person.lastName}, ${person.firstName}`;
		}
		return person.id;
	}

	function loadTemplate(template: DutyTemplate) {
		selectedTemplateId = template.id;
		isCreatingNew = false;
		isDirty = false;
		setupMode = 'full';
		builderStep = 'basics';
		saveError = '';
		templateName = template.name;
		templateDescription = template.description ?? '';
		templateStatus = template.status;
		scopeType = template.scopeType;
		scopeGroupIds = Array.isArray(template.scopeGroupIds) ? [...template.scopeGroupIds] : [];
		exemptPersonnelIds = Array.isArray(template.exemptPersonnelIds) ? [...template.exemptPersonnelIds] : [];
		exemptStatusTypeIds = Array.isArray(template.exemptStatusTypeIds) ? [...template.exemptStatusTypeIds] : [];
		coverageMode = template.coverageMode;
		startTime = template.startTime ?? '';
		endTime = template.endTime ?? '';
		isBlocking = template.isBlocking;
		cooldownHours = template.cooldownHours;
		draftSoftPreferences =
			Array.isArray(template.softPreferences) && template.softPreferences.length > 0
				? template.softPreferences.map((preference) => ({
						type: preference.type,
						enabled: preference.enabled
					}))
				: cloneDefaultSoftPreferences();
		draftSlots = (Array.isArray(template.slots) ? template.slots : []).map((slot) => ({
			key: nextSlotKey(),
			roleLabel: slot.roleLabel,
			quantity: slot.quantity,
			allowedRanks: [...slot.allowedRanks],
			allowedGroupIds: [...slot.allowedGroupIds],
			preferredGroupIds: [...slot.preferredGroupIds],
			allowedMosValues: [...slot.allowedMosValues],
			allowedRoleValues: [...slot.allowedRoleValues],
			rotationPoolKey: slot.rotationPoolKey
		}));
		draftRotationBaselines = (Array.isArray(template.rotationBaselines) ? template.rotationBaselines : []).map(
			(baseline) => ({
				key: nextSlotKey(),
				rotationPoolKey: baseline.rotationPoolKey,
				personId: baseline.personId,
				lastServedDate: baseline.lastServedDate
			})
		);
	}

	function resetForNew() {
		selectedTemplateId = null;
		isCreatingNew = true;
		isDirty = false;
		setupMode = 'quick';
		builderStep = 'basics';
		saveError = '';
		templateName = '';
		templateDescription = '';
		templateStatus = 'draft';
		scopeType = 'organization';
		scopeGroupIds = [];
		exemptPersonnelIds = [];
		exemptStatusTypeIds = [];
		coverageMode = 'all-day';
		startTime = '';
		endTime = '';
		isBlocking = false;
		cooldownHours = 0;
		draftSoftPreferences = cloneDefaultSoftPreferences();
		draftSlots = [];
		draftRotationBaselines = [];
	}

	function applyStarterPreset(presetId: string | null) {
		resetForNew();
		const preset = templateStarterPresets.find((candidate) => candidate.id === presetId);
		if (!preset) {
			return;
		}

		templateName = preset.name;
		templateDescription = preset.templateDescription;
		scopeType = preset.scopeType;
		scopeGroupIds = [...preset.scopeGroupIds];
		coverageMode = preset.coverageMode;
		startTime = preset.startTime;
		endTime = preset.endTime;
		isBlocking = preset.isBlocking;
		cooldownHours = preset.cooldownHours;
		draftSoftPreferences = cloneDefaultSoftPreferences();
		draftSlots = preset.slots.map((slot) => ({
			key: nextSlotKey(),
			roleLabel: slot.roleLabel,
			quantity: slot.quantity,
			allowedRanks: [...slot.allowedRanks],
			allowedGroupIds: [...slot.allowedGroupIds],
			preferredGroupIds: [...slot.preferredGroupIds],
			allowedMosValues: [...slot.allowedMosValues],
			allowedRoleValues: [...slot.allowedRoleValues],
			rotationPoolKey: slot.rotationPoolKey
		}));
	}

	$effect(() => {
		if (initialized) return;
		initialized = true;

		if (visibleTemplates.length > 0) {
			loadTemplate(visibleTemplates[0]);
			return;
		}

		resetForNew();
	});

	$effect(() => {
		if (!selectedTemplateId) return;
		if (visibleTemplates.some((template) => template.id === selectedTemplateId)) return;

		if (visibleTemplates.length > 0) {
			loadTemplate(visibleTemplates[0]);
		} else {
			resetForNew();
		}
	});

	function addSlot() {
		isDirty = true;
		const newSlot = makeBlankSlot();
		// Collapse all existing slots, leave the new one expanded
		const next = new Set(draftSlots.map((s) => s.key));
		collapsedSlots = next;
		draftSlots = [...draftSlots, newSlot];
	}

	function removeSlot(key: string) {
		isDirty = true;
		collapsedSlots = new Set([...collapsedSlots].filter((k) => k !== key));
		draftSlots = draftSlots.filter((slot) => slot.key !== key);
	}

	function toggleSlotCollapsed(key: string) {
		const next = new Set(collapsedSlots);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedSlots = next;
	}

	function slotSummaryLine(slot: EditableSlot): string {
		const parts: string[] = [`${slot.quantity}×`];
		if (slot.roleLabel) parts.push(slot.roleLabel);
		if (slot.allowedRanks.length)
			parts.push(`Ranks: ${slot.allowedRanks.slice(0, 3).join(', ')}${slot.allowedRanks.length > 3 ? '…' : ''}`);
		if (slot.allowedGroupIds.length) {
			const names = slot.allowedGroupIds.slice(0, 2).map((id) => groups.find((g) => g.id === id)?.name ?? id);
			parts.push(`Groups: ${names.join(', ')}${slot.allowedGroupIds.length > 2 ? '…' : ''}`);
		}
		if (slot.rotationPoolKey) parts.push(`Pool: ${slot.rotationPoolKey}`);
		return parts.join(' · ');
	}

	function updateSlot(key: string, patch: Partial<EditableSlot>) {
		isDirty = true;
		draftSlots = draftSlots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot));
	}

	function addBaseline() {
		isDirty = true;
		draftRotationBaselines = [...draftRotationBaselines, makeBlankBaseline()];
	}

	function removeBaseline(key: string) {
		isDirty = true;
		draftRotationBaselines = draftRotationBaselines.filter((baseline) => baseline.key !== key);
	}

	function updateBaseline(key: string, patch: Partial<EditableBaseline>) {
		isDirty = true;
		draftRotationBaselines = draftRotationBaselines.map((baseline) =>
			baseline.key === key ? { ...baseline, ...patch } : baseline
		);
	}

	function moveSoftPreference(type: SoftPreferenceType, direction: -1 | 1) {
		const index = draftSoftPreferences.findIndex((preference) => preference.type === type);
		const nextIndex = index + direction;
		if (index === -1 || nextIndex < 0 || nextIndex >= draftSoftPreferences.length) {
			return;
		}
		const next = [...draftSoftPreferences];
		const [item] = next.splice(index, 1);
		next.splice(nextIndex, 0, item);
		draftSoftPreferences = next;
	}

	function updateSoftPreference(type: SoftPreferenceType, enabled: boolean) {
		draftSoftPreferences = draftSoftPreferences.map((preference) =>
			preference.type === type ? { ...preference, enabled } : preference
		);
	}

	function toggleExemptStatusType(statusTypeId: string) {
		isDirty = true;
		if (exemptStatusTypeIds.includes(statusTypeId)) {
			exemptStatusTypeIds = exemptStatusTypeIds.filter((id) => id !== statusTypeId);
			return;
		}
		exemptStatusTypeIds = [...exemptStatusTypeIds, statusTypeId];
	}

	function buildPayload(): DutyTemplateWriteInput {
		const slots: DutyTemplateSlotInput[] = draftSlots.map((slot, index) => ({
			roleLabel: slot.roleLabel.trim(),
			quantity: slot.quantity,
			allowedRanks: slot.allowedRanks,
			allowedGroupIds: slot.allowedGroupIds,
			preferredGroupIds: slot.preferredGroupIds,
			allowedMosValues: slot.allowedMosValues,
			allowedRoleValues: slot.allowedRoleValues,
			rotationPoolKey: slot.rotationPoolKey.trim() || `slot-${index + 1}`,
			sortOrder: index
		}));
		const rotationBaselines: DutyTemplateRotationBaselineInput[] = draftRotationBaselines
			.map((baseline) => ({
				rotationPoolKey: baseline.rotationPoolKey.trim(),
				personId: baseline.personId,
				lastServedDate: baseline.lastServedDate
			}))
			.filter((baseline) => baseline.rotationPoolKey && baseline.personId && baseline.lastServedDate);

		return {
			mode: 'advanced',
			status: templateStatus,
			name: templateName.trim(),
			description: templateDescription.trim() || null,
			scopeType,
			scopeGroupIds: scopeType === 'groups' ? scopeGroupIds : [],
			exemptPersonnelIds,
			exemptStatusTypeIds,
			coverageMode,
			startTime: coverageMode === 'timed' ? startTime || null : null,
			endTime: coverageMode === 'timed' ? endTime || null : null,
			isBlocking,
			cooldownHours,
			softPreferences: draftSoftPreferences.map((preference) => ({
				type: preference.type,
				enabled: preference.enabled
			})),
			slots,
			rotationBaselines
		};
	}

	async function handleSave() {
		if (!canSave) return;

		saveError = '';
		isSaving = true;

		try {
			const payload = buildPayload();
			const saved =
				selectedTemplateId && !isCreatingNew
					? await onUpdateTemplate({ ...payload, id: selectedTemplateId })
					: await onCreateTemplate(payload);

			if (saved) {
				loadTemplate(saved);
				return;
			}

			saveError = 'The template could not be saved.';
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'The template could not be saved.';
		} finally {
			isSaving = false;
		}
	}

	async function handleSaveDraft() {
		if (!canSaveDraft) return;

		saveError = '';
		isSaving = true;

		try {
			const payload = { ...buildPayload(), status: 'draft' as const };
			const saved =
				selectedTemplateId && !isCreatingNew
					? await onUpdateTemplate({ ...payload, id: selectedTemplateId })
					: await onCreateTemplate(payload);

			if (saved) {
				loadTemplate(saved);
				return;
			}

			saveError = 'The draft could not be saved.';
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'The draft could not be saved.';
		} finally {
			isSaving = false;
		}
	}

	function goToPreviousStep() {
		const index = BUILDER_STEPS.findIndex((step) => step.id === builderStep);
		if (index <= 0) return;
		builderStep = BUILDER_STEPS[index - 1].id;
	}

	function goToNextStep() {
		const index = BUILDER_STEPS.findIndex((step) => step.id === builderStep);
		if (index < 0 || index >= BUILDER_STEPS.length - 1) return;
		builderStep = BUILDER_STEPS[index + 1].id;
	}

	async function handleArchiveSelectedTemplate() {
		const templateId = pendingArchiveTemplateId ?? selectedTemplateId;
		if (!templateId) return;
		const archived = await onArchiveTemplate(templateId);
		if (archived) {
			loadTemplate(archived);
		}
		pendingArchiveTemplateId = null;
	}

	$effect(() => {
		function handleBeforeUnload(event: BeforeUnloadEvent) {
			if (isDirty) {
				event.preventDefault();
			}
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});
</script>

<section class="advanced-builder">
	<header class="builder-header">
		<div>
			<p class="eyebrow">Advanced Duty Templates</p>
			<h2>Draft and review reusable duty policies.</h2>
			<p class="builder-copy">
				Build the reusable rule set here first. Generation and apply flows can layer on top of these templates later.
			</p>
		</div>
		{#if canManageTemplates}
			<button class="btn btn-primary" type="button" onclick={() => applyStarterPreset(null)}
				>New Advanced Template</button
			>
		{/if}
	</header>

	{#if canManageTemplates}
		<WizardStepper steps={BUILDER_STEPS} current={builderStep} />
	{/if}

	{#if !canManageTemplates}
		<section class="restricted-state">
			<h3>Advanced templates are admin-only right now.</h3>
			<p>
				Owners and admins can create or edit reusable advanced duty templates. Full editors can still use the current
				duty roster generator.
			</p>
		</section>
	{:else}
		<div class="builder-layout">
			<aside class="template-rail" aria-label="Saved duty templates">
				<div class="rail-header">
					<p class="eyebrow">Saved templates</p>
					<label class="field field-checkbox">
						<input type="checkbox" bind:checked={showArchivedTemplates} />
						<span>Show archived</span>
					</label>
				</div>
				{#if visibleTemplates.length === 0}
					<EmptyState
						message="No advanced duty templates yet. Start with a draft so you can shape the policy before generation exists."
						variant="simple"
					/>
				{:else}
					{#each visibleTemplates as template (template.id)}
						<button
							type="button"
							class="template-chip"
							class:active={selectedTemplateId === template.id && !isCreatingNew}
							onclick={() => loadTemplate(template)}
						>
							<span>{template.name}</span>
							<Badge label={template.status} variant="outlined" />
						</button>
					{/each}
				{/if}
			</aside>

			<div class="builder-main">
				{#if builderStep === 'basics'}
					<section class="builder-card starter-card">
						<div class="section-header">
							<div>
								<p class="eyebrow">Advanced Setup</p>
								<h3>Choose a starting point.</h3>
								<p class="builder-copy">
									Start from a common Army-style preset or build from a blank policy, then pick how much detail you want
									to work through right now.
								</p>
							</div>
						</div>

						<div class="setup-mode-toggle" role="group" aria-label="Setup mode">
							<button
								class="mode-chip"
								class:active={setupMode === 'quick'}
								type="button"
								aria-pressed={setupMode === 'quick'}
								onclick={() => (setupMode = 'quick')}
							>
								Quick Setup
							</button>
							<button
								class="mode-chip"
								class:active={setupMode === 'full'}
								type="button"
								aria-pressed={setupMode === 'full'}
								onclick={() => (setupMode = 'full')}
							>
								Full Configuration
							</button>
						</div>

						<div class="starter-grid">
							{#each templateStarterPresets as preset (preset.id)}
								<button class="starter-option" type="button" onclick={() => applyStarterPreset(preset.id)}>
									<strong>Use {preset.label} Preset</strong>
									<span>{preset.description}</span>
								</button>
							{/each}
							<button class="starter-option" type="button" onclick={() => applyStarterPreset(null)}>
								<strong>Build from Blank</strong>
								<span>Start with an empty advanced duty and shape the policy around your local SOP.</span>
							</button>
						</div>

						<p class="field-hint">
							Quick setup keeps the form to the essentials. Full configuration unlocks slot filters, preferred groups,
							and manual rotation starting points.
						</p>
					</section>
				{/if}

				{#if builderStep === 'basics' || builderStep === 'policy'}
					<section class="builder-card">
						<div class="form-grid">
							<label class="field">
								<span>Name</span>
								<input
									class="input"
									type="text"
									bind:value={templateName}
									placeholder="e.g. Battalion Staff Duty"
									oninput={() => (isDirty = true)}
								/>
							</label>

							<label class="field">
								<span>Status</span>
								<select class="input" bind:value={templateStatus} onchange={() => (isDirty = true)}>
									<option value="draft">Draft</option>
									<option value="active">Active</option>
									<option value="archived">Archived</option>
								</select>
							</label>

							<label class="field field-wide">
								<span>Description</span>
								<textarea
									class="input"
									rows="3"
									bind:value={templateDescription}
									oninput={() => (isDirty = true)}
									placeholder="Plain-language context for the policy or SOP this duty template represents."
								></textarea>
							</label>

							{#if builderStep === 'policy'}
								<label class="field">
									<span>Scope</span>
									<select class="input" bind:value={scopeType}>
										<option value="organization">Whole organization</option>
										<option value="groups">Selected groups</option>
									</select>
								</label>

								<label class="field">
									<span>Coverage mode</span>
									<select class="input" bind:value={coverageMode}>
										<option value="all-day">All day</option>
										<option value="timed">Timed shift</option>
									</select>
								</label>

								{#if coverageMode === 'timed'}
									<label class="field">
										<span>Start time</span>
										<input class="input" type="time" bind:value={startTime} />
									</label>

									<label class="field">
										<span>End time</span>
										<input class="input" type="time" bind:value={endTime} />
									</label>
								{/if}

								<label class="field field-checkbox">
									<input type="checkbox" bind:checked={isBlocking} />
									<span>Blocking duty</span>
								</label>

								<label class="field">
									<span>Cooldown hours</span>
									<input class="input" type="number" min="0" bind:value={cooldownHours} />
								</label>
							{/if}
						</div>

						{#if builderStep === 'policy' && scopeType === 'groups'}
							<div class="selection-block">
								<p class="selection-label">Template scope groups</p>
								<MultiTagSelect
									options={groupTagOptions}
									value={scopeGroupIds}
									placeholder="Select groups..."
									ariaLabel="Template scope groups"
									onChange={(ids) => {
										scopeGroupIds = ids;
										isDirty = true;
									}}
								/>
							</div>
						{/if}

						{#if builderStep === 'policy' && personnel.length > 0}
							<div class="selection-block">
								<p class="selection-label">Permanently exempt personnel</p>
								<p class="selection-hint">
									These people are never selected by the generator, regardless of rotation order or slot eligibility
									rules.
								</p>
								<MultiTagSelect
									options={personnelTagOptions}
									value={exemptPersonnelIds}
									placeholder="Search and select exempt personnel..."
									ariaLabel="Exempt personnel"
									onChange={(ids) => {
										exemptPersonnelIds = ids;
										isDirty = true;
									}}
								/>
							</div>
						{/if}

						{#if builderStep === 'policy' && statusTypes.length > 0}
							<div class="selection-block">
								<p class="selection-label">Status-based exemptions</p>
								<p class="selection-hint">
									If someone has one of these calendar statuses on a duty day, they are treated as exempt for that day
									only and re-enter rotation automatically when the status no longer applies.
								</p>
								<div class="chip-list">
									{#each statusTypes as statusType (statusType.id)}
										<button
											class="chip status-chip"
											class:selected={exemptStatusTypeIds.includes(statusType.id)}
											aria-pressed={exemptStatusTypeIds.includes(statusType.id)}
											style="--chip-color: {statusType.color}; --chip-text: {statusType.textColor}"
											onclick={() => toggleExemptStatusType(statusType.id)}
										>
											{statusType.name}
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</section>
				{/if}

				{#if builderStep === 'series'}
					<section class="builder-card">
						<div class="section-header">
							<div>
								<p class="eyebrow">Slot Builder</p>
								<h3>Define the roles this duty needs.</h3>
							</div>
							<button class="btn btn-sm" type="button" onclick={addSlot}>Add Slot</button>
						</div>

						{#if draftSlots.length === 0}
							<EmptyState
								message="No slot definitions yet. Add the first slot so the template can describe who this duty needs."
								variant="simple"
							/>
						{:else}
							<div class="slot-list">
								{#each draftSlots as slot, index (slot.key)}
									{@const isCollapsed = collapsedSlots.has(slot.key)}
									<article class="slot-card" class:slot-collapsed={isCollapsed}>
										<div class="slot-header">
											<button
												class="slot-collapse-btn"
												type="button"
												aria-label={isCollapsed ? 'Expand slot' : 'Collapse slot'}
												aria-expanded={!isCollapsed}
												onclick={() => toggleSlotCollapsed(slot.key)}
											>
												<svg
													class="collapse-chevron"
													class:collapsed={isCollapsed}
													viewBox="0 0 20 20"
													fill="currentColor"
													width="14"
													height="14"
												>
													<path
														fill-rule="evenodd"
														d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
														clip-rule="evenodd"
													/>
												</svg>
											</button>
											<div class="slot-title">
												<h4>{slot.roleLabel || `Slot ${index + 1}`}</h4>
												{#if isCollapsed}
													<p class="slot-summary-line">{slotSummaryLine(slot)}</p>
												{/if}
											</div>
											<button class="btn btn-sm" type="button" onclick={() => removeSlot(slot.key)}>Remove</button>
										</div>

										{#if !isCollapsed}
											<div class="form-grid">
												<label class="field">
													<span>Role label</span>
													<input
														class="input"
														type="text"
														value={slot.roleLabel}
														oninput={(event) =>
															updateSlot(slot.key, { roleLabel: (event.currentTarget as HTMLInputElement).value })}
													/>
												</label>

												<label class="field">
													<span>Quantity</span>
													<input
														class="input"
														type="number"
														min="1"
														value={slot.quantity}
														oninput={(event) =>
															updateSlot(slot.key, {
																quantity: Number((event.currentTarget as HTMLInputElement).value) || 1
															})}
													/>
												</label>

												<label class="field">
													<span>Allowed ranks</span>
													<MultiTagSelect
														options={rankTagOptions}
														value={slot.allowedRanks}
														placeholder="Any rank..."
														ariaLabel="Allowed ranks"
														onChange={(ids) => updateSlot(slot.key, { allowedRanks: ids })}
													/>
												</label>

												<label class="field">
													<span>Allowed groups</span>
													<MultiTagSelect
														options={groupTagOptions}
														value={slot.allowedGroupIds}
														placeholder="Any group..."
														ariaLabel="Allowed groups"
														onChange={(ids) => updateSlot(slot.key, { allowedGroupIds: ids })}
													/>
												</label>

												{#if setupMode === 'full'}
													<label class="field">
														<span>Preferred groups</span>
														<MultiTagSelect
															options={groupTagOptions}
															value={slot.preferredGroupIds}
															placeholder="Any group..."
															ariaLabel="Preferred groups"
															onChange={(ids) => updateSlot(slot.key, { preferredGroupIds: ids })}
														/>
													</label>

													<label class="field">
														<span>MOS filter</span>
														<MultiTagSelect
															options={mosTagOptions}
															value={slot.allowedMosValues}
															placeholder="Any MOS..."
															ariaLabel="MOS filter"
															onChange={(ids) => updateSlot(slot.key, { allowedMosValues: ids })}
														/>
													</label>

													<label class="field">
														<span>Personnel role filter</span>
														<MultiTagSelect
															options={roleTagOptions}
															value={slot.allowedRoleValues}
															placeholder="Any role..."
															ariaLabel="Personnel role filter"
															onChange={(ids) => updateSlot(slot.key, { allowedRoleValues: ids })}
														/>
													</label>
												{/if}

												<label class="field">
													<span>Rotation group</span>
													<input
														class="input"
														type="text"
														value={slot.rotationPoolKey}
														placeholder="Leave blank to keep this slot on its own rotation"
														oninput={(event) =>
															updateSlot(slot.key, {
																rotationPoolKey: (event.currentTarget as HTMLInputElement).value
															})}
													/>
													<span class="field-hint"
														>Use the same rotation group on multiple slots when those positions should rotate together.</span
													>
												</label>
											</div>
										{/if}
									</article>
								{/each}
							</div>
						{/if}
					</section>
				{/if}

				{#if builderStep === 'policy' && setupMode === 'full'}
					<section class="builder-card">
						<div class="section-header">
							<div>
								<p class="eyebrow">Soft Preference Order</p>
								<h3>Choose how the generator breaks ties.</h3>
								<p class="builder-copy">
									Move the enabled preferences into the order you want the generator to consider them.
								</p>
							</div>
						</div>

						<div class="slot-list">
							{#each draftSoftPreferences as preference, index (preference.type)}
								<article class="slot-card">
									<div class="slot-header">
										<div>
											<h4>
												{softPreferenceOptions.find((option) => option.type === preference.type)?.label ??
													preference.type}
											</h4>
											<p class="field-hint">
												{softPreferenceOptions.find((option) => option.type === preference.type)?.description}
											</p>
										</div>
										<div class="slot-actions">
											<button
												class="btn btn-sm"
												type="button"
												disabled={index === 0}
												onclick={() => moveSoftPreference(preference.type, -1)}
											>
												Move Up
											</button>
											<button
												class="btn btn-sm"
												type="button"
												disabled={index === draftSoftPreferences.length - 1}
												onclick={() => moveSoftPreference(preference.type, 1)}
											>
												Move Down
											</button>
										</div>
									</div>

									<label class="field field-checkbox">
										<input
											type="checkbox"
											checked={preference.enabled}
											onchange={(event) =>
												updateSoftPreference(preference.type, (event.currentTarget as HTMLInputElement).checked)}
										/>
										<span>Enabled</span>
									</label>
								</article>
							{/each}
						</div>
					</section>
				{/if}

				{#if builderStep === 'series' && setupMode === 'full'}
					<section class="builder-card">
						<div class="section-header">
							<div>
								<p class="eyebrow">Rotation Starting Points</p>
								<h3>Set a starting point when you do not have enough duty history yet.</h3>
							</div>
							<button class="btn btn-sm" type="button" onclick={addBaseline}>Add Baseline</button>
						</div>

						{#if draftRotationBaselines.length === 0}
							<EmptyState
								message="No manual starting points yet. Add one when a rotation group needs a last-served date to start from."
								variant="simple"
							/>
						{:else}
							<div class="slot-list">
								{#each draftRotationBaselines as baseline, index (baseline.key)}
									<article class="slot-card">
										<div class="slot-header">
											<h4>Baseline {index + 1}</h4>
											<button class="btn btn-sm" type="button" onclick={() => removeBaseline(baseline.key)}
												>Remove</button
											>
										</div>

										<div class="form-grid">
											<label class="field">
												<span>Rotation group</span>
												<input
													class="input"
													type="text"
													list={`rotation-pool-${baseline.key}`}
													value={baseline.rotationPoolKey}
													oninput={(event) =>
														updateBaseline(baseline.key, {
															rotationPoolKey: (event.currentTarget as HTMLInputElement).value
														})}
												/>
												<span class="field-hint"
													>Match this to the rotation group used on the slot you want to seed.</span
												>
												<datalist id={`rotation-pool-${baseline.key}`}>
													{#each rotationPoolOptions as option (option)}
														<option value={option}></option>
													{/each}
												</datalist>
											</label>

											<label class="field">
												<span>Person</span>
												<select
													class="input"
													value={baseline.personId}
													onchange={(event) =>
														updateBaseline(baseline.key, {
															personId: (event.currentTarget as HTMLSelectElement).value
														})}
												>
													<option value="">Select person</option>
													{#each personnel as person (person.id)}
														<option value={person.id}>{formatPersonLabel(person)}</option>
													{/each}
												</select>
											</label>

											<label class="field">
												<span>Last served date</span>
												<input
													class="input"
													type="date"
													value={baseline.lastServedDate}
													oninput={(event) =>
														updateBaseline(baseline.key, {
															lastServedDate: (event.currentTarget as HTMLInputElement).value
														})}
												/>
											</label>
										</div>
									</article>
								{/each}
							</div>
						{/if}
					</section>
				{/if}

				<div class="step-actions">
					{#if builderStep === 'basics'}
						<button class="btn btn-primary" type="button" disabled={!canSaveDraft} onclick={goToNextStep}>Next</button>
						{#if selectedTemplateId && !isCreatingNew && selectedTemplate?.status !== 'archived'}
							<button
								class="btn btn-danger"
								type="button"
								onclick={() => {
									pendingArchiveTemplateId = selectedTemplateId;
								}}
							>
								Archive Template
							</button>
						{/if}
					{:else}
						<button class="btn btn-secondary" type="button" onclick={goToPreviousStep}>Back</button>
						{#if builderStep !== 'review'}
							<button class="btn btn-primary" type="button" onclick={goToNextStep}>
								{builderStep === 'series' ? 'Review Template' : 'Next'}
							</button>
						{/if}
					{/if}
				</div>
				{#if builderStep === 'review'}
					<section class="builder-card summary-card" aria-label="Template summary">
						<p class="eyebrow">Review</p>
						<h3>{templateName || 'Untitled advanced duty template'}</h3>
						<p class="summary-line">Status: <strong>{templateStatus}</strong></p>
						<p class="summary-line">
							Scope: <strong
								>{scopeType === 'organization'
									? 'whole organization'
									: `${scopeGroupIds.length} selected group${scopeGroupIds.length === 1 ? '' : 's'}`}</strong
							>
						</p>
						<p class="summary-line">
							Coverage: <strong
								>{coverageMode === 'timed' ? `${startTime || '--:--'} to ${endTime || '--:--'}` : 'all day'}</strong
							>
						</p>
						<p class="summary-line">
							Conflict policy: <strong>{isBlocking ? 'blocking duty' : 'non-blocking duty'}</strong>
						</p>
						<p class="summary-line">Cooldown: <strong>{cooldownHours} hour{cooldownHours === 1 ? '' : 's'}</strong></p>
						<p class="summary-line">Slot definitions: <strong>{draftSlots.length}</strong></p>
						<p class="summary-line">Rotation starting points: <strong>{draftRotationBaselines.length}</strong></p>
						<p class="summary-line">
							Status-based exemptions: <strong>{exemptStatusTypeIds.length}</strong>
						</p>

						<div class="policy-summary">
							<p class="eyebrow">Policy summary</p>
							<p class="summary-line">
								Soft order: <strong>{enabledSoftPreferenceSummary}</strong>
							</p>
							<p class="summary-line">
								Blocking duty: <strong
									>{isBlocking
										? 'People on this duty are treated as unavailable for overlapping duties.'
										: 'This duty does not block overlapping assignments.'}</strong
								>
							</p>
							<p class="summary-line">
								Cooldown: <strong
									>{cooldownHours > 0
										? `After the shift ends, the same person stays protected for ${cooldownHours} hour${cooldownHours === 1 ? '' : 's'}.`
										: 'No extra recovery window is enforced after the shift ends.'}</strong
								>
							</p>
							<p class="summary-line">
								Fairness confidence: <strong
									>Low confidence means the queue is still learning because history or starting points are thin.</strong
								>
							</p>
						</div>

						{#if draftSlots.length === 0}
							<p class="summary-empty">No slot definitions yet.</p>
						{:else}
							<ul class="summary-slots">
								{#each draftSlots as slot (slot.key)}
									<li>{slot.quantity} x {slot.roleLabel || 'Unnamed slot'}</li>
								{/each}
							</ul>
						{/if}

						{#if saveError}
							<p class="error-message">{saveError}</p>
						{/if}

						{#if isDirty}
							<p class="unsaved-notice">You have unsaved changes.</p>
						{/if}

						<div class="save-actions">
							<button
								class="btn btn-secondary"
								type="button"
								disabled={!canSaveDraft || isSaving}
								onclick={handleSaveDraft}
							>
								{#if isSaving}<Spinner />{/if}
								Save Draft
							</button>
							<button class="btn btn-primary" type="button" disabled={!canSave || isSaving} onclick={handleSave}>
								{#if isSaving}<Spinner />{/if}
								Save Template
							</button>
						</div>
					</section>
				{/if}
			</div>
		</div>
	{/if}
</section>

{#if pendingArchiveTemplateId}
	<ConfirmDialog
		title="Archive Template?"
		message="Archive this advanced template? Existing applied history remains, but this template is hidden from apply pickers until reactivated."
		confirmLabel="Archive Template"
		cancelLabel="Cancel"
		variant="warning"
		onConfirm={handleArchiveSelectedTemplate}
		onCancel={() => {
			pendingArchiveTemplateId = null;
		}}
	/>
{/if}

<style>
	.advanced-builder {
		display: grid;
		gap: var(--sp-5);
	}

	.builder-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--surface-panel) 88%, var(--amber-light) 12%),
			var(--surface-panel)
		);
	}

	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.builder-header h2,
	.section-header h3,
	.summary-card h3,
	.restricted-state h3 {
		margin: 0;
		font-size: var(--text-ui-lg);
	}

	.builder-copy,
	.restricted-state p,
	.summary-empty,
	.error-message {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}

	.builder-layout {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: start;
	}

	.template-rail,
	.builder-card,
	.summary-card,
	.restricted-state {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.template-rail,
	.summary-card {
		padding: var(--sp-4);
	}

	.rail-header {
		display: grid;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}

	.builder-main {
		display: grid;
		gap: var(--sp-4);
	}

	.builder-card {
		padding: var(--sp-4);
	}

	.starter-card {
		display: grid;
		gap: var(--sp-4);
	}

	.setup-mode-toggle {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.mode-chip,
	.starter-option {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
	}

	.mode-chip {
		padding: var(--sp-2) var(--sp-3);
		font: inherit;
		cursor: pointer;
	}

	.mode-chip.active {
		border-color: var(--amber);
		background: color-mix(in srgb, var(--surface-panel) 80%, var(--amber-light) 20%);
	}

	.starter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--sp-3);
	}

	.starter-option {
		display: grid;
		gap: var(--sp-2);
		padding: var(--sp-4);
		text-align: left;
		cursor: pointer;
	}

	.starter-option strong {
		font-size: var(--text-sm);
	}

	.starter-option span {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.step-actions {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.chip {
		appearance: none;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid var(--border-default);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.chip:hover {
		border-color: var(--ink-35);
		background: var(--surface-page);
		color: var(--text-primary);
	}

	.chip.selected {
		background: var(--amber-light);
		border-color: var(--amber);
		color: var(--amber-dark);
	}

	.chip.status-chip.selected {
		background: var(--chip-color);
		border-color: var(--chip-color);
		color: var(--chip-text);
	}

	.template-chip {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
		cursor: pointer;
		text-align: left;
		margin-bottom: var(--sp-2);
	}

	.template-chip.active {
		border-color: var(--amber);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--amber) 65%, transparent);
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	.field {
		display: grid;
		gap: var(--sp-2);
	}

	.field span,
	.selection-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.field-wide {
		grid-column: 1 / -1;
	}

	.field-checkbox {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		align-self: end;
	}

	.selection-block {
		margin-top: var(--sp-4);
	}

	.selection-hint {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-top: var(--sp-1);
		margin-bottom: var(--sp-2);
	}

	.section-header,
	.slot-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
	}

	.slot-list {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.slot-card {
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
	}

	.slot-card.slot-collapsed {
		padding: var(--sp-3) var(--sp-4);
	}

	.slot-header {
		margin-bottom: var(--sp-3);
	}

	.slot-card.slot-collapsed .slot-header {
		margin-bottom: 0;
	}

	.slot-collapse-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: none;
		color: var(--text-tertiary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.slot-collapse-btn:hover {
		color: var(--text-primary);
	}

	.collapse-chevron {
		transition: transform 0.15s ease;
	}

	.collapse-chevron.collapsed {
		transform: rotate(-90deg);
	}

	.slot-title {
		flex: 1;
		min-width: 0;
	}

	.slot-header h4 {
		margin: 0;
	}

	.slot-summary-line {
		margin: 2px 0 0;
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.slot-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.summary-line {
		margin: 0 0 var(--sp-2);
		color: var(--text-secondary);
	}

	.summary-slots {
		margin: var(--sp-3) 0 0;
		padding-left: 18px;
		color: var(--text-secondary);
	}

	.policy-summary {
		display: grid;
		gap: var(--sp-2);
		padding-top: var(--sp-2);
		border-top: 1px solid var(--border-subtle);
	}

	.save-actions {
		display: flex;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}

	.save-actions .btn {
		flex: 1;
		justify-content: center;
	}

	.unsaved-notice {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}

	.error-message {
		color: var(--color-error);
	}

	.restricted-state {
		padding: var(--sp-6);
		text-align: center;
	}

	@media (max-width: 1100px) {
		.builder-layout {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.builder-header {
			flex-direction: column;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
