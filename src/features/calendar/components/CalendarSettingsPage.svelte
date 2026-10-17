<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import type { CalendarSettingsPageAccess } from '../contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import CalendarAssignmentSettingsSection from '$features/calendar/components/CalendarAssignmentSettingsSection.svelte';
	import CalendarClosureSettingsSection from '$features/calendar/components/CalendarClosureSettingsSection.svelte';
	import CalendarStatusSettingsSection from '$features/calendar/components/CalendarStatusSettingsSection.svelte';
	import CalendarOff from '@lucide/svelte/icons/calendar-off';
	import Palette from '@lucide/svelte/icons/palette';
	import Settings from '@lucide/svelte/icons/settings';
	import Users from '@lucide/svelte/icons/users';

	let { org }: { org: CalendarSettingsPageAccess } = $props();
	const orgUrlSegment = $derived(org.orgUrlSegment);
	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureStatusTypes)
	);
	const canManageConfig = $derived(configureAffordance.visible);
	const canMutate = $derived(configureAffordance.allowed);

	let activeSection = $state<string>('status');
	let searchQuery = $state('');
	let statusSection = $state<CalendarStatusSettingsSection>();
	let assignmentSection = $state<CalendarAssignmentSettingsSection>();
	let closureSection = $state<CalendarClosureSettingsSection>();

	const activeAssignmentTypes = $derived(dailyAssignmentsStore.types.filter((type) => !type.archivedAt));

	const sectionDefs = [
		{
			key: 'status',
			label: 'Status Types',
			description: "Set each status's name, color and one-day label, and drag to set the legend and picker order.",
			icon: Palette,
			getCount: () => statusTypesStore.items.length
		},
		{
			key: 'assignments',
			label: 'Assignment Types',
			description:
				'Daily duties you fill in the duty planner. Choose which ones appear as lanes under the dates on the calendar, and in what order.',
			icon: Users,
			getCount: () => activeAssignmentTypes.length
		},
		{
			key: 'closures',
			label: 'Holidays & closures',
			description:
				'Federal holidays and unit closures such as DONSAs. They shade the date column and appear by name in the Days lane.',
			addLabel: 'New closure',
			icon: CalendarOff,
			getCount: () => specialDaysStore.items.length
		}
	];

	const toolbarItems = $derived<ToolbarItem[]>([
		{ kind: 'action', id: 'back-to-calendar', label: 'Back to Calendar', href: `/org/${orgUrlSegment}/calendar` }
	]);

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
	<Tabs.Root
		bind:value={activeSection}
		orientation="vertical"
		class="min-h-[600px] flex-col gap-0 overflow-hidden rounded-md border border-border bg-background lg:flex-row"
	>
		<aside
			class="flex w-full shrink-0 flex-col border-b border-border bg-muted/30 lg:w-[260px] lg:border-r lg:border-b-0"
		>
			<div class="flex items-center gap-2 border-b border-border px-5 py-4">
				<Settings class="size-4 text-muted-foreground" />
				<h2 class="text-sm font-semibold tracking-tight">Calendar Settings</h2>
			</div>

			<div class="flex-1 p-2">
				<Tabs.List aria-label="Calendar settings sections" class="w-full">
					{#each sectionDefs as section (section.key)}
						<Tabs.Trigger value={section.key}>
							<section.icon />
							{section.label}
							<Badge variant="secondary" class="ml-auto">{section.getCount()}</Badge>
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</div>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
			<div class="flex flex-col gap-3 border-b border-border px-6 py-4">
				<div>
					<h3 class="text-base font-semibold">{activeSectionDef.label}</h3>
					<p class="text-sm text-muted-foreground">{activeSectionDef.description}</p>
				</div>
				<WorkspaceToolbar
					ariaLabel="Calendar settings controls"
					items={toolbarItems}
					search={{
						label: `Filter ${activeSectionDef.label}`,
						placeholder: 'Filter...',
						value: searchQuery,
						onValueChange: (value) => (searchQuery = value)
					}}
					primary={canMutate
						? {
								kind: 'action',
								id: 'add-new',
								label: activeSectionDef.addLabel ?? 'Add new',
								icon: 'plus',
								onclick: openAddForActiveSection
							}
						: undefined}
				/>
			</div>

			<Tabs.Content value="status" class="overflow-y-auto p-6">
				{#if activeSection === 'status'}
					<CalendarStatusSettingsSection bind:this={statusSection} {canMutate} {searchQuery} />
				{/if}
			</Tabs.Content>
			<Tabs.Content value="assignments" class="overflow-y-auto p-6">
				{#if activeSection === 'assignments'}
					<CalendarAssignmentSettingsSection bind:this={assignmentSection} {canMutate} {searchQuery} />
				{/if}
			</Tabs.Content>
			<Tabs.Content value="closures" class="overflow-y-auto p-6">
				{#if activeSection === 'closures'}
					<CalendarClosureSettingsSection bind:this={closureSection} {canMutate} {searchQuery} />
				{/if}
			</Tabs.Content>
		</div>
	</Tabs.Root>
{/if}
