<script lang="ts">
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { CalendarPageData } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const pageData = $derived.by(
		(): CalendarPageData => ({
			orgId: data.orgId,
			orgName: data.orgName ?? 'Troop to Task',
			userId: data.userId,
			calendar: data.calendar ? { data: data.calendar.data } : undefined,
			scopedGroupId: data.scopedGroupId,
			permissions: data.permissions,
			activeOnboardingPersonnelIds: data.calendar?.data.activeOnboardingPersonnelIds
		})
	);
	const viewData = $derived.by(() => ({
		orgId: pageData.orgId,
		orgName: pageData.orgName ?? 'Troop to Task',
		permissions: pageData.permissions
	}));
	const ctx = new CalendarPageContext(() => pageData, org);

	$effect(() => {
		ctx.initBreakdownPreference();
	});
	$effect(() => {
		ctx.initFromStorage();
	});
	$effect(() => {
		ctx.markCalendarVisited();
	});
</script>

<CalendarPageView {ctx} data={viewData} />
