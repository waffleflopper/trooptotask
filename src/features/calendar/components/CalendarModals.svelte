<script lang="ts">
	import type { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import AvailabilityModal from '$features/calendar/components/AvailabilityModal.svelte';
	import StatusTypeManager from '$features/calendar/components/StatusTypeManager.svelte';
	import SpecialDayManager from '$features/calendar/components/SpecialDayManager.svelte';
	import DailyAssignmentModal from '$features/calendar/components/DailyAssignmentModal.svelte';
	import TodayBreakdown from '$features/calendar/components/TodayBreakdown.svelte';
	import BulkStatusModal from '$features/calendar/components/BulkStatusModal.svelte';
	import BulkStatusRemoveModal from '$features/calendar/components/BulkStatusRemoveModal.svelte';
	import BulkStatusImportModal from '$features/calendar/components/BulkStatusImportModal.svelte';
	import MonthlyAssignmentPlanner from '$features/calendar/components/MonthlyAssignmentPlanner.svelte';
	import AssignmentTypeManager from '$features/calendar/components/AssignmentTypeManager.svelte';
	import DutyRosterGenerator from '$features/duty-roster/components/DutyRosterGenerator.svelte';
	import LongRangeView from '$features/calendar/components/LongRangeView.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { dutyRosterHistoryStore } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';

	interface Props {
		ctx: CalendarPageContext;
		orgId: string;
	}

	let { ctx, orgId }: Props = $props();
</script>

{#if ctx.selectedPerson && ctx.selectedDate}
	<AvailabilityModal
		person={ctx.selectedPerson}
		date={ctx.selectedDate}
		statusTypes={statusTypesStore.list}
		existingEntries={availabilityStore.list}
		onAdd={(entry) => ctx.handleAddAvailability(entry)}
		onRemove={(id) => ctx.handleRemoveAvailability(id)}
		onClose={() => ctx.closeAvailabilityModal()}
	/>
{/if}

{#if ctx.showStatusManager}
	<StatusTypeManager
		statusTypes={statusTypesStore.list}
		onAdd={(data) => statusTypesStore.add(data)}
		onUpdate={(id, data) => statusTypesStore.update(id, data)}
		onRemove={async (id) => {
			await statusTypesStore.remove(id);
			availabilityStore.removeByStatusTypeLocal(id);
		}}
		onClose={() => (ctx.showStatusManager = false)}
	/>
{/if}

{#if ctx.showAssignmentTypeManager}
	<AssignmentTypeManager
		assignmentTypes={dailyAssignmentsStore.types}
		onAdd={(data) => dailyAssignmentsStore.addType(data)}
		onUpdate={(id, data) => dailyAssignmentsStore.updateType(id, data)}
		onRemove={(id) => dailyAssignmentsStore.removeType(id)}
		onClose={() => (ctx.showAssignmentTypeManager = false)}
	/>
{/if}

{#if ctx.showSpecialDayManager}
	<SpecialDayManager
		specialDays={specialDaysStore.list}
		onAdd={(data) => specialDaysStore.add(data)}
		onRemove={(id) => specialDaysStore.remove(id)}
		onResetHolidays={() => specialDaysStore.resetFederalHolidays()}
		onClose={() => (ctx.showSpecialDayManager = false)}
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

{#if ctx.showTodayBreakdown}
	<TodayBreakdown
		personnelByGroup={ctx.personnelByGroup}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => (ctx.showTodayBreakdown = false)}
	/>
{/if}

{#if ctx.showBulkStatusModal}
	<BulkStatusModal
		personnelByGroup={ctx.scopedPBG}
		statusTypes={statusTypesStore.list}
		onApply={(ids, typeId, start, end, note) => ctx.handleBulkStatusApply(ids, typeId, start, end, note)}
		onClose={() => (ctx.showBulkStatusModal = false)}
		onImport={() => {
			ctx.showBulkStatusModal = false;
			ctx.showBulkStatusImportModal = true;
		}}
	/>
{/if}

{#if ctx.showBulkStatusImportModal}
	<BulkStatusImportModal
		personnel={ctx.allPersonnelFlat}
		statusTypes={statusTypesStore.list}
		{orgId}
		onImportComplete={() => {
			import('$app/navigation').then(({ invalidateAll }) => invalidateAll());
		}}
		onClose={() => (ctx.showBulkStatusImportModal = false)}
	/>
{/if}

{#if ctx.showBulkRemoveModal}
	<BulkStatusRemoveModal
		personnelByGroup={ctx.scopedPBG}
		statusTypes={statusTypesStore.list}
		availabilityEntries={availabilityStore.list}
		personnelList={ctx.calendarPersonnel}
		onRemove={(ids) => ctx.handleBulkStatusRemove(ids)}
		onClose={() => (ctx.showBulkRemoveModal = false)}
	/>
{/if}

{#if ctx.showDutyRosterGenerator}
	<DutyRosterGenerator
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={ctx.scopedPBG}
		groups={groupsStore.names}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		rosterHistory={dutyRosterHistoryStore.items}
		onApplyRoster={(assignments) => ctx.handleApplyRoster(assignments)}
		onSaveRoster={(payload) => ctx.handleSaveRoster(payload)}
		onDeleteRoster={(id) => ctx.handleDeleteRoster(id)}
		onUpdateExemptions={(typeId, ids) => ctx.handleUpdateExemptions(typeId, ids)}
		specialDays={specialDaysStore.list}
		onClose={() => (ctx.showDutyRosterGenerator = false)}
	/>
{/if}

{#if ctx.showAssignmentPlanner}
	<MonthlyAssignmentPlanner
		currentDate={calendarStore.currentDate}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		personnelByGroup={ctx.scopedPBG}
		groups={groupsStore.names}
		onSetAssignment={(date, typeId, assigneeId) => dailyAssignmentsStore.setAssignment(date, typeId, assigneeId)}
		onSetAssignmentBatch={(assignments) => dailyAssignmentsStore.setAssignmentBatch(assignments)}
		onClose={() => (ctx.showAssignmentPlanner = false)}
	/>
{/if}

{#if ctx.showLongRangeView}
	<LongRangeView
		startDate={calendarStore.currentDate}
		personnelByGroup={ctx.personnelByGroup}
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		specialDays={specialDaysStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => (ctx.showLongRangeView = false)}
		onCellClick={(person, date) => ctx.handleCellClick(person, date)}
	/>
{/if}
