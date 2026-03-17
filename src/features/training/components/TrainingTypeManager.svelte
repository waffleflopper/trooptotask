<script lang="ts">
	import type { TrainingType } from '$features/training/training.types';
	import TypeManager from '$lib/components/ui/TypeManager.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		trainingTypes: TrainingType[];
		availableRoles: string[];
		onAdd: (data: Omit<TrainingType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<TrainingType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { trainingTypes, availableRoles, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	// New form state
	let newName = $state('');
	let newDescription = $state('');
	let newExpirationMonths = $state<number | null>(12);
	let newWarningYellow = $state(60);
	let newWarningOrange = $state(30);
	let newRequiredForRoles = $state<string[]>([]);
	let newColor = $state('#6b7280');
	let newExpirationDateOnly = $state(false);
	let newCanBeExempted = $state(false);

	// Edit form state
	let editName = $state('');
	let editDescription = $state('');
	let editExpirationMonths = $state<number | null>(null);
	let editWarningYellow = $state(60);
	let editWarningOrange = $state(30);
	let editRequiredForRoles = $state<string[]>([]);
	let editColor = $state('');
	let editExpirationDateOnly = $state(false);
	let editCanBeExempted = $state(false);

	function toggleRole(roles: string[], role: string): string[] {
		if (role === '*') {
			return roles.includes('*') ? [] : ['*'];
		}
		let newRoles = roles.filter((r) => r !== '*');
		if (newRoles.includes(role)) {
			return newRoles.filter((r) => r !== role);
		}
		return [...newRoles, role];
	}

	// Sorted list for display and reorder
	let orderedTypes = $state<TrainingType[]>([]);

	$effect(() => {
		orderedTypes = [...trainingTypes].sort((a, b) => a.sortOrder - b.sortOrder);
	});

	function moveUp(index: number) {
		if (index === 0) return;
		const next = orderedTypes.map((t, i) => ({ ...t, sortOrder: i }));
		[next[index], next[index - 1]] = [next[index - 1], next[index]];
		next[index - 1].sortOrder = index - 1;
		next[index].sortOrder = index;
		orderedTypes = next;
		onUpdate(next[index - 1].id, { sortOrder: index - 1 });
		onUpdate(next[index].id, { sortOrder: index });
	}

	function moveDown(index: number) {
		if (index === orderedTypes.length - 1) return;
		const next = orderedTypes.map((t, i) => ({ ...t, sortOrder: i }));
		[next[index], next[index + 1]] = [next[index + 1], next[index]];
		next[index].sortOrder = index;
		next[index + 1].sortOrder = index + 1;
		orderedTypes = next;
		onUpdate(next[index].id, { sortOrder: index });
		onUpdate(next[index + 1].id, { sortOrder: index + 1 });
	}

	function formatRequiredRoles(roles: string[]): string {
		if (roles.includes('*')) return 'All';
		if (roles.length === 0) return '';
		return roles.join(', ');
	}
</script>

<TypeManager
	items={orderedTypes}
	title="Manage Training Types"
	noun="Training Type"
	titleId="training-types-title"
	width="600px"
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	getAddData={() =>
		newName.trim()
			? {
					name: newName.trim(),
					description: newDescription.trim() || null,
					expirationMonths: newExpirationDateOnly ? null : newExpirationMonths,
					warningDaysYellow: newWarningYellow,
					warningDaysOrange: newWarningOrange,
					requiredForRoles: newRequiredForRoles,
					color: newColor,
					sortOrder: trainingTypes.length,
					expirationDateOnly: newExpirationDateOnly,
					canBeExempted: newCanBeExempted,
					exemptPersonnelIds: []
				}
			: null}
	resetAddForm={() => {
		newName = '';
		newDescription = '';
		newExpirationMonths = 12;
		newWarningYellow = 60;
		newWarningOrange = 30;
		newRequiredForRoles = [];
		newColor = '#6b7280';
		newExpirationDateOnly = false;
		newCanBeExempted = false;
	}}
	onEditStart={(t) => {
		editName = t.name;
		editDescription = t.description ?? '';
		editExpirationMonths = t.expirationMonths;
		editWarningYellow = t.warningDaysYellow;
		editWarningOrange = t.warningDaysOrange;
		editRequiredForRoles = [...t.requiredForRoles];
		editColor = t.color;
		editExpirationDateOnly = t.expirationDateOnly;
		editCanBeExempted = t.canBeExempted;
	}}
	getEditData={() =>
		editName.trim()
			? {
					name: editName.trim(),
					description: editDescription.trim() || null,
					expirationMonths: editExpirationDateOnly ? null : editExpirationMonths,
					warningDaysYellow: editWarningYellow,
					warningDaysOrange: editWarningOrange,
					requiredForRoles: editRequiredForRoles,
					color: editColor,
					expirationDateOnly: editExpirationDateOnly,
					canBeExempted: editCanBeExempted
				}
			: null}
	removeConfirmMessage={(t) => `Remove "${t.name}"? All training records of this type will also be removed.`}
>
	{#snippet addForm()}
		<div class="training-form">
			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Name</label>
					<input type="text" class="input" bind:value={newName} placeholder="e.g., CPR/BLS" />
				</div>
				<div class="form-group">
					<label class="label">Color</label>
					<input type="color" class="color-input" bind:value={newColor} />
				</div>
			</div>

			<div class="form-group">
				<label class="label">Description (optional)</label>
				<input type="text" class="input" bind:value={newDescription} placeholder="Brief description..." />
			</div>

			<div class="form-row">
				<div class="form-group">
					<label class="label">Expiration</label>
					{#if newExpirationDateOnly}
						<div class="expiration-date-only-note">Expiration date entered per person</div>
					{:else}
						<div class="expiration-input">
							<input
								type="number"
								class="input"
								bind:value={newExpirationMonths}
								min="1"
								placeholder="e.g., 24"
								disabled={newExpirationMonths === null}
							/>
							<label class="checkbox-label">
								<input
									type="checkbox"
									checked={newExpirationMonths === null}
									onchange={() => (newExpirationMonths = newExpirationMonths === null ? 12 : null)}
								/>
								Never expires
							</label>
						</div>
					{/if}
					<label class="checkbox-label mode-toggle">
						<input type="checkbox" bind:checked={newExpirationDateOnly} />
						Expiration date only (variable per person)
					</label>
				</div>
				<div class="form-group">
					<label class="label">Warning Days</label>
					<div class="warning-inputs">
						<div class="warning-input">
							<span class="warning-dot yellow"></span>
							<input type="number" class="input small" bind:value={newWarningYellow} min="1" />
						</div>
						<div class="warning-input">
							<span class="warning-dot orange"></span>
							<input type="number" class="input small" bind:value={newWarningOrange} min="1" />
						</div>
					</div>
				</div>
			</div>

			<div class="form-group">
				<label class="label">Required For Roles (empty = optional for all)</label>
				<div class="role-chips">
					<button
						type="button"
						class="role-chip all-chip"
						class:selected={newRequiredForRoles.includes('*')}
						onclick={() => (newRequiredForRoles = toggleRole(newRequiredForRoles, '*'))}
					>
						All
					</button>
					{#each availableRoles as role}
						<button
							type="button"
							class="role-chip"
							class:selected={newRequiredForRoles.includes(role)}
							class:disabled={newRequiredForRoles.includes('*')}
							onclick={() => (newRequiredForRoles = toggleRole(newRequiredForRoles, role))}
							disabled={newRequiredForRoles.includes('*')}
						>
							{role || '(No role)'}
						</button>
					{/each}
				</div>
			</div>

			<div class="form-group">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={newCanBeExempted} />
					Can be exempted (allow marking individual personnel as exempt)
				</label>
			</div>
		</div>
	{/snippet}

	{#snippet itemDisplay(type)}
		{@const index = orderedTypes.findIndex((t) => t.id === type.id)}
		<div class="move-btns">
			<button class="btn-move" onclick={() => moveUp(index)} disabled={index === 0} title="Move up">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
					><polyline points="18 15 12 9 6 15" /></svg
				>
			</button>
			<button
				class="btn-move"
				onclick={() => moveDown(index)}
				disabled={index === orderedTypes.length - 1}
				title="Move down"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
					><polyline points="6 9 12 15 18 9" /></svg
				>
			</button>
		</div>
		<Badge label={type.name} color={type.color} />
		{#if type.expirationDateOnly}
			<span class="type-meta">Exp. date per person</span>
		{:else if type.expirationMonths}
			<span class="type-meta">Expires: {type.expirationMonths}mo</span>
		{:else}
			<span class="type-meta">Never expires</span>
		{/if}
		{#if type.requiredForRoles.length > 0}
			<span class="type-meta">Required for: {formatRequiredRoles(type.requiredForRoles)}</span>
		{/if}
	{/snippet}

	{#snippet editForm()}
		<div class="training-form">
			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Name</label>
					<input type="text" class="input" bind:value={editName} />
				</div>
				<div class="form-group">
					<label class="label">Color</label>
					<input type="color" class="color-input" bind:value={editColor} />
				</div>
			</div>

			<div class="form-group">
				<label class="label">Description</label>
				<input type="text" class="input" bind:value={editDescription} />
			</div>

			<div class="form-row">
				<div class="form-group">
					<label class="label">Expiration</label>
					{#if editExpirationDateOnly}
						<div class="expiration-date-only-note">Expiration date entered per person</div>
					{:else}
						<div class="expiration-input">
							<input
								type="number"
								class="input"
								bind:value={editExpirationMonths}
								min="1"
								disabled={editExpirationMonths === null}
							/>
							<label class="checkbox-label">
								<input
									type="checkbox"
									checked={editExpirationMonths === null}
									onchange={() => (editExpirationMonths = editExpirationMonths === null ? 12 : null)}
								/>
								Never
							</label>
						</div>
					{/if}
					<label class="checkbox-label mode-toggle">
						<input type="checkbox" bind:checked={editExpirationDateOnly} />
						Expiration date only (variable per person)
					</label>
				</div>
				<div class="form-group">
					<label class="label">Warning Days</label>
					<div class="warning-inputs">
						<div class="warning-input">
							<span class="warning-dot yellow"></span>
							<input type="number" class="input small" bind:value={editWarningYellow} min="1" />
						</div>
						<div class="warning-input">
							<span class="warning-dot orange"></span>
							<input type="number" class="input small" bind:value={editWarningOrange} min="1" />
						</div>
					</div>
				</div>
			</div>

			<div class="form-group">
				<label class="label">Required For Roles</label>
				<div class="role-chips">
					<button
						type="button"
						class="role-chip all-chip"
						class:selected={editRequiredForRoles.includes('*')}
						onclick={() => (editRequiredForRoles = toggleRole(editRequiredForRoles, '*'))}
					>
						All
					</button>
					{#each availableRoles as role}
						<button
							type="button"
							class="role-chip"
							class:selected={editRequiredForRoles.includes(role)}
							class:disabled={editRequiredForRoles.includes('*')}
							onclick={() => (editRequiredForRoles = toggleRole(editRequiredForRoles, role))}
							disabled={editRequiredForRoles.includes('*')}
						>
							{role || '(No role)'}
						</button>
					{/each}
				</div>
			</div>

			<div class="form-group">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={editCanBeExempted} />
					Can be exempted
				</label>
			</div>
		</div>
	{/snippet}
</TypeManager>

<style>
	.training-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		width: 100%;
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.form-group {
		margin-bottom: 0;
	}

	.form-group.flex-1 {
		flex: 1;
	}

	.color-input {
		width: 40px;
		height: 40px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
	}

	.expiration-input {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.expiration-input .input {
		width: 80px;
	}

	.checkbox-label {
		white-space: nowrap;
	}

	.warning-inputs {
		display: flex;
		gap: var(--spacing-sm);
	}

	.warning-input {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.warning-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.warning-dot.yellow {
		background-color: #eab308;
	}

	.warning-dot.orange {
		background-color: #f97316;
	}

	.input.small {
		width: 60px;
	}

	.role-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.role-chip {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.role-chip:hover {
		border-color: var(--color-primary);
	}

	.role-chip.selected {
		background: var(--color-primary);
		color: #0f0f0f;
		border-color: var(--color-primary);
	}

	.role-chip.all-chip {
		font-weight: 600;
	}

	.role-chip.disabled,
	.role-chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.type-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.expiration-date-only-note {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		font-style: italic;
		margin-bottom: var(--spacing-xs);
	}

	.mode-toggle {
		margin-top: var(--spacing-sm);
		border: none;
		background: none;
		padding: 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.move-btns {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-right: var(--spacing-xs);
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

	.btn-move svg {
		width: 12px;
		height: 12px;
	}
</style>
