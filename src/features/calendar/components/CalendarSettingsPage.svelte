<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import PencilIcon from '$lib/components/ui/icons/PencilIcon.svelte';
	import Trash2Icon from '$lib/components/ui/icons/Trash2Icon.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { formatDate } from '$lib/utils/dates';
	import type { StatusType, AssignmentType, SpecialDay } from '$lib/types';

	const org = getOrgContext();
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && (org.isPrivileged || org.isFullEditor));

	// ---- Status Types ----
	let newStatusName = $state('');
	let newStatusColor = $state('#6b7280');
	let newStatusTextColor = $state('#ffffff');
	let editingStatus = $state<StatusType | null>(null);
	let editStatusName = $state('');
	let editStatusColor = $state('');
	let editStatusTextColor = $state('');
	let confirmDeleteStatus = $state<StatusType | null>(null);

	function startEditStatus(s: StatusType) {
		editingStatus = s;
		editStatusName = s.name;
		editStatusColor = s.color;
		editStatusTextColor = s.textColor;
	}

	function cancelEditStatus() {
		editingStatus = null;
	}

	async function saveEditStatus() {
		if (!editingStatus || !editStatusName.trim()) return;
		await statusTypesStore.update(editingStatus.id, {
			name: editStatusName.trim(),
			color: editStatusColor,
			textColor: editStatusTextColor
		});
		editingStatus = null;
	}

	async function addStatus() {
		if (!canMutate) return;
		if (!newStatusName.trim()) return;
		await statusTypesStore.add({ name: newStatusName.trim(), color: newStatusColor, textColor: newStatusTextColor });
		newStatusName = '';
		newStatusColor = '#6b7280';
		newStatusTextColor = '#ffffff';
	}

	async function deleteStatus(s: StatusType) {
		if (!canMutate) return;
		await statusTypesStore.remove(s.id);
		availabilityStore.removeByStatusTypeLocal(s.id);
		confirmDeleteStatus = null;
	}

	// ---- Assignment Types ----
	let newAssignName = $state('');
	let newAssignShortName = $state('');
	let newAssignTo = $state<'personnel' | 'group'>('personnel');
	let newAssignColor = $state('#3b82f6');
	let editingAssign = $state<AssignmentType | null>(null);
	let editAssignName = $state('');
	let editAssignShortName = $state('');
	let editAssignTo = $state<'personnel' | 'group'>('personnel');
	let editAssignColor = $state('');
	let confirmDeleteAssign = $state<AssignmentType | null>(null);
	let showResetConfirm = $state(false);

	const headerTypeId = $derived(dailyAssignmentsStore.types.find((t) => t.showInDateHeader)?.id ?? null);

	function startEditAssign(t: AssignmentType) {
		editingAssign = t;
		editAssignName = t.name;
		editAssignShortName = t.shortName;
		editAssignTo = t.assignTo;
		editAssignColor = t.color;
	}

	function cancelEditAssign() {
		editingAssign = null;
	}

	async function saveEditAssign() {
		if (!editingAssign || !editAssignName.trim() || !editAssignShortName.trim()) return;
		await dailyAssignmentsStore.updateType(editingAssign.id, {
			name: editAssignName.trim(),
			shortName: editAssignShortName.trim().toUpperCase(),
			assignTo: editAssignTo,
			color: editAssignColor
		});
		editingAssign = null;
	}

	async function addAssignType() {
		if (!canMutate) return;
		if (!newAssignName.trim() || !newAssignShortName.trim()) return;
		await dailyAssignmentsStore.addType({
			name: newAssignName.trim(),
			shortName: newAssignShortName.trim().toUpperCase(),
			assignTo: newAssignTo,
			color: newAssignColor,
			exemptPersonnelIds: []
		});
		newAssignName = '';
		newAssignShortName = '';
		newAssignTo = 'personnel';
		newAssignColor = '#3b82f6';
	}

	async function deleteAssignType(t: AssignmentType) {
		if (!canMutate) return;
		await dailyAssignmentsStore.removeType(t.id);
		confirmDeleteAssign = null;
	}

	async function setShowInDateHeader(id: string | null) {
		if (!canMutate) return;
		const prev = dailyAssignmentsStore.types.find((t) => t.showInDateHeader);
		if (prev && prev.id !== id) {
			await dailyAssignmentsStore.updateType(prev.id, { showInDateHeader: false });
		}
		if (id) {
			await dailyAssignmentsStore.updateType(id, { showInDateHeader: true });
		}
	}

	// ---- Holidays & Special Days ----
	let newSpecialDate = $state(formatDate(new Date()));
	let newSpecialName = $state('');
	let newSpecialType = $state<'federal-holiday' | 'org-closure'>('org-closure');
	let filterYear = $state(new Date().getFullYear());
	let confirmDeleteSpecial = $state<SpecialDay | null>(null);

	const yearOptions = $derived.by(() => {
		const y = new Date().getFullYear();
		return [y - 1, y, y + 1, y + 2];
	});

	const filteredDays = $derived(
		specialDaysStore.items
			.filter((d) => d.date.startsWith(`${filterYear}-`))
			.sort((a, b) => a.date.localeCompare(b.date))
	);

	async function addSpecialDay() {
		if (!canMutate) return;
		if (!newSpecialDate || !newSpecialName.trim()) return;
		await specialDaysStore.add({ date: newSpecialDate, name: newSpecialName.trim(), type: newSpecialType });
		newSpecialName = '';
	}

	async function deleteSpecialDay(d: SpecialDay) {
		if (!canMutate) return;
		await specialDaysStore.remove(d.id);
		confirmDeleteSpecial = null;
	}

	function formatDisplayDate(dateStr: string): string {
		return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<PageToolbar
	title="Calendar Settings"
	breadcrumbs={[{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }, { label: 'Settings' }]}
>
	<a href="/org/{org.orgId}/calendar" class="btn btn-sm">Back</a>
</PageToolbar>

<div class="settings-page">
	{#if !canManageConfig}
		<section class="settings-hero">
			<div class="hero-copy">
				<p class="eyebrow">Calendar configuration</p>
				<h1>Access restricted.</h1>
				<p class="hero-description">
					You can view the calendar, but only organization admins and full editors can manage calendar settings.
				</p>
			</div>
		</section>
	{:else}
		<section class="settings-hero">
			<div class="hero-copy">
				<p class="eyebrow">Calendar configuration</p>
				<h1>Keep the calendar rules easy to scan and easy to update.</h1>
				<p class="hero-description">
					Statuses, duty labels, and special days all shape the calendar differently. Splitting them into dedicated
					panels makes it easier to review what exists and make changes without losing your place.
				</p>
			</div>
		</section>

		<div class="settings-grid">
		<!-- ===== STATUS TYPES ===== -->
			<section class="settings-section card card-flat">
			<div class="section-header">
				<div>
					<p class="section-kicker">Personnel availability</p>
					<h2 class="section-title">Status Types</h2>
				</div>
				<p class="section-description">Define the statuses that can be assigned to personnel on the calendar.</p>
			</div>

			<div class="add-form add-form-priority">
				<input
					class="input"
					type="text"
					bind:value={newStatusName}
					placeholder="Status name (e.g., Leave, TDY)"
					disabled={!canMutate}
				/>
				<label class="color-picker">
					<span>Background</span>
					<input type="color" bind:value={newStatusColor} disabled={!canMutate} />
				</label>
				<label class="color-picker">
					<span>Text</span>
					<input type="color" bind:value={newStatusTextColor} disabled={!canMutate} />
				</label>
				{#if newStatusName.trim()}
					<Badge label={newStatusName} color={newStatusColor} textColor={newStatusTextColor} />
				{/if}
				<button class="btn btn-primary btn-sm" onclick={addStatus} disabled={!canMutate || !newStatusName.trim()}>
					+ Add
				</button>
			</div>

			<div class="item-list">
				{#each statusTypesStore.items as status (status.id)}
					<div class="item-row status-item-row">
						{#if editingStatus?.id === status.id}
							<div class="inline-edit">
								<input class="input" type="text" bind:value={editStatusName} placeholder="Status name" />
								<label class="color-picker">
									<span>BG</span>
									<input type="color" bind:value={editStatusColor} />
								</label>
								<label class="color-picker">
									<span>Text</span>
									<input type="color" bind:value={editStatusTextColor} />
								</label>
								<Badge label={editStatusName || 'Preview'} color={editStatusColor} textColor={editStatusTextColor} />
								<button class="btn btn-primary btn-sm" onclick={saveEditStatus} disabled={!canMutate || !editStatusName.trim()}
									>Save</button
								>
								<button class="btn btn-sm" onclick={cancelEditStatus}>Cancel</button>
							</div>
						{:else}
								<Badge label={status.name} color={status.color} textColor={status.textColor} />
								<div class="item-actions">
									{#if canMutate}
										<button class="item-icon-button" type="button" title="Edit status type" aria-label="Edit status type" onclick={() => startEditStatus(status)}>
											<PencilIcon size={16} strokeWidth={2} />
										</button>
										<button class="item-icon-button item-icon-button-danger" type="button" title="Delete status type" aria-label="Delete status type" onclick={() => (confirmDeleteStatus = status)}>
											<Trash2Icon size={16} strokeWidth={2} />
										</button>
									{/if}
								</div>
							{/if}
					</div>
					{/each}
				</div>
			</section>

		<!-- ===== ASSIGNMENT TYPES ===== -->
			<section class="settings-section card card-flat">
			<div class="section-header">
				<div>
					<p class="section-kicker">Duty coverage</p>
					<h2 class="section-title">Assignment Types</h2>
				</div>
				<p class="section-description">
					Define assignment types and choose which assignee appears in each calendar date header.
				</p>
			</div>

			<div class="add-form add-form-priority">
				<input
					class="input"
					type="text"
					bind:value={newAssignName}
					placeholder="Full name (e.g., Staff Duty)"
					disabled={!canMutate}
				/>
				<input
					class="input short-input"
					type="text"
					bind:value={newAssignShortName}
					placeholder="Short (e.g., SD)"
					maxlength="5"
					disabled={!canMutate}
				/>
				<select class="select" bind:value={newAssignTo} disabled={!canMutate}>
					<option value="personnel">Assign to Person</option>
					<option value="group">Assign to Group</option>
				</select>
				<label class="color-picker">
					<span>Color</span>
					<input type="color" bind:value={newAssignColor} disabled={!canMutate} />
				</label>
				<button
					class="btn btn-primary btn-sm"
					onclick={addAssignType}
					disabled={!canMutate || !newAssignName.trim() || !newAssignShortName.trim()}>+ Add</button
				>
			</div>

			<div class="item-list">
				{#each dailyAssignmentsStore.types as type (type.id)}
					<div class="item-row">
						{#if editingAssign?.id === type.id}
							<div class="inline-edit">
								<input class="input" type="text" bind:value={editAssignName} placeholder="Full name" />
								<input
									class="input short-input"
									type="text"
									bind:value={editAssignShortName}
									placeholder="Short"
									maxlength="5"
								/>
								<select class="select" bind:value={editAssignTo}>
									<option value="personnel">Person</option>
									<option value="group">Group</option>
								</select>
								<label class="color-picker">
									<span>Color</span>
									<input type="color" bind:value={editAssignColor} />
								</label>
								<button
									class="btn btn-primary btn-sm"
									onclick={saveEditAssign}
									disabled={!canMutate || !editAssignName.trim() || !editAssignShortName.trim()}>Save</button
								>
								<button class="btn btn-sm" onclick={cancelEditAssign}>Cancel</button>
							</div>
						{:else}
							<label class="header-radio" title="Show in date header">
								<input
									type="radio"
									name="showInDateHeader"
									value={type.id}
									checked={headerTypeId === type.id}
									disabled={!canMutate}
									onchange={() => setShowInDateHeader(type.id)}
								/>
							</label>
								<Badge label={type.shortName} color={type.color} bold={true} />
								<span class="item-name">{type.name}</span>
								<span class="item-meta">{type.assignTo === 'personnel' ? 'Person' : 'Group'}</span>
								<div class="item-actions">
									{#if canMutate}
										<button class="item-icon-button" type="button" title="Edit assignment type" aria-label="Edit assignment type" onclick={() => startEditAssign(type)}>
											<PencilIcon size={16} strokeWidth={2} />
										</button>
										<button class="item-icon-button item-icon-button-danger" type="button" title="Delete assignment type" aria-label="Delete assignment type" onclick={() => (confirmDeleteAssign = type)}>
											<Trash2Icon size={16} strokeWidth={2} />
										</button>
									{/if}
								</div>
							{/if}
					</div>
				{/each}
			</div>

			<p class="hint">
				<strong>Show in date header:</strong> Select the assignment type whose assignee name appears in each date
				column of the calendar grid.
				{#if headerTypeId}
					Currently showing: <strong>{dailyAssignmentsStore.types.find((t) => t.id === headerTypeId)?.name}</strong>
					{:else}
						None selected (no assignee shown in date headers).
					{/if}
				</p>
			</section>

		<!-- ===== HOLIDAYS & SPECIAL DAYS ===== -->
			<section class="settings-section settings-section-wide card card-flat">
			<div class="section-header">
				<div>
					<p class="section-kicker">Date exceptions</p>
					<h2 class="section-title">Holidays &amp; Special Days</h2>
				</div>
				<p class="section-description">
					Mark federal holidays or unit closures so they stand out across the calendar and reports.
				</p>
			</div>

			<div class="filter-bar">
				<label class="label" for="filter-year">Year:</label>
				<select id="filter-year" class="select year-select" bind:value={filterYear}>
					{#each yearOptions as year (year)}
						<option value={year}>{year}</option>
					{/each}
				</select>
				<span class="count">{filteredDays.length} days</span>
				<button
					class="btn btn-secondary btn-sm reset-button"
					onclick={() => (showResetConfirm = true)}
					disabled={!canMutate}
				>
					Reset Federal Holidays
				</button>
			</div>

			<div class="add-form add-form-priority">
				<input type="date" class="input date-input" bind:value={newSpecialDate} disabled={!canMutate} />
				<input
					class="input flexible-input"
					type="text"
					bind:value={newSpecialName}
					placeholder="Name (e.g., Training Day)"
					disabled={!canMutate}
				/>
				<select class="select type-select" bind:value={newSpecialType} disabled={!canMutate}>
					<option value="org-closure">Closure</option>
					<option value="federal-holiday">Federal Holiday</option>
				</select>
				<button class="btn btn-primary btn-sm" onclick={addSpecialDay} disabled={!canMutate || !newSpecialName.trim()}>
					+ Add
				</button>
			</div>

			<div class="item-list">
				{#each filteredDays as day (day.id)}
					<div class="item-row">
						<span class="day-date">{formatDisplayDate(day.date)}</span>
						<span class="item-name">{day.name}</span>
							<span class="day-type" class:holiday={day.type === 'federal-holiday'}>
								{day.type === 'federal-holiday' ? 'Holiday' : 'Closure'}
							</span>
							<div class="item-actions">
								{#if canMutate}
									<button class="item-icon-button item-icon-button-danger" type="button" title="Delete special day" aria-label="Delete special day" onclick={() => (confirmDeleteSpecial = day)}>
										<Trash2Icon size={16} strokeWidth={2} />
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<p class="empty-msg">No holidays or closures for {filterYear}.</p>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>

<!-- Confirm dialogs -->
{#if confirmDeleteStatus}
	<ConfirmDialog
		title="Delete Status Type"
		message={`Remove "${confirmDeleteStatus.name}"? All schedule entries using this status will also be removed. This cannot be undone.`}
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDeleteStatus) deleteStatus(confirmDeleteStatus);
		}}
		onCancel={() => (confirmDeleteStatus = null)}
	/>
{/if}

{#if confirmDeleteAssign}
	<ConfirmDialog
		title="Delete Assignment Type"
		message={`Remove "${confirmDeleteAssign.name}"? All assignments using this type will also be removed. This cannot be undone.`}
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDeleteAssign) deleteAssignType(confirmDeleteAssign);
		}}
		onCancel={() => (confirmDeleteAssign = null)}
	/>
{/if}

{#if confirmDeleteSpecial}
	<ConfirmDialog
		title="Remove Special Day"
		message={`Remove "${confirmDeleteSpecial.name}"?`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={() => {
			if (confirmDeleteSpecial) deleteSpecialDay(confirmDeleteSpecial);
		}}
		onCancel={() => (confirmDeleteSpecial = null)}
	/>
{/if}

{#if showResetConfirm}
	<ConfirmDialog
		title="Reset Federal Holidays"
		message="Reset federal holidays to defaults? Custom closures will be preserved."
		confirmLabel="Reset"
		variant="warning"
		onConfirm={() => {
			specialDaysStore.resetFederalHolidays();
			showResetConfirm = false;
		}}
		onCancel={() => (showResetConfirm = false)}
	/>
{/if}

<style>
	.settings-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xl);
	}

	.settings-hero {
		padding: var(--spacing-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		background: linear-gradient(135deg, var(--color-primary-tint), var(--color-surface) 45%);
		box-shadow: var(--shadow-1);
	}

	.hero-copy {
		max-width: 720px;
	}

	.eyebrow {
		margin: 0 0 var(--spacing-xs);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-primary);
	}

	.settings-hero h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3vw, 2.5rem);
		line-height: 1.1;
	}

	.hero-description {
		margin: var(--spacing-sm) 0 0;
		max-width: 62ch;
		font-size: var(--font-size-md);
		line-height: 1.6;
		color: var(--color-text-muted);
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-lg);
		align-items: start;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		min-height: 100%;
		padding: var(--spacing-lg);
	}

	.settings-section-wide {
		grid-column: 1 / -1;
	}

	.section-header {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding-bottom: var(--spacing-sm);
		border-bottom: 1px solid var(--color-divider);
	}

	.section-kicker {
		margin: 0 0 2px;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 1.5vw, 1.35rem);
		font-weight: 600;
		margin: 0;
	}

	.section-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.item-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		min-width: 0;
		max-height: min(26rem, 42vh);
		overflow-y: auto;
		padding-right: var(--spacing-xs);
	}

	.item-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		min-height: 44px;
	}

	.status-item-row {
		flex-wrap: nowrap;
	}

	.inline-edit {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		width: 100%;
	}

	.inline-edit .input {
		flex: 1;
		min-width: 120px;
	}

	.item-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		flex: 1;
		min-width: 120px;
	}

	.item-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.item-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		margin-left: auto;
	}

	.item-icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		min-height: 36px;
		padding: 0 var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text-muted);
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.item-icon-button:hover:not(:disabled) {
		background: var(--color-surface-variant);
		border-color: var(--color-border-dark);
		color: var(--color-text);
	}

	.item-icon-button-danger {
		color: var(--color-destructive);
	}

	.item-icon-button-danger:hover:not(:disabled) {
		color: var(--color-destructive);
	}

	.add-form {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface-variant);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
	}

	.add-form-priority {
		order: 0;
	}

	.add-form .input {
		flex: 1;
		min-width: 140px;
	}

	.short-input {
		flex: 0 0 80px !important;
		min-width: 80px !important;
		text-transform: uppercase;
	}

	.color-picker {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-2xs);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		cursor: pointer;
	}

	.color-picker input[type='color'] {
		width: 32px;
		height: 32px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
	}

	.header-radio {
		display: flex;
		align-items: center;
		cursor: pointer;
	}

	.hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin: 0;
		line-height: 1.5;
	}

	.filter-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.filter-bar .label {
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.day-date {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		min-width: 132px;
	}

	.day-type {
		font-size: var(--font-size-xs);
		padding: var(--spacing-2xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	.day-type.holiday {
		background: var(--color-holiday);
		color: var(--color-text);
	}

	.empty-msg {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		padding: var(--spacing-md);
		margin: 0;
	}

	.year-select {
		width: 100px;
	}

	.reset-button {
		margin-left: auto;
	}

	.date-input {
		width: 160px;
	}

	.flexible-input {
		flex: 1;
	}

	.type-select {
		width: 150px;
	}

	@media (max-width: 960px) {
		.settings-page {
			padding: var(--spacing-md);
		}

		.settings-grid {
			grid-template-columns: 1fr;
		}

		.settings-section-wide {
			grid-column: auto;
		}
	}

	@media (max-width: 640px) {
		.settings-hero,
		.settings-section {
			padding: var(--spacing-md);
		}

		.item-list {
			max-height: none;
			overflow-y: visible;
			padding-right: 0;
		}

		.item-row {
			align-items: flex-start;
		}

		.item-actions {
			margin-left: 0;
			width: 100%;
		}

		.reset-button {
			margin-left: 0;
			width: 100%;
		}

		.year-select,
		.date-input,
		.type-select,
		.short-input {
			width: 100%;
			flex-basis: 100% !important;
		}

		.day-date {
			min-width: 0;
		}
	}
</style>
