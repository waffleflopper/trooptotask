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
	import { fly } from 'svelte/transition';
	import { expoOut, cubicIn } from 'svelte/easing';

	const org = getOrgContext();
	const reducedMotion =
		typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
	const rowIn = reducedMotion ? { y: 0, duration: 0 } : { y: -8, duration: 180, easing: expoOut };
	const rowOut = reducedMotion ? { y: 0, duration: 0 } : { y: -4, duration: 120, easing: cubicIn };
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && (org.isPrivileged || org.isFullEditor));

	// ---- Status Types ----
	let newStatusName = $state('');
	let newStatusColor = $state('#4a4a47');
	let newStatusTextColor = $state('#f8f7f4');
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
		newStatusColor = '#4a4a47';
		newStatusTextColor = '#f8f7f4';
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
	let newAssignColor = $state('#c47f00');
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
			exemptPersonnelIds: [],
			showInDateHeader: false
		});
		newAssignName = '';
		newAssignShortName = '';
		newAssignTo = 'personnel';
		newAssignColor = '#c47f00';
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
	let editingSpecialDay = $state<SpecialDay | null>(null);
	let editSpecialName = $state('');
	let editSpecialType = $state<'federal-holiday' | 'org-closure'>('org-closure');

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

	function startEditSpecialDay(d: SpecialDay) {
		editingSpecialDay = d;
		editSpecialName = d.name;
		editSpecialType = d.type;
	}

	function cancelEditSpecialDay() {
		editingSpecialDay = null;
	}

	async function saveEditSpecialDay() {
		if (!editingSpecialDay || !editSpecialName.trim()) return;
		const updated = await specialDaysStore.update(editingSpecialDay.id, {
			name: editSpecialName.trim(),
			type: editSpecialType
		});
		if (updated) {
			editingSpecialDay = null;
		}
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
				<a href="/org/{org.orgId}/calendar" class="btn btn-sm hero-action">View calendar</a>
			</div>
		</section>
	{:else}
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
						<div class="item-row status-item-row" in:fly={rowIn} out:fly={rowOut}>
							{#if editingStatus?.id === status.id}
								<div class="inline-edit">
									<input
										class="input"
										type="text"
										bind:value={editStatusName}
										placeholder="Status name"
										aria-label="Status name"
									/>
									<label class="color-picker">
										<span>Background</span>
										<input type="color" bind:value={editStatusColor} />
									</label>
									<label class="color-picker">
										<span>Text</span>
										<input type="color" bind:value={editStatusTextColor} />
									</label>
									<Badge label={editStatusName || 'Preview'} color={editStatusColor} textColor={editStatusTextColor} />
									<button
										class="btn btn-primary btn-sm"
										onclick={saveEditStatus}
										disabled={!canMutate || !editStatusName.trim()}>Save</button
									>
									<button class="btn btn-sm" onclick={cancelEditStatus}>Cancel</button>
								</div>
							{:else}
								<Badge label={status.name} color={status.color} textColor={status.textColor} />
								<div class="item-actions">
									{#if canMutate}
										<button
											class="item-icon-button"
											type="button"
											title="Edit status type"
											aria-label="Edit status type"
											onclick={() => startEditStatus(status)}
										>
											<PencilIcon size={16} strokeWidth={2} />
										</button>
										<button
											class="item-icon-button item-icon-button-danger"
											type="button"
											title="Delete status type"
											aria-label="Delete status type"
											onclick={() => (confirmDeleteStatus = status)}
										>
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
					{#if newAssignShortName.trim()}
						<Badge label={newAssignShortName.trim().toUpperCase()} color={newAssignColor} bold={true} />
					{/if}
					<button
						class="btn btn-primary btn-sm"
						onclick={addAssignType}
						disabled={!canMutate || !newAssignName.trim() || !newAssignShortName.trim()}>+ Add</button
					>
				</div>

				<p class="hint">
					Select which assignment type's assignee appears in each calendar date column.
					{#if headerTypeId}
						Currently showing: <strong>{dailyAssignmentsStore.types.find((t) => t.id === headerTypeId)?.name}</strong>
					{:else}
						None selected — no assignee shown in date columns.
					{/if}
				</p>

				<div class="item-list">
					{#each dailyAssignmentsStore.types as type (type.id)}
						<div class="item-row" in:fly={rowIn} out:fly={rowOut}>
							{#if editingAssign?.id === type.id}
								<div class="inline-edit">
									<input
										class="input"
										type="text"
										bind:value={editAssignName}
										placeholder="Full name"
										aria-label="Assignment full name"
									/>
									<input
										class="input short-input"
										type="text"
										bind:value={editAssignShortName}
										placeholder="Short"
										maxlength="5"
										aria-label="Assignment short name"
									/>
									<select class="select" bind:value={editAssignTo} aria-label="Assign to">
										<option value="personnel">Person</option>
										<option value="group">Group</option>
									</select>
									<label class="color-picker">
										<span>Color</span>
										<input type="color" bind:value={editAssignColor} />
									</label>
									<Badge label={editAssignShortName.trim().toUpperCase() || '?'} color={editAssignColor} bold={true} />
									<button
										class="btn btn-primary btn-sm"
										onclick={saveEditAssign}
										disabled={!canMutate || !editAssignName.trim() || !editAssignShortName.trim()}>Save</button
									>
									<button class="btn btn-sm" onclick={cancelEditAssign}>Cancel</button>
								</div>
							{:else}
								<label class="header-radio">
									<input
										type="radio"
										name="showInDateHeader"
										value={type.id}
										checked={headerTypeId === type.id}
										disabled={!canMutate}
										aria-label="Show {type.name} in date header"
										onchange={() => setShowInDateHeader(type.id)}
									/>
									<span class="radio-label-text">Date header</span>
								</label>
								<Badge label={type.shortName} color={type.color} bold={true} />
								<span class="item-name">{type.name}</span>
								<span class="item-meta">{type.assignTo === 'personnel' ? 'Person' : 'Group'}</span>
								<div class="item-actions">
									{#if canMutate}
										<button
											class="item-icon-button"
											type="button"
											title="Edit assignment type"
											aria-label="Edit assignment type"
											onclick={() => startEditAssign(type)}
										>
											<PencilIcon size={16} strokeWidth={2} />
										</button>
										<button
											class="item-icon-button item-icon-button-danger"
											type="button"
											title="Delete assignment type"
											aria-label="Delete assignment type"
											onclick={() => (confirmDeleteAssign = type)}
										>
											<Trash2Icon size={16} strokeWidth={2} />
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
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
					<div class="reset-block">
						<button class="btn btn-secondary btn-sm" onclick={() => (showResetConfirm = true)} disabled={!canMutate}>
							Reset Federal Holidays
						</button>
						<span class="reset-note">Preserves your custom closures</span>
					</div>
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
					<button
						class="btn btn-primary btn-sm"
						onclick={addSpecialDay}
						disabled={!canMutate || !newSpecialName.trim()}
					>
						+ Add
					</button>
				</div>

				<div class="item-list">
					{#each filteredDays as day (day.id)}
						<div class="item-row" in:fly={rowIn} out:fly={rowOut}>
							{#if editingSpecialDay?.id === day.id}
								<div class="inline-edit">
									<span class="day-date">{formatDisplayDate(day.date)}</span>
									<input
										class="input flexible-input"
										type="text"
										bind:value={editSpecialName}
										placeholder="Name"
										aria-label="Special day name"
									/>
									<select class="select type-select" bind:value={editSpecialType} aria-label="Type">
										<option value="org-closure">Closure</option>
										<option value="federal-holiday">Federal Holiday</option>
									</select>
									<button
										class="btn btn-primary btn-sm"
										onclick={saveEditSpecialDay}
										disabled={!canMutate || !editSpecialName.trim()}>Save</button
									>
									<button class="btn btn-sm" onclick={cancelEditSpecialDay}>Cancel</button>
								</div>
							{:else}
								<span class="day-date">{formatDisplayDate(day.date)}</span>
								<span class="item-name">{day.name}</span>
								<span class="day-type" class:holiday={day.type === 'federal-holiday'}>
									{day.type === 'federal-holiday' ? 'Holiday' : 'Closure'}
								</span>
								<div class="item-actions">
									{#if canMutate}
										<button
											class="item-icon-button"
											type="button"
											title="Edit special day"
											aria-label="Edit special day"
											onclick={() => startEditSpecialDay(day)}
										>
											<PencilIcon size={16} strokeWidth={2} />
										</button>
										<button
											class="item-icon-button item-icon-button-danger"
											type="button"
											title="Delete special day"
											aria-label="Delete special day"
											onclick={() => (confirmDeleteSpecial = day)}
										>
											<Trash2Icon size={16} strokeWidth={2} />
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<p class="empty-msg">
							No holidays or closures for {filterYear}. Use the form above to add a closure, or reset federal holidays
							to populate defaults.
						</p>
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
		padding: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}

	.settings-hero {
		padding: var(--sp-6) var(--sp-7);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
		box-shadow: var(--shadow-sm);
	}

	.hero-copy {
		max-width: 720px;
	}

	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.settings-hero h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3vw, 2.5rem);
		line-height: 1.1;
		color: var(--text-primary);
	}

	.hero-description {
		margin: var(--sp-3) 0 0;
		max-width: 62ch;
		font-size: var(--text-base);
		line-height: var(--line-height-copy);
		color: var(--text-secondary);
	}

	.hero-action {
		margin-top: var(--sp-4);
		display: inline-flex;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-5);
		align-items: start;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		min-height: 100%;
		padding: var(--sp-6);
	}

	.settings-section-wide {
		grid-column: 1 / -1;
	}

	.section-header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding-bottom: var(--sp-3);
		border-bottom: var(--border-thin);
	}

	.section-kicker {
		margin: 0 0 2px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 1.5vw, 1.35rem);
		font-weight: var(--font-weight-semibold);
		margin: 0;
		color: var(--text-primary);
	}

	.section-description {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
		line-height: var(--line-height-copy);
	}

	.item-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
	}

	.item-row {
		display: flex;
		align-items: center;
		align-content: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-panel) 94%, var(--surface-subtle) 6%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		min-height: 44px;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.item-row:hover {
		background: color-mix(in srgb, var(--surface-panel) 82%, var(--surface-subtle) 18%);
		border-color: color-mix(in srgb, var(--border-default) 84%, var(--ink-35) 16%);
	}

	.inline-edit {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
		width: 100%;
	}

	.inline-edit .input {
		flex: 1;
		min-width: 120px;
	}

	.item-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		flex: 1;
		min-width: 120px;
		color: var(--text-primary);
	}

	.item-meta {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.item-actions {
		display: flex;
		flex-wrap: wrap;
		row-gap: var(--sp-2);
		column-gap: max(var(--sp-4), 16px);
		margin-left: auto;
	}

	.item-icon-button {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-tertiary);
		position: relative;
		flex-shrink: 0;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	/* Expand hit area to 44px without inflating the visual button size */
	.item-icon-button::before {
		content: '';
		position: absolute;
		inset: -8px;
	}

	.item-icon-button:hover:not(:disabled) {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.item-icon-button-danger {
		color: var(--danger);
	}

	.item-icon-button-danger:hover:not(:disabled) {
		color: var(--danger);
	}

	.add-form {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
		border: 1px dashed color-mix(in srgb, var(--border-default) 88%, var(--ink-35) 12%);
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
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.color-picker input[type='color'] {
		width: 32px;
		height: 32px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
		background: var(--surface-panel);
	}

	.header-radio {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		cursor: pointer;
	}

	.header-radio input {
		accent-color: var(--amber);
	}

	.radio-label-text {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		white-space: nowrap;
		line-height: 1;
	}

	.hint {
		padding: var(--sp-3) var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 64%, var(--surface-panel) 36%);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	.filter-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
	}

	.filter-bar .label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.count {
		display: inline-flex;
		align-items: center;
		min-height: 22px;
		padding: 3px 8px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.day-date {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		min-width: 132px;
	}

	.day-type {
		display: inline-flex;
		align-items: center;
		min-height: 22px;
		padding: 3px 8px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.day-type.holiday {
		background: color-mix(in srgb, var(--color-holiday) 76%, var(--surface-panel) 24%);
		color: var(--text-primary);
	}

	.empty-msg {
		text-align: center;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		padding: var(--sp-4);
		margin: 0;
		border: 1px dashed var(--border-default);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 60%, var(--surface-panel) 40%);
	}

	.year-select {
		width: 100px;
	}

	.reset-block {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
		margin-left: auto;
	}

	.reset-note {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		white-space: nowrap;
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
			padding: var(--sp-4);
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
			padding: var(--sp-4);
		}

		.item-row {
			align-items: flex-start;
		}

		.item-actions {
			margin-left: 0;
			width: 100%;
		}

		.reset-block {
			margin-left: 0;
			align-items: flex-start;
			width: 100%;
		}

		.reset-block .btn {
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
