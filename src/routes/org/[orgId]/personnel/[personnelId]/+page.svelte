<script lang="ts">
	import { page } from '$app/state';
	import PersonnelDetailPageView from '$features/personnel/components/PersonnelDetailPageView.svelte';
	import type { PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
	import type { Personnel } from '$lib/types';

	interface PersonnelLayoutData {
		orgId: string;
		orgName: string;
		personnelDetail: PersonnelDetailStreams;
		personnel?: {
			data?: {
				personnel?: Personnel[];
			};
		};
	}

	let { data }: { data: PersonnelLayoutData } = $props();

	const personnelId = $derived(page.params.personnelId ?? '');
	const roster = $derived(data.personnel?.data?.personnel ?? []);
	const person = $derived(roster.find((item) => item.id === personnelId));
</script>

{#if person}
	<PersonnelDetailPageView {person} {roster} orgName={data.orgName} detail={data.personnelDetail} />
{:else}
	<section class="m-6 rounded-lg border bg-card p-8">
		<p class="text-sm font-medium text-muted-foreground">Personnel record not found.</p>
	</section>
{/if}
