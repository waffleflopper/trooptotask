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
		statusTypes={statusTypesStore.list}
		existingEntries={availabilityStore.list}
		onAdd={(entry) => ctx.handleAddAvailability(entry)}
		onRemove={(id) => ctx.handleRemoveAvailability(id)}
		onClose={() => ctx.closeAvailabilityModal()}
	/>
{/if}

{#if modals.isOpen('status-manager')}
	<StatusTypeManager
		statusTypes={statusTypesStore.list}
		onAdd={(data) => statusTypesStore.add(data)}
		onUpdate={(id, data) => statusTypesStore.update(id, data)}
		onRemove={async (id) => {
			await statusTypesStore.remove(id);
			availabilityStore.removeByStatusTypeLocal(id);
		}}
		onClose={() => modals.close('status-manager')}
	/>
{/if}

{#if modals.isOpen('assignment-type-manager')}
	<AssignmentTypeManager
		assignmentTypes={dailyAssignmentsStore.types}
		onAdd={(data) => dailyAssignmentsStore.addType(data)}
		onUpdate={(id, data) => dailyAssignmentsStore.updateType(id, data)}
		onRemove={(id) => dailyAssignmentsStore.removeType(id)}
		onClose={() => modals.close('assignment-type-manager')}
	/>
{/if}

{#if modals.isOpen('special-day-manager')}
	<SpecialDayManager
		specialDays={specialDaysStore.list}
		onAdd={(data) => specialDaysStore.add(data)}
		onRemove={(id) => specialDaysStore.remove(id)}
		onResetHolidays={() => specialDaysStore.resetFederalHolidays()}
		onClose={() => modals.close('special-day-manager')}
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
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => modals.close('today-breakdown')}
	/>
{/if}

{#if modals.isOpen('bulk-status')}
	<BulkStatusModal
		personnelByGroup={ctx.scopedPBG}
		statusTypes={statusTypesStore.list}
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
		statusTypes={statusTypesStore.list}
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
		statusTypes={statusTypesStore.list}
		availabilityEntries={availabilityStore.list}
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
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		rosterHistory={dutyRosterHistoryStore.items}
		onApplyRoster={(assignments) => ctx.handleApplyRoster(assignments)}
		onSaveRoster={(payload) => ctx.handleSaveRoster(payload)}
		onDeleteRoster={(id) => ctx.handleDeleteRoster(id)}
		onUpdateExemptions={(typeId, ids) => ctx.handleUpdateExemptions(typeId, ids)}
		specialDays={specialDaysStore.list}
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
		availabilityEntries={availabilityStore.list}
		statusTypes={statusTypesStore.list}
		specialDays={specialDaysStore.list}
		assignmentTypes={dailyAssignmentsStore.types}
		assignments={dailyAssignmentsStore.assignments}
		onClose={() => modals.close('long-range-view')}
		onCellClick={(person, date) => ctx.handleCellClick(person, date)}
	/>
{/if}
