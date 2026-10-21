<script lang="ts">
	import type { FeatureKey } from '$lib/access/featureSwitches';
	import * as Alert from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { PersonnelWorkspaceRestricted, PersonnelWorkspaceResult } from '../contracts';
	import type { Personnel } from '../personnel.types';
	import type { PersonnelExtendedInfo } from '../personnelExtendedInfo.types';
	import PersonnelDataSheetEditor from './PersonnelDataSheetEditor.svelte';
	import PersonnelDataSheetView from './PersonnelDataSheetView.svelte';

	interface Props {
		orgId: string;
		orgUrlSegment: string;
		person: Personnel;
		today: string;
		editing: boolean;
		dataSheet: Promise<PersonnelExtendedInfo | null>;
		/** The Personnel workspace streamed by the parent layout, which carries the edit form's catalogs. */
		workspace: Promise<PersonnelWorkspaceResult | PersonnelWorkspaceRestricted>;
		disabledFeatures: readonly FeatureKey[];
	}

	let { orgId, orgUrlSegment, person, today, editing, dataSheet, workspace, disabledFeatures }: Props = $props();

	// An await block rebuilds when its expression is re-evaluated, even for the same promise. A layout refresh hands
	// this page new props holding the same loads, so the blocks read deriveds that change only with the promises.
	const sheet = $derived(dataSheet);
	const catalogs = $derived(workspace);
	const editorReads = $derived(Promise.all([sheet, catalogs]));

	const skeletonColumns = [
		[5, 2],
		[3, 3, 2]
	];
</script>

{#snippet skeleton()}
	<div class="grid items-start gap-x-16 gap-y-10 lg:grid-cols-2" aria-hidden="true">
		{#each skeletonColumns as column, columnIndex (columnIndex)}
			<div class="grid gap-10">
				{#each column as rows, sectionIndex (sectionIndex)}
					<div>
						<Skeleton class="mb-3 h-6 w-40" />
						{#each { length: rows } as _, rowIndex (rowIndex)}
							<div class="grid gap-x-4 border-b border-border py-3.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
								<Skeleton class="h-4 w-24" />
								<Skeleton class="h-4 w-48 max-w-full" />
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/snippet}

{#snippet failed()}
	<Alert.Root variant="destructive">
		<Alert.Description>The data sheet could not be loaded. Reload the page to try again.</Alert.Description>
	</Alert.Root>
{/snippet}

<div class="p-6">
	<h2 class="sr-only">Data sheet</h2>
	{#if editing}
		{#await editorReads}
			{@render skeleton()}
		{:then [info, loaded]}
			{#if 'access' in loaded}
				{@render failed()}
			{:else}
				<PersonnelDataSheetEditor
					{orgId}
					{orgUrlSegment}
					{person}
					{info}
					groups={loaded.data.groups}
					rankCatalog={loaded.data.rankCatalog}
					lossWarningWindowDays={disabledFeatures.includes('lossesAndAwards')
						? null
						: loaded.data.lossWarningWindowDays}
					{today}
				/>
			{/if}
		{:catch}
			{@render failed()}
		{/await}
	{:else}
		{#await sheet}
			{@render skeleton()}
		{:then info}
			<PersonnelDataSheetView {person} {info} />
		{:catch}
			{@render failed()}
		{/await}
	{/if}
</div>
