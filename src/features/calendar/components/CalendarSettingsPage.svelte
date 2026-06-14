<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import CalendarAssignmentSettingsSection from '$features/calendar/components/CalendarAssignmentSettingsSection.svelte';
	import CalendarClosureSettingsSection from '$features/calendar/components/CalendarClosureSettingsSection.svelte';
	import CalendarStatusSettingsSection from '$features/calendar/components/CalendarStatusSettingsSection.svelte';
	import CalendarOff from '@lucide/svelte/icons/calendar-off';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Palette from '@lucide/svelte/icons/palette';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import Users from '@lucide/svelte/icons/users';

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
	let statusSection = $state<CalendarStatusSettingsSection>();
	let assignmentSection = $state<CalendarAssignmentSettingsSection>();
	let closureSection = $state<CalendarClosureSettingsSection>();

	const activeAssignmentTypes = $derived(dailyAssignmentsStore.types.filter((type) => !type.archivedAt));

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
			getCount: () => activeAssignmentTypes.length
		},
		{
			key: 'closures' as Section,
			label: 'Closures',
			description: 'Holidays & special days',
			icon: CalendarOff,
			getCount: () => specialDaysStore.items.length
		}
	];

	const activeSectionDef = $derived(sectionDefs.find((s) => s.key === activeSection) ?? sectionDefs[0]);

	function openAddForActiveSection() {
		if (activeSection === 'status') {
			statusSection?.openAddDialog();
			return;
		}
		if (activeSection === 'assignments') {
			assignmentSection?.openAddDialog();
			return;
		}
		closureSection?.openAddDialog();
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

		<main class="flex flex-1 flex-col overflow-hidden">
			<div class="flex items-center justify-between border-b border-border px-6 py-4">
				<div>
					<h3 class="text-base font-semibold">{activeSectionDef.label}</h3>
					<p class="text-sm text-muted-foreground">{activeSectionDef.description}</p>
				</div>
				<div class="flex items-center gap-2">
					<div class="relative">
						<Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input type="text" placeholder="Filter..." class="h-8 w-48 pl-8 text-sm" bind:value={searchQuery} />
					</div>
					{#if canMutate}
						<Button size="sm" class="gap-1.5" onclick={openAddForActiveSection}>
							<Plus class="size-3.5" />
							Add new
						</Button>
					{/if}
				</div>
			</div>

			<div class="flex-1 overflow-y-auto p-6">
				{#if activeSection === 'status'}
					<CalendarStatusSettingsSection bind:this={statusSection} {canMutate} {searchQuery} />
				{:else if activeSection === 'assignments'}
					<CalendarAssignmentSettingsSection bind:this={assignmentSection} {canMutate} {searchQuery} />
				{:else if activeSection === 'closures'}
					<CalendarClosureSettingsSection bind:this={closureSection} {canMutate} {searchQuery} />
				{/if}
			</div>
		</main>
	</div>
{/if}
