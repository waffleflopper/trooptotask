<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { ALL_RANKS } from '$lib/types';
	import type {
		DutyTemplate,
		DutyTemplateRotationBaselineInput,
		DutyTemplateSlotInput,
		DutyTemplateWriteInput
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
		canManageTemplates: boolean;
		onCreateTemplate: (payload: DutyTemplateWriteInput) => Promise<DutyTemplate | null>;
		onUpdateTemplate: (payload: DutyTemplateWriteInput & { id: string }) => Promise<DutyTemplate | null>;
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

	let { templates, groups, personnel, canManageTemplates, onCreateTemplate, onUpdateTemplate }: Props = $props();

	let selectedTemplateId = $state<string | null>(null);
	let isCreatingNew = $state(false);
	let initialized = false;
	let saveError = $state('');
	let isSaving = $state(false);
	let slotKeyIndex = 0;

	let templateName = $state('');
	let templateDescription = $state('');
	let templateStatus = $state<'draft' | 'active' | 'archived'>('draft');
	let scopeType = $state<'organization' | 'groups'>('organization');
	let scopeGroupIds = $state<string[]>([]);
	let coverageMode = $state<'all-day' | 'timed'>('all-day');
	let startTime = $state('');
	let endTime = $state('');
	let isBlocking = $state(false);
	let cooldownHours = $state(0);
	let draftSlots = $state<EditableSlot[]>([]);
	let draftRotationBaselines = $state<EditableBaseline[]>([]);

	const availableMosValues = $derived(
		[...new Set(personnel.map((person) => person.mos.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
	);
	const availableRoleValues = $derived(
		[...new Set(personnel.map((person) => person.clinicRole.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
	);
	const selectedTemplate = $derived(templates.find((template) => template.id === selectedTemplateId) ?? null);
	const hasInvalidSlots = $derived(draftSlots.some((slot) => !slot.roleLabel.trim() || slot.quantity < 1));
	const canSave = $derived(templateName.trim().length > 0 && !hasInvalidSlots);
	const rotationPoolOptions = $derived(
		[...new Set(draftSlots.map((slot) => slot.rotationPoolKey.trim()).filter(Boolean))].sort((a, b) =>
			a.localeCompare(b)
		)
	);

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
		saveError = '';
		templateName = template.name;
		templateDescription = template.description ?? '';
		templateStatus = template.status;
		scopeType = template.scopeType;
		scopeGroupIds = [...template.scopeGroupIds];
		coverageMode = template.coverageMode;
		startTime = template.startTime ?? '';
		endTime = template.endTime ?? '';
		isBlocking = template.isBlocking;
		cooldownHours = template.cooldownHours;
		draftSlots = template.slots.map((slot) => ({
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
		draftRotationBaselines = template.rotationBaselines.map((baseline) => ({
			key: nextSlotKey(),
			rotationPoolKey: baseline.rotationPoolKey,
			personId: baseline.personId,
			lastServedDate: baseline.lastServedDate
		}));
	}

	function resetForNew() {
		selectedTemplateId = null;
		isCreatingNew = true;
		saveError = '';
		templateName = '';
		templateDescription = '';
		templateStatus = 'draft';
		scopeType = 'organization';
		scopeGroupIds = [];
		coverageMode = 'all-day';
		startTime = '';
		endTime = '';
		isBlocking = false;
		cooldownHours = 0;
		draftSlots = [];
		draftRotationBaselines = [];
	}

	$effect(() => {
		if (initialized) return;
		initialized = true;

		if (templates.length > 0) {
			loadTemplate(templates[0]);
			return;
		}

		resetForNew();
	});

	$effect(() => {
		if (!selectedTemplateId) return;
		if (templates.some((template) => template.id === selectedTemplateId)) return;

		if (templates.length > 0) {
			loadTemplate(templates[0]);
		} else {
			resetForNew();
		}
	});

	function addSlot() {
		draftSlots = [...draftSlots, makeBlankSlot()];
	}

	function removeSlot(key: string) {
		draftSlots = draftSlots.filter((slot) => slot.key !== key);
	}

	function updateSlot(key: string, patch: Partial<EditableSlot>) {
		draftSlots = draftSlots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot));
	}

	function addBaseline() {
		draftRotationBaselines = [...draftRotationBaselines, makeBlankBaseline()];
	}

	function removeBaseline(key: string) {
		draftRotationBaselines = draftRotationBaselines.filter((baseline) => baseline.key !== key);
	}

	function updateBaseline(key: string, patch: Partial<EditableBaseline>) {
		draftRotationBaselines = draftRotationBaselines.map((baseline) =>
			baseline.key === key ? { ...baseline, ...patch } : baseline
		);
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
			coverageMode,
			startTime: coverageMode === 'timed' ? startTime || null : null,
			endTime: coverageMode === 'timed' ? endTime || null : null,
			isBlocking,
			cooldownHours,
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
			<button class="btn btn-primary" type="button" onclick={resetForNew}>New Advanced Template</button>
		{/if}
	</header>

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
				{#if templates.length === 0}
					<EmptyState
						message="No advanced duty templates yet. Start with a draft so you can shape the policy before generation exists."
						variant="simple"
					/>
				{:else}
					{#each templates as template (template.id)}
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
				<section class="builder-card">
					<div class="form-grid">
						<label class="field">
							<span>Name</span>
							<input class="input" type="text" bind:value={templateName} placeholder="e.g. Battalion Staff Duty" />
						</label>

						<label class="field">
							<span>Status</span>
							<select class="input" bind:value={templateStatus}>
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
								placeholder="Plain-language context for the policy or SOP this duty template represents."
							></textarea>
						</label>

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
					</div>

					{#if scopeType === 'groups'}
						<div class="selection-block">
							<p class="selection-label">Template scope groups</p>
							<div class="pill-grid">
								{#each groups as group (group.id)}
									<label class="pill-check">
										<input
											type="checkbox"
											checked={scopeGroupIds.includes(group.id)}
											onchange={(event) => {
												const checked = (event.currentTarget as HTMLInputElement).checked;
												scopeGroupIds = checked
													? [...scopeGroupIds, group.id]
													: scopeGroupIds.filter((id) => id !== group.id);
											}}
										/>
										<span>{group.name}</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}
				</section>

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
								<article class="slot-card">
									<div class="slot-header">
										<h4>Slot {index + 1}</h4>
										<button class="btn btn-sm" type="button" onclick={() => removeSlot(slot.key)}>Remove</button>
									</div>

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
											<select
												class="input"
												multiple
												value={slot.allowedRanks}
												onchange={(event) => {
													const target = event.currentTarget as HTMLSelectElement;
													updateSlot(slot.key, {
														allowedRanks: [...target.selectedOptions].map((option) => option.value)
													});
												}}
											>
												{#each ALL_RANKS as rank (rank)}
													<option value={rank}>{rank}</option>
												{/each}
											</select>
										</label>

										<label class="field">
											<span>Allowed groups</span>
											<select
												class="input"
												multiple
												value={slot.allowedGroupIds}
												onchange={(event) => {
													const target = event.currentTarget as HTMLSelectElement;
													updateSlot(slot.key, {
														allowedGroupIds: [...target.selectedOptions].map((option) => option.value)
													});
												}}
											>
												{#each groups as group (group.id)}
													<option value={group.id}>{group.name}</option>
												{/each}
											</select>
										</label>

										<label class="field">
											<span>Preferred groups</span>
											<select
												class="input"
												multiple
												value={slot.preferredGroupIds}
												onchange={(event) => {
													const target = event.currentTarget as HTMLSelectElement;
													updateSlot(slot.key, {
														preferredGroupIds: [...target.selectedOptions].map((option) => option.value)
													});
												}}
											>
												{#each groups as group (group.id)}
													<option value={group.id}>{group.name}</option>
												{/each}
											</select>
										</label>

										<label class="field">
											<span>MOS filter</span>
											<select
												class="input"
												multiple
												value={slot.allowedMosValues}
												onchange={(event) => {
													const target = event.currentTarget as HTMLSelectElement;
													updateSlot(slot.key, {
														allowedMosValues: [...target.selectedOptions].map((option) => option.value)
													});
												}}
											>
												{#each availableMosValues as mos (mos)}
													<option value={mos}>{mos}</option>
												{/each}
											</select>
										</label>

										<label class="field">
											<span>Personnel role filter</span>
											<select
												class="input"
												multiple
												value={slot.allowedRoleValues}
												onchange={(event) => {
													const target = event.currentTarget as HTMLSelectElement;
													updateSlot(slot.key, {
														allowedRoleValues: [...target.selectedOptions].map((option) => option.value)
													});
												}}
											>
												{#each availableRoleValues as role (role)}
													<option value={role}>{role}</option>
												{/each}
											</select>
										</label>

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
								</article>
							{/each}
						</div>
					{/if}
				</section>

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
										<button class="btn btn-sm" type="button" onclick={() => removeBaseline(baseline.key)}>Remove</button
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
											<span class="field-hint">Match this to the rotation group used on the slot you want to seed.</span
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
			</div>

			<aside class="summary-card" aria-label="Template summary">
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

				<button class="btn btn-primary save-btn" type="button" disabled={!canSave || isSaving} onclick={handleSave}>
					{#if isSaving}<Spinner />{/if}
					Save Template
				</button>
			</aside>
		</div>
	{/if}
</section>

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
		grid-template-columns: 220px minmax(0, 1fr) 300px;
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

	.builder-main {
		display: grid;
		gap: var(--sp-4);
	}

	.builder-card {
		padding: var(--sp-4);
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

	.pill-grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}

	.pill-check {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
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

	.slot-header {
		margin-bottom: var(--sp-3);
	}

	.slot-header h4 {
		margin: 0;
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

	.save-btn {
		width: 100%;
		margin-top: var(--sp-4);
		justify-content: center;
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
