<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import AvailabilityModal from '$features/calendar/components/AvailabilityModal.svelte';
	import DailyAssignmentModal from '$features/calendar/components/DailyAssignmentModal.svelte';
	import TodayBreakdown from '$features/calendar/components/TodayBreakdown.svelte';
	import BulkStatusModal from '$features/calendar/components/BulkStatusModal.svelte';
	import BulkStatusRemoveModal from '$features/calendar/components/BulkStatusRemoveModal.svelte';
	import BulkStatusImportModal from '$features/calendar/components/BulkStatusImportModal.svelte';
	import MonthlyAssignmentPlanner from '$features/calendar/components/MonthlyAssignmentPlanner.svelte';
	import DutyRosterGenerator from '$features/duty-roster/components/DutyRosterGenerator.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { dutyRosterHistoryStore } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';

	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: CalendarPageContext;
		modals: ModalRegistry;
		orgId: string;
	}

	let { ctx, modals, orgId }: Props = $props();
</script>

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

{#if modals.isOpen('today-breakdown')}
	<TodayBreakdown
		personnelByGroup={ctx.personnelByGroup}
		availabilityEntries={availabilityStore.items}
		statusTypes={statusTypesStore.items}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => modals.close('today-breakdown')}
	/>
{/if}

{#if modals.isOpen('bulk-status')}
	<BulkStatusModal
		personnelByGroup={ctx.scopedPBG}
		statusTypes={statusTypesStore.items}
		onApply={(ids, typeId, start, end, note) => ctx.handleBulkStatusApply(ids, typeId, start, end, note)}
		onClose={() => modals.close('bulk-status')}
		onImport={() => {
			modals.close('bulk-status');
			modals.open('bulk-status-import');
		}}
	/>
{/if}

{#if modals.isOpen('bulk-status-import')}
	<BulkStatusImportModal
		personnel={ctx.allPersonnelFlat}
		statusTypes={statusTypesStore.items}
		{orgId}
		onImportComplete={() => {
			import('$app/navigation').then(({ invalidateAll }) => invalidateAll());
		}}
		onClose={() => modals.close('bulk-status-import')}
	/>
{/if}

{#if modals.isOpen('bulk-remove')}
	<BulkStatusRemoveModal
		personnelByGroup={ctx.scopedPBG}
		statusTypes={statusTypesStore.items}
		availabilityEntries={availabilityStore.items}
		personnelList={ctx.calendarPersonnel}
		onRemove={(ids) => ctx.handleBulkStatusRemove(ids)}
		onClose={() => modals.close('bulk-remove')}
	/>
{/if}

{#if modals.isOpen('duty-roster-generator')}
	<DutyRosterGenerator
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={ctx.scopedPBG}
		groups={groupsStore.names}
		availabilityEntries={availabilityStore.items}
		statusTypes={statusTypesStore.items}
		rosterHistory={dutyRosterHistoryStore.items}
		onApplyRoster={(assignments) => ctx.handleApplyRoster(assignments)}
		onSaveRoster={(payload) => ctx.handleSaveRoster(payload)}
		onDeleteRoster={(id) => ctx.handleDeleteRoster(id)}
		onUpdateExemptions={(typeId, ids) => ctx.handleUpdateExemptions(typeId, ids)}
		specialDays={specialDaysStore.items}
		onClose={() => modals.close('duty-roster-generator')}
	/>
{/if}

{#if modals.isOpen('assignment-planner')}
	<MonthlyAssignmentPlanner
		currentDate={calendarStore.currentDate}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={ctx.scopedPBG}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onSetAssignmentBatch={(assignments) => dailyAssignmentsStore.setAssignmentBatch(assignments)}
		onClose={() => modals.close('assignment-planner')}
	/>
{/if}

{#if modals.isOpen('long-range-view')}
	<LongRangeView
		startDate={calendarStore.currentDate}
		personnelByGroup={ctx.personnelByGroup}
		availabilityEntries={availabilityStore.items}
		statusTypes={statusTypesStore.items}
		specialDays={specialDaysStore.items}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => modals.close('long-range-view')}
		onCellClick={(person, date) => ctx.handleCellClick(person, date)}
	/>
{/if}
