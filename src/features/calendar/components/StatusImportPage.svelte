<script lang="ts">
	import { onDestroy } from 'svelte';
	import { lastFirstSplitter, rosterPersonReference, rosterStore } from '$features/personnel';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { ImportFlow } from '$lib/components/patterns/import-flow';
	import { getCalendarWorkspaceReady } from '../calendarWorkspaceHydration.svelte';
	import { NEW_STATUS_TYPE_COLORS, type CalendarDateRange, type CalendarOperationsPageAccess } from '../contracts';
	import { createStatusImportLane, type StatusImportColumns } from '../import/statusImportLane';
	import { availabilityStore } from '../stores/availability.svelte';
	import { statusTypesStore } from '../stores/statusTypes.svelte';
	import {
		beginCalendarRangeRead,
		loadCalendarRange,
		mergeCalendarRangeIntoStores
	} from '../utils/calendarRangeLoader';

	let { org, orgId, orgName }: { org: CalendarOperationsPageAccess; orgId: string; orgName: string } = $props();

	const workspaceReady = getCalendarWorkspaceReady();

	const loaded: CalendarDateRange[] = [];
	let mounted = true;
	onDestroy(() => {
		mounted = false;
	});

	async function readEntries(range: CalendarDateRange) {
		const requestedOrgId = orgId;
		const read = beginCalendarRangeRead();
		try {
			const rangeData = await loadCalendarRange(requestedOrgId, { ...range, collections: ['availability'] }).catch(
				() => {
					throw new Error('The calendar for these dates could not be loaded. Try again.');
				}
			);
			if (!mounted || orgId !== requestedOrgId) throw new Error('The Organization changed. Start the import again.');
			mergeCalendarRangeIntoStores(requestedOrgId, rangeData, read);
		} finally {
			read.close();
		}
	}

	const canConfigureStatusTypes = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureStatusTypes).allowed
	);

	const lane = $derived(
		workspaceReady()
			? createStatusImportLane({
					orgId,
					orgUrlSegment: org.orgUrlSegment,
					person: rosterPersonReference<StatusImportColumns>(
						rosterStore.readModel({ fallbackGroupName: orgName }).scoped(org.scopeSet, { status: 'active' })
							.flatPersonnel
					),
					nameSplitter: lastFirstSplitter<StatusImportColumns>(),
					statusTypes: statusTypesStore.items,
					entries: availabilityStore.items,
					loaded,
					createStatusType: canConfigureStatusTypes
						? (name) => statusTypesStore.add({ name, ...NEW_STATUS_TYPE_COLORS, shortLabel: null, rosterEffect: 'A' })
						: undefined,
					reloadEntries: readEntries
				})
			: null
	);
</script>

<ImportFlow {lane} title="Import statuses" eyebrow="Calendar · Import" />
