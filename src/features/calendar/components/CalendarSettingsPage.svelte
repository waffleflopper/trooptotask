<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import {
		DA6_AVAILABILITY_TREATMENT_OPTIONS,
		DA6_TREATMENT_NONE,
		formatDa6AvailabilityTreatment,
		toDa6AvailabilityTreatment,
		type Da6AvailabilityTreatmentOption
	} from '$features/calendar/utils/da6AvailabilityTreatment';
	import { formatDate } from '$lib/utils/dates';
	import type { StatusType, AssignmentType, SpecialDay } from '$lib/types';
	import Settings from '@lucide/svelte/icons/settings';
	import Palette from '@lucide/svelte/icons/palette';
	import Users from '@lucide/svelte/icons/users';
	import CalendarOff from '@lucide/svelte/icons/calendar-off';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const org = getOrgContext();
	const orgUrlSegment = $derived(org.orgUrlSegment ?? org.orgId);
	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureStatusTypes)
	);
	const canManageConfig = $derived(configureAffordance.visible);
	const canMutate = $derived(configureAffordance.allowed);

	type Section = 'status' | 'assignments' | 'closures';
	let activeSection = $state<Section>('status');
	let searchQuery = $state('');

	const sectionDefs = [
		{
			key: 'status' as Section,
			label: 'Status Types',
			description: 'Personnel availability statuses',
			icon: Palette,
			getCount: () => statusTypesStore.items.length
		},
		{
			key: 'assignments' as Section,
			label: 'Assignment Types',
			description: 'Duty coverage assignments',
			icon: Users,
			getCount: () => dailyAssignmentsStore.types.length
		},
		{
			key: 'closures' as Section,
			label: 'Closures',
			description: 'Holidays & special days',
			icon: CalendarOff,
			getCount: () => specialDaysStore.items.length
		}
	];

	// ---- Status Types ----
	let addStatusOpen = $state(false);
	let newStatusName = $state('');
	let newStatusColor = $state('#4a4a47');
	let newStatusTextColor = $state('#f8f7f4');
	let newStatusDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);

	let editStatusOpen = $state(false);
	let editingStatus = $state<StatusType | null>(null);
	let editStatusName = $state('');
	let editStatusColor = $state('');
	let editStatusTextColor = $state('');
	let editStatusDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);

	let confirmDeleteStatus = $state<StatusType | null>(null);
	const addStatusDirty = $derived(
		newStatusName.trim() !== '' ||
			newStatusColor !== '#4a4a47' ||
			newStatusTextColor !== '#f8f7f4' ||
			newStatusDa6Treatment !== DA6_TREATMENT_NONE
	);
	const editStatusDirty = $derived(
		Boolean(
			editingStatus &&
			(editStatusName !== editingStatus.name ||
				editStatusColor !== editingStatus.color ||
				editStatusTextColor !== editingStatus.textColor ||
				editStatusDa6Treatment !== (editingStatus.da6AvailabilityTreatment ?? DA6_TREATMENT_NONE))
		)
	);

	function resetAddStatusForm() {
		newStatusName = '';
		newStatusColor = '#4a4a47';
		newStatusTextColor = '#f8f7f4';
		newStatusDa6Treatment = DA6_TREATMENT_NONE;
	}

	function closeAddStatusDialog() {
		resetAddStatusForm();
		addStatusOpen = false;
	}

	function closeEditStatusDialog() {
		editStatusOpen = false;
		editingStatus = null;
	}

	function openEditStatus(s: StatusType) {
		editingStatus = s;
		editStatusName = s.name;
		editStatusColor = s.color;
		editStatusTextColor = s.textColor;
		editStatusDa6Treatment = s.da6AvailabilityTreatment ?? DA6_TREATMENT_NONE;
		editStatusOpen = true;
	}

	async function addStatus() {
		if (!canMutate || !newStatusName.trim()) return;
		await statusTypesStore.add({
			name: newStatusName.trim(),
			color: newStatusColor,
			textColor: newStatusTextColor,
			da6AvailabilityTreatment: toDa6AvailabilityTreatment(newStatusDa6Treatment),
			da6TreatmentReviewed: true
		});
		resetAddStatusForm();
		addStatusOpen = false;
	}

	async function saveEditStatus() {
		if (!editingStatus || !editStatusName.trim()) return;
		await statusTypesStore.update(editingStatus.id, {
			name: editStatusName.trim(),
			color: editStatusColor,
			textColor: editStatusTextColor,
			da6AvailabilityTreatment: toDa6AvailabilityTreatment(editStatusDa6Treatment),
			da6TreatmentReviewed: true
		});
		editStatusOpen = false;
		editingStatus = null;
	}

	async function deleteStatus(s: StatusType) {
		if (!canMutate) return;
		await statusTypesStore.remove(s.id);
		availabilityStore.removeByStatusTypeLocal(s.id);
		confirmDeleteStatus = null;
	}

	async function markStatusDa6Reviewed(status: StatusType) {
		if (!canMutate) return;
		await statusTypesStore.update(status.id, {
			da6AvailabilityTreatment: null,
			da6TreatmentReviewed: true
		});
	}

	const statusTypesMissingDa6Treatment = $derived(
		statusTypesStore.items.filter((status) => !status.da6AvailabilityTreatment && !status.da6TreatmentReviewed)
	);

	// ---- Assignment Types ----
	let addAssignmentOpen = $state(false);
	let newAssignName = $state('');
	let newAssignShortName = $state('');
	let newAssignTo = $state<'personnel' | 'group'>('personnel');
	let newAssignColor = $state('#c47f00');

	let editAssignmentOpen = $state(false);
	let editingAssign = $state<AssignmentType | null>(null);
	let editAssignName = $state('');
	let editAssignShortName = $state('');
	let editAssignTo = $state<'personnel' | 'group'>('personnel');
	let editAssignColor = $state('');

	let confirmDeleteAssign = $state<AssignmentType | null>(null);

	const headerTypeId = $derived(dailyAssignmentsStore.types.find((t) => t.showInDateHeader)?.id ?? null);
	const addAssignmentDirty = $derived(
		newAssignName.trim() !== '' ||
			newAssignShortName.trim() !== '' ||
			newAssignTo !== 'personnel' ||
			newAssignColor !== '#c47f00'
	);
	const editAssignmentDirty = $derived(
		Boolean(
			editingAssign &&
			(editAssignName !== editingAssign.name ||
				editAssignShortName !== editingAssign.shortName ||
				editAssignTo !== editingAssign.assignTo ||
				editAssignColor !== editingAssign.color)
		)
	);

	function resetAddAssignForm() {
		newAssignName = '';
		newAssignShortName = '';
		newAssignTo = 'personnel';
		newAssignColor = '#c47f00';
	}

	function closeAddAssignmentDialog() {
		resetAddAssignForm();
		addAssignmentOpen = false;
	}

	function closeEditAssignmentDialog() {
		editAssignmentOpen = false;
		editingAssign = null;
	}

	function openEditAssign(t: AssignmentType) {
		editingAssign = t;
		editAssignName = t.name;
		editAssignShortName = t.shortName;
		editAssignTo = t.assignTo;
		editAssignColor = t.color;
		editAssignmentOpen = true;
	}

	async function addAssignType() {
		if (!canMutate || !newAssignName.trim() || !newAssignShortName.trim()) return;
		await dailyAssignmentsStore.addType({
			name: newAssignName.trim(),
			shortName: newAssignShortName.trim().toUpperCase(),
			assignTo: newAssignTo,
			color: newAssignColor,
			exemptPersonnelIds: [],
			showInDateHeader: false
		});
		resetAddAssignForm();
		addAssignmentOpen = false;
	}

	async function saveEditAssign() {
		if (!editingAssign || !editAssignName.trim() || !editAssignShortName.trim()) return;
		await dailyAssignmentsStore.updateType(editingAssign.id, {
			name: editAssignName.trim(),
			shortName: editAssignShortName.trim().toUpperCase(),
			assignTo: editAssignTo,
			color: editAssignColor
		});
		editAssignmentOpen = false;
		editingAssign = null;
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
	let addClosureOpen = $state(false);
	let newSpecialDate = $state(formatDate(new Date()));
	let newSpecialName = $state('');
	let newSpecialType = $state<'federal-holiday' | 'org-closure'>('org-closure');

	let editClosureOpen = $state(false);
	let editingSpecialDay = $state<SpecialDay | null>(null);
	let editSpecialName = $state('');
	let editSpecialType = $state<'federal-holiday' | 'org-closure'>('org-closure');

	let confirmDeleteSpecial = $state<SpecialDay | null>(null);
	let showResetConfirm = $state(false);
	let filterYear = $state(String(new Date().getFullYear()));
	const addClosureDirty = $derived(
		newSpecialDate !== formatDate(new Date()) || newSpecialName.trim() !== '' || newSpecialType !== 'org-closure'
	);
	const editClosureDirty = $derived(
		Boolean(
			editingSpecialDay && (editSpecialName !== editingSpecialDay.name || editSpecialType !== editingSpecialDay.type)
		)
	);

	const yearOptions = $derived.by(() => {
		const y = new Date().getFullYear();
		return [y - 1, y, y + 1, y + 2].map(String);
	});

	const filteredDays = $derived(
		specialDaysStore.items
			.filter((d) => d.date.startsWith(`${filterYear}-`))
			.sort((a, b) => a.date.localeCompare(b.date))
	);

	function resetAddClosureForm() {
		newSpecialDate = formatDate(new Date());
		newSpecialName = '';
		newSpecialType = 'org-closure';
	}

	function closeAddClosureDialog() {
		resetAddClosureForm();
		addClosureOpen = false;
	}

	function closeEditClosureDialog() {
		editClosureOpen = false;
		editingSpecialDay = null;
	}

	function openEditSpecialDay(d: SpecialDay) {
		editingSpecialDay = d;
		editSpecialName = d.name;
		editSpecialType = d.type;
		editClosureOpen = true;
	}

	async function addSpecialDay() {
		if (!canMutate || !newSpecialDate || !newSpecialName.trim()) return;
		await specialDaysStore.add({ date: newSpecialDate, name: newSpecialName.trim(), type: newSpecialType });
		resetAddClosureForm();
		addClosureOpen = false;
	}

	async function saveEditSpecialDay() {
		if (!editingSpecialDay || !editSpecialName.trim()) return;
		const updated = await specialDaysStore.update(editingSpecialDay.id, {
			name: editSpecialName.trim(),
			type: editSpecialType
		});
		if (updated) {
			editClosureOpen = false;
			editingSpecialDay = null;
		}
	}

	async function deleteSpecialDay(d: SpecialDay) {
		if (!canMutate) return;
		await specialDaysStore.remove(d.id);
		confirmDeleteSpecial = null;
	}

	// ---- Filtering ----
	const filteredStatuses = $derived(
		statusTypesStore.items.filter((s) => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	const filteredAssignments = $derived(
		dailyAssignmentsStore.types.filter((t) => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	const filteredClosures = $derived(
		filteredDays.filter((d) => !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	function formatDisplayDate(dateStr: string): string {
		return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function handleNewDa6TreatmentChange(event: Event) {
		newStatusDa6Treatment = (event.currentTarget as HTMLSelectElement).value as Da6AvailabilityTreatmentOption;
	}

	function handleEditDa6TreatmentChange(event: Event) {
		editStatusDa6Treatment = (event.currentTarget as HTMLSelectElement).value as Da6AvailabilityTreatmentOption;
	}

	function handleFilterYearChange(event: Event) {
		const selectedYear = (event.currentTarget as HTMLSelectElement).value;
		if (yearOptions.includes(selectedYear)) {
			filterYear = selectedYear;
		}
	}
</script>

{#if !canManageConfig}
	<div class="mx-auto max-w-3xl px-6 py-12">
		<p class="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Calendar configuration
		</p>
		<h1 class="mb-3 text-2xl font-semibold tracking-tight">Access restricted.</h1>
		<p class="mb-4 text-sm text-muted-foreground">
			You can view the calendar, but only organization admins and full editors can manage calendar settings.
		</p>
		<Button href={`/org/${orgUrlSegment}/calendar`} size="sm">View calendar</Button>
	</div>
{:else}
	<div class="flex min-h-[600px] overflow-hidden rounded-md border border-border bg-background">
		<!-- Sidebar -->
		<aside class="flex w-[260px] shrink-0 flex-col border-r border-border bg-muted/30">
			<div class="flex items-center gap-2 border-b border-border px-5 py-4">
				<Settings class="size-4 text-muted-foreground" />
				<h2 class="text-sm font-semibold tracking-tight">Calendar Settings</h2>
			</div>

			<nav class="flex flex-1 flex-col gap-0.5 p-2" aria-label="Calendar settings controls">
				{#each sectionDefs as section (section.key)}
					<button
						class="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors {activeSection ===
						section.key
							? 'bg-background shadow-sm'
							: 'hover:bg-background/60'}"
						onclick={() => (activeSection = section.key)}
					>
						<section.icon
							class="size-4 {activeSection === section.key ? 'text-foreground' : 'text-muted-foreground'}"
						/>
						<div class="flex flex-1 flex-col">
							<span
								class="text-sm font-medium {activeSection === section.key
									? 'text-foreground'
									: 'text-muted-foreground'}"
							>
								{section.label}
							</span>
							<span class="text-[11px] text-muted-foreground">{section.description}</span>
						</div>
						<Badge variant="secondary" class="ml-auto text-[10px]">{section.getCount()}</Badge>
						{#if activeSection === section.key}
							<ChevronRight class="size-3.5 text-muted-foreground" />
						{/if}
					</button>
				{/each}
			</nav>

			<div class="border-t border-border px-4 py-3">
				<Button variant="outline" size="sm" class="w-full" href={`/org/${orgUrlSegment}/calendar`}>
					Back to Calendar
				</Button>
			</div>
		</aside>

		<!-- Detail Panel -->
		<main class="flex flex-1 flex-col overflow-hidden">
			<!-- Detail header -->
			<div class="flex items-center justify-between border-b border-border px-6 py-4">
				<div>
					<h3 class="text-base font-semibold">
						{sectionDefs.find((s) => s.key === activeSection)?.label}
					</h3>
					<p class="text-sm text-muted-foreground">
						{sectionDefs.find((s) => s.key === activeSection)?.description}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<div class="relative">
						<Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input type="text" placeholder="Filter..." class="h-8 w-48 pl-8 text-sm" bind:value={searchQuery} />
					</div>
					{#if canMutate}
						{#if activeSection === 'status'}
							<Button size="sm" class="gap-1.5" onclick={() => (addStatusOpen = true)}>
								<Plus class="size-3.5" />
								Add new
							</Button>
						{:else if activeSection === 'assignments'}
							<Button size="sm" class="gap-1.5" onclick={() => (addAssignmentOpen = true)}>
								<Plus class="size-3.5" />
								Add new
							</Button>
						{:else if activeSection === 'closures'}
							<Button size="sm" class="gap-1.5" onclick={() => (addClosureOpen = true)}>
								<Plus class="size-3.5" />
								Add new
							</Button>
						{/if}
					{/if}
				</div>
			</div>

			<!-- Detail content -->
			<div class="flex-1 overflow-y-auto p-6">
				<!-- ===== STATUS TYPES ===== -->
				{#if activeSection === 'status'}
					{#if statusTypesMissingDa6Treatment.length > 0}
						<section
							class="mb-4 rounded-md border border-border bg-amber-50 p-4 dark:bg-amber-950/20"
							aria-label="DA6 treatment review"
						>
							<div class="mb-1 flex items-center gap-2">
								<Badge variant="outline" class="font-mono text-[10px]">DA6</Badge>
								<h4 class="text-sm font-semibold">Confirm statuses with no DA6 effect</h4>
							</div>
							<p class="mb-3 text-xs text-muted-foreground">
								These status types are excluded from DA Form 6 rosters unless you edit them and assign a duty roster
								treatment.
							</p>
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-mono text-[10px] font-semibold text-muted-foreground">
									{statusTypesMissingDa6Treatment.length === 1
										? '1 needs review'
										: `${statusTypesMissingDa6Treatment.length} need review`}
								</span>
								{#each statusTypesMissingDa6Treatment as status (status.id)}
									<span
										class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium"
									>
										{status.name}
										{#if canMutate}
											<button
												class="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
												type="button"
												aria-label={`Confirm ${status.name} has no DA6 effect`}
												onclick={() => markStatusDa6Reviewed(status)}
											>
												No effect
											</button>
										{/if}
									</span>
								{/each}
							</div>
						</section>
					{/if}

					<div class="space-y-1.5">
						{#each filteredStatuses as status (status.id)}
							<div
								class="flex items-center gap-4 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
							>
								<div class="flex flex-1 flex-col gap-0.5">
									<span class="text-sm font-medium">{status.name}</span>
									<span class="text-xs text-muted-foreground">
										{formatDa6AvailabilityTreatment(status.da6AvailabilityTreatment)}
									</span>
								</div>
								<CalendarStatusBadge statusType={status}>{status.name}</CalendarStatusBadge>
								{#if canMutate}
									<div class="flex gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											class="size-7"
											title="Edit status type"
											aria-label="Edit status type"
											onclick={() => openEditStatus(status)}
										>
											<Pencil class="size-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											class="size-7 text-destructive hover:text-destructive"
											title="Delete status type"
											aria-label="Delete status type"
											onclick={() => (confirmDeleteStatus = status)}
										>
											<Trash2 class="size-3.5" />
										</Button>
									</div>
								{/if}
							</div>
						{:else}
							<div class="flex items-center justify-center py-12 text-sm text-muted-foreground">
								No status types found
							</div>
						{/each}
					</div>

					<!-- ===== ASSIGNMENT TYPES ===== -->
				{:else if activeSection === 'assignments'}
					<p class="mb-4 rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
						Select which assignment type's assignee appears in each calendar date column.
						{#if headerTypeId}
							Currently showing: <strong>{dailyAssignmentsStore.types.find((t) => t.id === headerTypeId)?.name}</strong>
						{:else}
							None selected — no assignee shown in date columns.
						{/if}
					</p>

					<div class="space-y-1.5">
						{#each filteredAssignments as type (type.id)}
							<div
								class="flex items-center gap-4 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
							>
								{#if canMutate}
									<label class="flex flex-col items-center gap-0.5">
										<input
											type="radio"
											name="showInDateHeader"
											value={type.id}
											checked={headerTypeId === type.id}
											class="accent-amber-500"
											aria-label="Show {type.name} in date header"
											onchange={() => setShowInDateHeader(type.id)}
										/>
										<span class="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
											Header
										</span>
									</label>
								{/if}
								<div class="flex flex-1 flex-col gap-0.5">
									<span class="text-sm font-medium">{type.name}</span>
									<span class="text-xs text-muted-foreground">
										{type.assignTo === 'personnel' ? 'Assigned to person' : 'Assigned to group'}
									</span>
								</div>
								{#if type.showInDateHeader}
									<Badge variant="outline" class="text-[10px]">Date header</Badge>
								{/if}
								<CalendarStatusBadge
									statusType={{ id: type.id, name: type.shortName, color: type.color, textColor: '#ffffff' }}
									class="font-mono font-bold uppercase tracking-widest"
								>
									{type.shortName}
								</CalendarStatusBadge>
								{#if canMutate}
									<div class="flex gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											class="size-7"
											title="Edit assignment type"
											aria-label="Edit assignment type"
											onclick={() => openEditAssign(type)}
										>
											<Pencil class="size-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											class="size-7 text-destructive hover:text-destructive"
											title="Delete assignment type"
											aria-label="Delete assignment type"
											onclick={() => (confirmDeleteAssign = type)}
										>
											<Trash2 class="size-3.5" />
										</Button>
									</div>
								{/if}
							</div>
						{:else}
							<div class="flex items-center justify-center py-12 text-sm text-muted-foreground">
								No assignment types found
							</div>
						{/each}
					</div>

					<!-- ===== CLOSURES ===== -->
				{:else if activeSection === 'closures'}
					<div class="mb-4 flex flex-wrap items-center gap-3">
						<Label
							for="calendar-settings-filter-year"
							class="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
						>
							Year
						</Label>
						<NativeSelect
							id="calendar-settings-filter-year"
							class="w-[6.5rem]"
							value={filterYear}
							onchange={handleFilterYearChange}
						>
							{#each yearOptions as year (year)}
								<option value={year}>{year}</option>
							{/each}
						</NativeSelect>
						<Badge variant="secondary" class="font-mono text-[10px]">{filteredClosures.length} days</Badge>
						{#if canMutate}
							<div class="ml-auto flex flex-col items-end gap-0.5">
								<Button variant="outline" size="sm" onclick={() => (showResetConfirm = true)}>
									Reset Federal Holidays
								</Button>
								<span class="font-mono text-[10px] text-muted-foreground">Preserves custom closures</span>
							</div>
						{/if}
					</div>

					<div class="space-y-1.5">
						{#each filteredClosures as day (day.id)}
							<div
								class="flex items-center gap-4 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
							>
								<div class="w-28 shrink-0">
									<span class="text-sm tabular-nums text-muted-foreground">
										{formatDisplayDate(day.date)}
									</span>
								</div>
								<span class="flex-1 text-sm font-medium">{day.name}</span>
								<Badge variant={day.type === 'federal-holiday' ? 'default' : 'outline'} class="text-[10px]">
									{day.type === 'federal-holiday' ? 'Holiday' : 'Closure'}
								</Badge>
								{#if canMutate}
									<div class="flex gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											class="size-7"
											title="Edit closure"
											aria-label="Edit closure"
											onclick={() => openEditSpecialDay(day)}
										>
											<Pencil class="size-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											class="size-7 text-destructive hover:text-destructive"
											title="Delete closure"
											aria-label="Delete closure"
											onclick={() => (confirmDeleteSpecial = day)}
										>
											<Trash2 class="size-3.5" />
										</Button>
									</div>
								{/if}
							</div>
						{:else}
							<div
								class="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"
							>
								No holidays or closures for {filterYear}. Add a closure or reset federal holidays to populate defaults.
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</main>
	</div>
{/if}

<!-- ===== ADD STATUS TYPE DIALOG ===== -->
<AppDialog.Root bind:open={addStatusOpen} closeBlocked={addStatusDirty} onClose={closeAddStatusDialog}>
	<AppDialog.Content class="sm:max-w-md" closeBlocked={addStatusDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Add Status Type</AppDialog.Title>
			<AppDialog.Description>Create a new personnel availability status for the calendar.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="add-status-name">Status name</Label>
				<Input id="add-status-name" type="text" placeholder="e.g., Leave, TDY, School" bind:value={newStatusName} />
			</div>
			<div class="flex flex-wrap items-end gap-4">
				<div class="grid gap-2">
					<Label for="add-status-bg">Background</Label>
					<input
						id="add-status-bg"
						type="color"
						bind:value={newStatusColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="add-status-text">Text</Label>
					<input
						id="add-status-text"
						type="color"
						bind:value={newStatusTextColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if newStatusName.trim()}
					<div class="min-w-0 flex-1">
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'preview',
									name: newStatusName,
									color: newStatusColor,
									textColor: newStatusTextColor
								}}
							>
								{newStatusName}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="add-status-da6">Duty roster treatment</Label>
				<NativeSelect
					id="add-status-da6"
					value={newStatusDa6Treatment}
					onchange={handleNewDa6TreatmentChange}
					class="w-full min-w-0"
				>
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</NativeSelect>
				{#if newStatusDa6Treatment === 'authorized-absence'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count pauses during absence.</p>
				{:else if newStatusDa6Treatment === 'other-duty'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count continues while on duty.</p>
				{/if}
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddStatusDialog}>Cancel</Button>
			<Button onclick={addStatus} disabled={!newStatusName.trim()}>Add Status Type</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<!-- ===== EDIT STATUS TYPE DIALOG ===== -->
<AppDialog.Root bind:open={editStatusOpen} closeBlocked={editStatusDirty} onClose={closeEditStatusDialog}>
	<AppDialog.Content class="sm:max-w-md" closeBlocked={editStatusDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Edit Status Type</AppDialog.Title>
			<AppDialog.Description>Update this personnel availability status.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-status-name">Status name</Label>
				<Input id="edit-status-name" type="text" bind:value={editStatusName} />
			</div>
			<div class="flex flex-wrap items-end gap-4">
				<div class="grid gap-2">
					<Label for="edit-status-bg">Background</Label>
					<input
						id="edit-status-bg"
						type="color"
						bind:value={editStatusColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="edit-status-text">Text</Label>
					<input
						id="edit-status-text"
						type="color"
						bind:value={editStatusTextColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if editStatusName.trim()}
					<div class="min-w-0 flex-1">
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'edit-preview',
									name: editStatusName,
									color: editStatusColor,
									textColor: editStatusTextColor
								}}
							>
								{editStatusName}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="edit-status-da6">Duty roster treatment</Label>
				<NativeSelect
					id="edit-status-da6"
					value={editStatusDa6Treatment}
					onchange={handleEditDa6TreatmentChange}
					class="w-full min-w-0"
				>
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</NativeSelect>
				{#if editStatusDa6Treatment === 'authorized-absence'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count pauses during absence.</p>
				{:else if editStatusDa6Treatment === 'other-duty'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count continues while on duty.</p>
				{/if}
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditStatusDialog}>Cancel</Button>
			<Button onclick={saveEditStatus} disabled={!editStatusName.trim()}>Save Changes</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<!-- ===== ADD ASSIGNMENT TYPE DIALOG ===== -->
<AppDialog.Root bind:open={addAssignmentOpen} closeBlocked={addAssignmentDirty} onClose={closeAddAssignmentDialog}>
	<AppDialog.Content closeBlocked={addAssignmentDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Add Assignment Type</AppDialog.Title>
			<AppDialog.Description>Create a new duty coverage assignment for daily scheduling.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="add-assign-name">Full name</Label>
				<Input id="add-assign-name" type="text" placeholder="e.g., Staff Duty" bind:value={newAssignName} />
			</div>
			<div class="flex items-end gap-4">
				<div class="grid flex-1 gap-2">
					<Label for="add-assign-short">Short code</Label>
					<Input
						id="add-assign-short"
						type="text"
						placeholder="e.g., SD"
						maxlength={5}
						class="uppercase"
						bind:value={newAssignShortName}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="add-assign-color">Color</Label>
					<input
						id="add-assign-color"
						type="color"
						bind:value={newAssignColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if newAssignShortName.trim()}
					<div>
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'assign-preview',
									name: newAssignShortName.trim().toUpperCase(),
									color: newAssignColor,
									textColor: '#ffffff'
								}}
								class="font-mono font-bold uppercase tracking-widest"
							>
								{newAssignShortName.trim().toUpperCase()}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="add-assign-to">Assign to</Label>
				<NativeSelect id="add-assign-to" bind:value={newAssignTo}>
					<option value="personnel">Person</option>
					<option value="group">Group</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddAssignmentDialog}>Cancel</Button>
			<Button onclick={addAssignType} disabled={!newAssignName.trim() || !newAssignShortName.trim()}>
				Add Assignment Type
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<!-- ===== EDIT ASSIGNMENT TYPE DIALOG ===== -->
<AppDialog.Root bind:open={editAssignmentOpen} closeBlocked={editAssignmentDirty} onClose={closeEditAssignmentDialog}>
	<AppDialog.Content closeBlocked={editAssignmentDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Edit Assignment Type</AppDialog.Title>
			<AppDialog.Description>Update this duty coverage assignment.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-assign-name">Full name</Label>
				<Input id="edit-assign-name" type="text" bind:value={editAssignName} />
			</div>
			<div class="flex items-end gap-4">
				<div class="grid flex-1 gap-2">
					<Label for="edit-assign-short">Short code</Label>
					<Input id="edit-assign-short" type="text" maxlength={5} class="uppercase" bind:value={editAssignShortName} />
				</div>
				<div class="grid gap-2">
					<Label for="edit-assign-color">Color</Label>
					<input
						id="edit-assign-color"
						type="color"
						bind:value={editAssignColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if editAssignShortName.trim()}
					<div>
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'edit-assign-preview',
									name: editAssignShortName.trim().toUpperCase(),
									color: editAssignColor,
									textColor: '#ffffff'
								}}
								class="font-mono font-bold uppercase tracking-widest"
							>
								{editAssignShortName.trim().toUpperCase()}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="edit-assign-to">Assign to</Label>
				<NativeSelect id="edit-assign-to" bind:value={editAssignTo}>
					<option value="personnel">Person</option>
					<option value="group">Group</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditAssignmentDialog}>Cancel</Button>
			<Button onclick={saveEditAssign} disabled={!editAssignName.trim() || !editAssignShortName.trim()}>
				Save Changes
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<!-- ===== ADD CLOSURE DIALOG ===== -->
<AppDialog.Root bind:open={addClosureOpen} closeBlocked={addClosureDirty} onClose={closeAddClosureDialog}>
	<AppDialog.Content closeBlocked={addClosureDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Add Closure</AppDialog.Title>
			<AppDialog.Description>Mark a federal holiday or unit closure on the calendar.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="add-closure-date">Date</Label>
				<DatePicker bind:value={newSpecialDate} placeholder="Select date" />
			</div>
			<div class="grid gap-2">
				<Label for="add-closure-name">Name</Label>
				<Input
					id="add-closure-name"
					type="text"
					placeholder="e.g., Training Day, Independence Day"
					bind:value={newSpecialName}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="add-closure-type">Type</Label>
				<NativeSelect id="add-closure-type" bind:value={newSpecialType}>
					<option value="org-closure">Closure</option>
					<option value="federal-holiday">Federal Holiday</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddClosureDialog}>Cancel</Button>
			<Button onclick={addSpecialDay} disabled={!newSpecialName.trim()}>Add Closure</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<!-- ===== EDIT CLOSURE DIALOG ===== -->
<AppDialog.Root bind:open={editClosureOpen} closeBlocked={editClosureDirty} onClose={closeEditClosureDialog}>
	<AppDialog.Content closeBlocked={editClosureDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Edit Closure</AppDialog.Title>
			<AppDialog.Description>
				{#if editingSpecialDay}
					{formatDisplayDate(editingSpecialDay.date)}
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-closure-name">Name</Label>
				<Input id="edit-closure-name" type="text" bind:value={editSpecialName} />
			</div>
			<div class="grid gap-2">
				<Label for="edit-closure-type">Type</Label>
				<NativeSelect id="edit-closure-type" bind:value={editSpecialType}>
					<option value="org-closure">Closure</option>
					<option value="federal-holiday">Federal Holiday</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditClosureDialog}>Cancel</Button>
			<Button onclick={saveEditSpecialDay} disabled={!editSpecialName.trim()}>Save Changes</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<!-- ===== CONFIRM DIALOGS ===== -->
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
