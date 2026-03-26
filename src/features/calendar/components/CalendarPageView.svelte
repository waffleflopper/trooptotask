<script lang="ts">
	import SettingsIcon from '$lib/components/ui/icons/SettingsIcon.svelte';
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import TodayBreakdownPanel from '$features/calendar/components/TodayBreakdownPanel.svelte';
	import Calendar from '$features/calendar/components/Calendar.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import StatusLegend from '$features/calendar/components/StatusLegend.svelte';
	import AvailabilityModal from '$features/calendar/components/AvailabilityModal.svelte';
	import DailyAssignmentModal from '$features/calendar/components/DailyAssignmentModal.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarPrefsStore } from '$features/calendar/stores/calendarPrefs.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';

	interface Props {
		ctx: CalendarPageContext;
		data: {
			orgId: string;
			orgName: string;
			permissions?: { canViewCalendar?: boolean; canEditCalendar?: boolean } | null;
		};
	}

	let { ctx, data }: Props = $props();
</script>

<svelte:head>
	<title>{data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Calendar" helpTopic="calendar">
		<button
			class="toolbar-toggle"
			class:active={ctx.highlightOnboarding}
			onclick={() => ctx.toggleHighlightOnboarding()}
			title={ctx.highlightOnboarding ? 'Hide onboarding highlighting' : 'Show onboarding highlighting'}
		>
			<span class="toggle-dot"></span>
			Onboarding
		</button>
		<button
			class="btn btn-sm"
			class:active={ctx.breakdownExpanded}
			data-testid="calendar-today-breakdown"
			onclick={() => ctx.toggleBreakdown()}
		>
			Today's Breakdown
		</button>
		{#if data.permissions?.canEditCalendar && ctx.canManageConfig}
			<a class="btn btn-sm" href={`/org/${data.orgId}/calendar/assignments`}> Assignments </a>
		{/if}
		{#if ctx.readOnly}
			<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
		{/if}
		{#if ctx.canManageConfig}
			<a
				href="/org/{data.orgId}/calendar/settings"
				class="btn btn-sm btn-icon"
				title="Calendar Settings"
				aria-label="Calendar Settings"
			>
				<SettingsIcon size={16} strokeWidth={2} />
			</a>
		{/if}
	</PageToolbar>

	<TodayBreakdownPanel
		expanded={ctx.breakdownExpanded}
		onToggle={() => ctx.toggleBreakdown()}
		personnelByGroup={ctx.personnelByGroup}
		availabilityEntries={availabilityStore.items}
		statusTypes={statusTypesStore.items}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
	/>

	{#if !data.permissions?.canViewCalendar}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			<section class="calendar-section">
				{#if ctx.viewMode === '3-month'}
					<LongRangeView
						startDate={calendarStore.currentDate}
						personnelByGroup={ctx.scopedPBG}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						onDateColumnClick={(date) => ctx.navigateToMonth(date)}
						onToggleViewMode={() => ctx.toggleViewMode()}
					/>
				{:else}
					<Calendar
						year={calendarStore.year}
						monthName={calendarStore.monthName}
						dates={calendarStore.dates}
						personnelByGroup={ctx.personnelByGroup}
						availabilityEntries={availabilityStore.items}
						statusTypes={statusTypesStore.items}
						specialDays={specialDaysStore.items}
						pinnedGroups={pinnedGroupsStore.list}
						assignmentTypes={dailyAssignmentsStore.types}
						assignments={dailyAssignmentsStore.assignments}
						activeOnboardingPersonnelIds={ctx.activeOnboardingPersonnelIds}
						highlightOnboarding={ctx.highlightOnboarding}
						canEdit={data.permissions?.canEditCalendar ?? false}
						showStatusText={calendarPrefsStore.showStatusText}
						personnelHref={`/org/${data.orgId}/personnel`}
						onPrevMonth={() => calendarStore.prevMonth()}
						onNextMonth={() => calendarStore.nextMonth()}
						onGoToToday={() => calendarStore.goToToday()}
						onCellClick={(person, date) => ctx.handleCellClick(person, date)}
						onPersonClick={(person) => ctx.handlePersonClick(person)}
						onPinToggle={(group) => ctx.handlePinToggle(group)}
						onDateClick={(date) => ctx.handleDateClick(date)}
						viewMode={ctx.viewMode}
						onToggleViewMode={() => ctx.toggleViewMode()}
					/>
					<StatusLegend statusTypes={statusTypesStore.items} />
				{/if}
			</section>
		</main>
	{/if}
</div>

{#if ctx.selectedPerson && ctx.selectedDate}
	<AvailabilityModal
		person={ctx.selectedPerson}
		date={ctx.selectedDate}
		statusTypes={statusTypesStore.items}
		existingEntries={availabilityStore.items}
		onAdd={(entry) => ctx.handleAddAvailability(entry)}
		onRemove={(id) => ctx.handleRemoveAvailability(id)}
		onClose={() => ctx.closeAvailabilityModal()}
	/>
{/if}

{#if ctx.assignmentDate}
	<DailyAssignmentModal
		date={ctx.assignmentDate}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={ctx.personnelByGroup}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onRemoveAssignment={(date, typeId) => dailyAssignmentsStore.removeAssignment(date, typeId)}
		onClose={() => ctx.closeAssignmentModal()}
	/>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.page-content {
		overflow: hidden;
	}

	.calendar-section {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		overflow: hidden;
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		text-align: center;
		color: var(--color-text-muted);
	}

	.no-permission h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text);
	}

	.toolbar-toggle {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		font-weight: 500;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toolbar-toggle:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.toolbar-toggle.active {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: var(--color-onboarding-tint);
	}

	.toggle-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-border);
		transition: background 0.15s ease;
	}

	.toolbar-toggle.active .toggle-dot {
		background: var(--color-primary);
	}

	/* Mobile styles — .page-content mobile in app.css */
</style>
