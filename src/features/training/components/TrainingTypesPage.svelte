<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import {
		getExpirationMode,
		toExpirationFields,
		formatApplicability,
		getTypeSummaryLine,
		type ExpirationMode
	} from '$features/training/utils/trainingTypeDisplay';
	import ApplicabilityEditor from './ApplicabilityEditor.svelte';
	import type { ApplicabilityFields } from './ApplicabilityEditor.svelte';
	import type { TrainingType } from '$features/training/training.types';

	let { data } = $props();

	const org = getOrgContext();
	const canMutate = $derived(!org.readOnly && (org.isPrivileged || org.isFullEditor));

	// --- State ---
	let selectedTypeId: string | null = $state(null);
	let editing = $state(false);
	let creating = $state(false);
	let saving = $state(false);
	let confirmDelete: { id: string; name: string } | null = $state(null);

	// Edit form state
	let editName = $state('');
	let editDescription = $state('');
	let editColor = $state('#6b7280');
	let editExpirationMode: ExpirationMode = $state('never');
	let editExpirationMonths = $state<number | null>(12);
	let editWarningYellow = $state(60);
	let editWarningOrange = $state(30);
	let editAppliesToRoles = $state<string[]>([]);
	let editAppliesToMos = $state<string[]>([]);
	let editAppliesToRanks = $state<string[]>([]);
	let editExcludedRoles = $state<string[]>([]);
	let editExcludedMos = $state<string[]>([]);
	let editExcludedRanks = $state<string[]>([]);
	let editCanBeExempted = $state(false);

	// --- Derived ---
	const types = $derived(trainingTypesStore.items);
	const orderedTypes = $derived([...types].sort((a, b) => a.sortOrder - b.sortOrder));
	const selectedType = $derived(selectedTypeId ? (types.find((t) => t.id === selectedTypeId) ?? null) : null);

	const personnel = $derived(data.personnel ?? []);

	const availableRoles = $derived(
		[...new Set(personnel.map((p: { clinicRole: string }) => p.clinicRole))]
			.filter(Boolean)
			.sort() as string[]
	);

	const availableMos = $derived(
		[...new Set(personnel.map((p: { mos: string }) => p.mos))]
			.filter(Boolean)
			.sort() as string[]
	);

	const availableRanks = $derived(
		[...new Set(personnel.map((p: { rank: string }) => p.rank))]
			.filter(Boolean)
			.sort() as string[]
	);

	// --- Actions ---
	function selectType(id: string) {
		if (editing || creating) return;
		selectedTypeId = id;
	}

	function startEdit() {
		if (!selectedType || !canMutate) return;
		editName = selectedType.name;
		editDescription = selectedType.description ?? '';
		editColor = selectedType.color;
		editExpirationMode = getExpirationMode(selectedType);
		editExpirationMonths = selectedType.expirationMonths ?? 12;
		editWarningYellow = selectedType.warningDaysYellow;
		editWarningOrange = selectedType.warningDaysOrange;
		editAppliesToRoles = [...selectedType.appliesToRoles];
		editAppliesToMos = [...selectedType.appliesToMos];
		editAppliesToRanks = [...selectedType.appliesToRanks];
		editExcludedRoles = [...selectedType.excludedRoles];
		editExcludedMos = [...selectedType.excludedMos];
		editExcludedRanks = [...selectedType.excludedRanks];
		editCanBeExempted = selectedType.canBeExempted;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		creating = false;
		saving = false;
	}

	function startCreate() {
		if (!canMutate) return;
		selectedTypeId = null;
		editName = '';
		editDescription = '';
		editColor = '#6b7280';
		editExpirationMode = 'fixed';
		editExpirationMonths = 12;
		editWarningYellow = 60;
		editWarningOrange = 30;
		editAppliesToRoles = [];
		editAppliesToMos = [];
		editAppliesToRanks = [];
		editExcludedRoles = [];
		editExcludedMos = [];
		editExcludedRanks = [];
		editCanBeExempted = false;
		creating = true;
		editing = false;
	}

	async function saveEdit() {
		if (!editName.trim() || saving) return;
		saving = true;
		try {
			const expirationFields = toExpirationFields(
				editExpirationMode,
				editExpirationMode === 'fixed' ? editExpirationMonths : null
			);
			const payload = {
				name: editName.trim(),
				description: editDescription.trim() || null,
				color: editColor,
				...expirationFields,
				warningDaysYellow: editExpirationMode === 'never' ? 60 : editWarningYellow,
				warningDaysOrange: editExpirationMode === 'never' ? 30 : editWarningOrange,
				appliesToRoles: editAppliesToRoles,
				appliesToMos: editAppliesToMos,
				appliesToRanks: editAppliesToRanks,
				excludedRoles: editExcludedRoles,
				excludedMos: editExcludedMos,
				excludedRanks: editExcludedRanks,
				canBeExempted: editCanBeExempted
			};

			if (creating) {
				const newType = await trainingTypesStore.add({
					...payload,
					sortOrder: orderedTypes.length,
					exemptPersonnelIds: []
				} as Omit<TrainingType, 'id'>);
				if (newType) selectedTypeId = newType.id;
				creating = false;
			} else if (selectedTypeId) {
				await trainingTypesStore.update(selectedTypeId, payload);
			}
			editing = false;
		} finally {
			saving = false;
		}
	}

	async function deleteType(id: string) {
		await trainingTypesStore.remove(id);
		if (selectedTypeId === id) selectedTypeId = null;
		confirmDelete = null;
	}

	async function moveUp(index: number) {
		if (index === 0) return;
		const current = orderedTypes[index];
		const above = orderedTypes[index - 1];
		await Promise.all([
			trainingTypesStore.update(current.id, { sortOrder: above.sortOrder }),
			trainingTypesStore.update(above.id, { sortOrder: current.sortOrder })
		]);
	}

	async function moveDown(index: number) {
		if (index === orderedTypes.length - 1) return;
		await moveUp(index + 1);
	}

	function handleApplicabilityChange(fields: ApplicabilityFields) {
		editAppliesToRoles = fields.appliesToRoles;
		editAppliesToMos = fields.appliesToMos;
		editAppliesToRanks = fields.appliesToRanks;
		editExcludedRoles = fields.excludedRoles;
		editExcludedMos = fields.excludedMos;
		editExcludedRanks = fields.excludedRanks;
	}

	function getExpirationLabel(mode: ExpirationMode): string {
		switch (mode) {
			case 'fixed':
				return 'Expires after a set number of months';
			case 'never':
				return 'Never expires';
			case 'date-only':
				return 'Expiration date varies per person';
		}
	}
</script>

<PageToolbar
	title="Training Types"
	breadcrumbs={[{ label: 'Training', href: `/org/${org.orgId}/training` }, { label: 'Types' }]}
>
	<a href={`/org/${org.orgId}/training`} class="btn btn-sm">Back</a>
</PageToolbar>

<div class="types-layout">
	<!-- Left panel: Type list -->
	<div class="panel type-list-panel">
		<div class="panel-header">
			<h3 class="panel-title">Training Types</h3>
			{#if canMutate}
				<button class="btn btn-primary btn-sm" onclick={startCreate} disabled={creating || editing}>
					+ New Type
				</button>
			{/if}
		</div>

		{#if orderedTypes.length === 0 && !creating}
			<EmptyState
				message="No training types yet. Create one to get started."
				actionLabel={canMutate ? '+ New Type' : undefined}
				onAction={canMutate ? startCreate : undefined}
			/>
		{:else}
			<ul class="type-list" role="listbox" aria-label="Training types">
				{#each orderedTypes as type, i (type.id)}
					<li
						class="type-item"
						class:selected={selectedTypeId === type.id && !creating}
						role="option"
						aria-selected={selectedTypeId === type.id && !creating}
						onclick={() => selectType(type.id)}
						onkeydown={(e) => e.key === 'Enter' && selectType(type.id)}
						tabindex="0"
					>
						<div class="type-item-main">
							<span class="type-color-swatch" style="background-color: {type.color}"></span>
							<div class="type-info">
								<span class="type-name">{type.name}</span>
								<span class="type-summary">{getTypeSummaryLine(type)}</span>
							</div>
						</div>
						{#if canMutate && !editing && !creating}
							<div
								class="type-reorder"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.stopPropagation()}
								role="toolbar"
								tabindex="-1"
							>
								<button class="btn-move" onclick={() => moveUp(i)} disabled={i === 0} aria-label="Move up"
									>&#9650;</button
								>
								<button
									class="btn-move"
									onclick={() => moveDown(i)}
									disabled={i === orderedTypes.length - 1}
									aria-label="Move down">&#9660;</button
								>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Right panel: Detail / Editor -->
	<div class="panel detail-panel">
		{#if creating || editing}
			<!-- Editor -->
			<div class="editor">
				<h3 class="panel-title">{creating ? 'New Training Type' : 'Edit Training Type'}</h3>

				<!-- Section 1: Basics -->
				<fieldset class="editor-section">
					<legend class="section-title">Basics</legend>
					<div class="form-field">
						<label class="form-label" for="type-name">Name</label>
						<input class="input" id="type-name" type="text" bind:value={editName} placeholder="e.g. First Aid" />
					</div>
					<div class="form-field">
						<label class="form-label" for="type-desc">Description</label>
						<textarea
							class="input"
							id="type-desc"
							rows="2"
							bind:value={editDescription}
							placeholder="Optional description"
						></textarea>
					</div>
					<div class="form-field">
						<label class="form-label" for="type-color">Color</label>
						<div class="color-picker">
							<input id="type-color" type="color" bind:value={editColor} />
							<span class="color-value">{editColor}</span>
						</div>
					</div>
				</fieldset>

				<!-- Section 2: Expiration -->
				<fieldset class="editor-section">
					<legend class="section-title">Expiration</legend>
					<div class="radio-group">
						{#each ['fixed', 'never', 'date-only'] as const as mode (mode)}
							<label class="radio-option">
								<input type="radio" name="expiration-mode" value={mode} bind:group={editExpirationMode} />
								<span>{getExpirationLabel(mode)}</span>
							</label>
						{/each}
					</div>
					{#if editExpirationMode === 'fixed'}
						<div class="form-field inline-field">
							<label class="form-label" for="exp-months">Months until expiration</label>
							<input
								class="input input-sm"
								id="exp-months"
								type="number"
								min="1"
								max="120"
								bind:value={editExpirationMonths}
							/>
						</div>
					{/if}
				</fieldset>

				<!-- Section 3: Warning Thresholds -->
				{#if editExpirationMode !== 'never'}
					<fieldset class="editor-section">
						<legend class="section-title">Warning Thresholds</legend>
						<div class="threshold-fields">
							<div class="form-field inline-field">
								<label class="form-label" for="warn-yellow">Yellow warning (days)</label>
								<input class="input input-sm" id="warn-yellow" type="number" min="1" bind:value={editWarningYellow} />
							</div>
							<div class="form-field inline-field">
								<label class="form-label" for="warn-orange">Orange warning (days)</label>
								<input class="input input-sm" id="warn-orange" type="number" min="1" bind:value={editWarningOrange} />
							</div>
						</div>
					</fieldset>
				{/if}

				<!-- Section 4: Applicability -->
				<ApplicabilityEditor
					appliesToRoles={editAppliesToRoles}
					appliesToMos={editAppliesToMos}
					appliesToRanks={editAppliesToRanks}
					excludedRoles={editExcludedRoles}
					excludedMos={editExcludedMos}
					excludedRanks={editExcludedRanks}
					{availableRoles}
					{availableMos}
					{availableRanks}
					onchange={handleApplicabilityChange}
				/>

				<!-- Section 5: Options -->
				<fieldset class="editor-section">
					<legend class="section-title">Options</legend>
					<label class="toggle-option">
						<input type="checkbox" bind:checked={editCanBeExempted} />
						<span>Can be exempted</span>
					</label>
				</fieldset>

				<!-- Actions -->
				<div class="editor-actions">
					{#if !creating && selectedTypeId && canMutate}
						<button
							class="btn btn-danger btn-sm"
							onclick={() => (confirmDelete = selectedType ? { id: selectedType.id, name: selectedType.name } : null)}
							>Delete</button
						>
					{/if}
					<div class="spacer"></div>
					<button class="btn btn-sm" onclick={cancelEdit}>Cancel</button>
					<button class="btn btn-primary btn-sm" onclick={saveEdit} disabled={!editName.trim() || saving}>
						{#if saving}<Spinner size={12} />{/if}
						{creating ? 'Create' : 'Save'}
					</button>
				</div>
			</div>
		{:else if selectedType}
			<!-- Read-only detail view -->
			<div class="detail-view">
				<div class="detail-header">
					<div class="detail-title-row">
						<span class="type-color-swatch large" style="background-color: {selectedType.color}"></span>
						<h3 class="detail-name">{selectedType.name}</h3>
					</div>
					{#if canMutate}
						<button class="btn btn-sm" onclick={startEdit}>Edit</button>
					{/if}
				</div>

				{#if selectedType.description}
					<p class="detail-description">{selectedType.description}</p>
				{/if}

				<dl class="detail-fields">
					<div class="detail-field">
						<dt>Expiration</dt>
						<dd>{getExpirationLabel(getExpirationMode(selectedType))}</dd>
					</div>

					{#if getExpirationMode(selectedType) === 'fixed'}
						<div class="detail-field">
							<dt>Duration</dt>
							<dd>{selectedType.expirationMonths} months</dd>
						</div>
					{/if}

					{#if getExpirationMode(selectedType) !== 'never'}
						<div class="detail-field">
							<dt>Warning Thresholds</dt>
							<dd>Yellow at {selectedType.warningDaysYellow} days, Orange at {selectedType.warningDaysOrange} days</dd>
						</div>
					{/if}

					<div class="detail-field">
						<dt>Applies to</dt>
						<dd>{formatApplicability(selectedType)}</dd>
					</div>

					<div class="detail-field">
						<dt>Can be exempted</dt>
						<dd>{selectedType.canBeExempted ? 'Yes' : 'No'}</dd>
					</div>
				</dl>

				{#if canMutate}
					<div class="detail-actions">
						<button
							class="btn btn-danger btn-sm"
							onclick={() => (confirmDelete = { id: selectedType.id, name: selectedType.name })}>Delete Type</button
						>
					</div>
				{/if}
			</div>
		{:else}
			<div class="panel-placeholder">
				<p class="placeholder-text">Select a training type to view details</p>
			</div>
		{/if}
	</div>
</div>

{#if confirmDelete}
	<ConfirmDialog
		title="Delete Training Type"
		message="Are you sure you want to delete '{confirmDelete.name}'? All associated training records will also be deleted. This cannot be undone."
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDelete) deleteType(confirmDelete.id);
		}}
		onCancel={() => (confirmDelete = null)}
	/>
{/if}

<style>
	.types-layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 0;
		height: calc(100vh - var(--header-height, 56px) - 60px);
		overflow: hidden;
	}

	.panel {
		overflow-y: auto;
		padding: var(--spacing-md);
	}

	.type-list-panel {
		border-right: 1px solid var(--color-border);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.panel-title {
		font-family: var(--font-display);
		font-size: var(--font-size-base);
		font-weight: 500;
		margin: 0;
	}

	.type-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.type-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.type-item:hover {
		background: var(--color-surface-variant);
	}

	.type-item.selected {
		background: var(--color-surface-variant);
		border-color: var(--color-primary);
	}

	.type-item-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		min-width: 0;
		flex: 1;
	}

	.type-color-swatch {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.type-color-swatch.large {
		width: 16px;
		height: 16px;
	}

	.type-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.type-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.type-summary {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.type-reorder {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-left: var(--spacing-xs);
	}

	.btn-move {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 10px;
		transition: all var(--transition-fast);
	}

	.btn-move:hover:not(:disabled) {
		background: var(--color-surface-variant);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.btn-move:disabled {
		opacity: 0.25;
		cursor: default;
	}

	/* Detail panel */
	.panel-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
	}

	.placeholder-text {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.detail-view {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.detail-title-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.detail-name {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 500;
		margin: 0;
	}

	.detail-description {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0;
	}

	.detail-fields {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin: 0;
	}

	.detail-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-field dt {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.detail-field dd {
		font-size: var(--font-size-sm);
		margin: 0;
	}

	.detail-actions {
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	/* Editor */
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.editor-section {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.section-title {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding-bottom: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-xs);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.form-label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.color-picker {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.color-picker input[type='color'] {
		width: 36px;
		height: 36px;
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.color-value {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}

	.radio-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.radio-option {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.inline-field {
		flex-direction: row;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.input-sm {
		width: 80px;
	}

	.threshold-fields {
		display: flex;
		gap: var(--spacing-lg);
	}

	.chip-selector {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 12px;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-bg);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.chip:hover:not(:disabled) {
		border-color: var(--color-primary);
	}

	.chip.active {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.chip:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	.toggle-option {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.editor-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	@media (max-width: 768px) {
		.types-layout {
			grid-template-columns: 1fr;
			height: auto;
		}

		.type-list-panel {
			border-right: none;
			border-bottom: 1px solid var(--color-border);
			max-height: 300px;
		}

		.threshold-fields {
			flex-direction: column;
			gap: var(--spacing-sm);
		}
	}
</style>
