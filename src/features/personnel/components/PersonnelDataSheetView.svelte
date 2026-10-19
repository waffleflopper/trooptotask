<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { dataSheetReadModel, lastUpdatedLine } from '../dataSheetModel';
	import type { Personnel } from '../personnel.types';
	import type { PersonnelExtendedInfo } from '../personnelExtendedInfo.types';

	interface Props {
		person: Personnel;
		info: PersonnelExtendedInfo | null;
	}

	let { person, info }: Props = $props();

	const sheet = $derived(dataSheetReadModel(person, info));
</script>

<div class="grid items-start gap-x-16 gap-y-10 lg:grid-cols-2">
	<div class="grid gap-10">
		<PageShell.FactSection title="Service">
			<PageShell.FactRow label="BASD" value={sheet.basd} mono />
			<PageShell.FactRow label="Date of rank" value={sheet.dateOfRank} mono />
			<PageShell.FactRow label="ETS" value={sheet.ets} mono />
			<PageShell.FactRow label="PCS / DEROS" value={sheet.deros} mono />
			<PageShell.FactRow label="Blood type" value={sheet.bloodType} mono />
		</PageShell.FactSection>
		<PageShell.FactSection title="Education">
			<PageShell.FactRow label="Civilian" value={sheet.civilianEducation} />
			<PageShell.FactRow label="Military" value={sheet.militaryEducation} />
		</PageShell.FactSection>
	</div>
	<div class="grid gap-10">
		<PageShell.FactSection title="Contact">
			<PageShell.FactRow label="Personal phone" value={sheet.personalPhone} mono />
			<PageShell.FactRow label="Personal email" value={sheet.personalEmail} />
			<PageShell.FactRow label="Address">
				{#each sheet.addressLines as line (line)}
					<div>{line}</div>
				{:else}
					<span class="text-muted-foreground">Not set</span>
				{/each}
			</PageShell.FactRow>
		</PageShell.FactSection>
		<PageShell.FactSection title="Emergency and family">
			<PageShell.FactRow label="Emergency contact">
				{#if sheet.emergencyContact || sheet.emergencyPhone}
					{#if sheet.emergencyContact}<div>{sheet.emergencyContact}</div>{/if}
					{#if sheet.emergencyPhone}<div class="font-mono text-sm">{sheet.emergencyPhone}</div>{/if}
				{:else}
					<span class="text-muted-foreground">Not set</span>
				{/if}
			</PageShell.FactRow>
			<PageShell.FactRow label="Marital status" value={sheet.maritalStatus} />
			{#if sheet.spouse}
				<PageShell.FactRow label="Spouse" value={sheet.spouse} />
			{/if}
			<PageShell.FactRow label="Dependents" value={sheet.dependents} />
		</PageShell.FactSection>
		<PageShell.FactSection title="Vehicle">
			<PageShell.FactRow label="POV" value={sheet.vehicle} />
			<PageShell.FactRow label="Plate" value={sheet.vehiclePlate} mono />
		</PageShell.FactSection>
		<p class="text-sm text-muted-foreground">{lastUpdatedLine(info)}</p>
	</div>
</div>
