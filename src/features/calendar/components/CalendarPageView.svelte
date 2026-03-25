<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import Calendar from '$features/calendar/components/Calendar.svelte';
	import StatusLegend from '$features/calendar/components/StatusLegend.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarPrefsStore } from '$features/calendar/stores/calendarPrefs.svelte';

	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: CalendarPageContext;
		modals: ModalRegistry;
		data: {
			orgId: string;
			orgName: string;
			permissions?: { canViewCalendar?: boolean; canEditCalendar?: boolean } | null;
		};
	}

	let { ctx, modals, data }: Props = $props();
</script>

<svelte:head>
	<title>{data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Calendar" helpTopic="calendar" overflowItems={ctx.calendarOverflowItems}>
		<button
			class="toolbar-toggle"
			class:active={ctx.highlightOnboarding}
			onclick={() => ctx.toggleHighlightOnboarding()}
			title={ctx.highlightOnboarding ? 'Hide onboarding highlighting' : 'Show onboarding highlighting'}
		>
			<span class="toggle-dot"></span>
			Onboarding
		</button>
		<button class="btn btn-sm" data-testid="calendar-today-breakdown" onclick={() => modals.open('today-breakdown')}>
			Today's Breakdown
		</button>
		{#if data.permissions?.canEditCalendar && ctx.canManageConfig}
			<button class="btn btn-sm" onclick={() => modals.open('assignment-planner')} disabled={ctx.readOnly}>
				Assignments
			</button>
		{/if}
		<button class="btn btn-sm" onclick={() => modals.open('long-range-view')}> 3-Month View </button>
		{#if ctx.readOnly}
			<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
		{/if}
		{#if ctx.canManageConfig}
			<a
				href="/org/{data.orgId}/calendar/settings"
				class="btn btn-sm btn-icon"
				title="Calendar Settings"
				aria-label="Calendar Settings">⚙</a
			>
		{/if}
	</PageToolbar>

	{#if !data.permissions?.canViewCalendar}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			<section class="calendar-section">
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
				/>
				<StatusLegend statusTypes={statusTypesStore.items} />
			</section>
		</main>
	{/if}
</div>

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
