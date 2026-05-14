<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as PageShell from '$lib/components/ui/page-shell/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import WarningSummary from './WarningSummary.svelte';
	import type { DutyRosterSoldierOption } from './types.js';

	type CorrectionReason = {
		value: string;
		label: string;
	};

	type PriorCorrection = {
		id: string;
		label: string;
	};

	type Props = {
		dateLabel: string;
		originalSoldier: string;
		soldiers: DutyRosterSoldierOption[];
		reasons: CorrectionReason[];
		soldierValue?: string;
		reasonValue?: string;
		priorCorrections?: PriorCorrection[];
		outsidePoolWarning?: string;
		impactInfo?: string;
	};

	let {
		dateLabel,
		originalSoldier,
		soldiers,
		reasons,
		soldierValue = '',
		reasonValue = '',
		priorCorrections = [],
		outsidePoolWarning = 'The selected Soldier is not in the original duty pool for this slot. Continue only if this is accurate.',
		impactInfo = 'Corrections affect future counts and will update the Calendar since this run was applied.'
	}: Props = $props();
</script>

<Sheet.Content class="sm:max-w-md">
	<Sheet.Header>
		<Sheet.Title>Duty Roster Correction</Sheet.Title>
		<Sheet.Description>Submit a correction for this roster entry.</Sheet.Description>
	</Sheet.Header>
	<div class="grid gap-4 px-4 pb-4">
		<div class="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
			<PageShell.FactRow label="Date" value={dateLabel} />
			<PageShell.FactRow label="Originally Assigned Soldier" value={originalSoldier} />
		</div>
		<Field.Root>
			<Field.Label>Soldier Who Actually Served *</Field.Label>
			<Combobox.Root items={soldiers} value={soldierValue}>
				<Combobox.Trigger placeholder="Search by name or rank..." />
				<Combobox.Content>
					<Combobox.List />
				</Combobox.Content>
			</Combobox.Root>
		</Field.Root>
		<Field.Root>
			<Field.Label>Reason *</Field.Label>
			<Select.Root type="single" value={reasonValue}>
				<Select.Trigger
					>{reasons.find((reason) => reason.value === reasonValue)?.label ?? 'Select a reason...'}</Select.Trigger
				>
				<Select.Content>
					{#each reasons as reason (reason.value)}
						<Select.Item value={reason.value} label={reason.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</Field.Root>
		<Field.Root>
			<Field.Label>Additional details (optional)</Field.Label>
			<Textarea />
			<Field.Description>0 / 250</Field.Description>
		</Field.Root>
		<section class="grid gap-2">
			<h3 class="text-sm font-semibold">Prior Corrections</h3>
			{#if priorCorrections.length > 0}
				<ul class="grid gap-1 text-sm text-muted-foreground">
					{#each priorCorrections as correction (correction.id)}
						<li>{correction.label}</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">No prior corrections for this entry.</p>
			{/if}
		</section>
		<WarningSummary tone="warning" title="Outside Pool Warning" description={outsidePoolWarning} />
		<WarningSummary tone="info" title="Calendar and count impact" description={impactInfo} />
	</div>
	<Sheet.Footer>
		<Button>Save Correction</Button>
		<Button variant="outline">Cancel</Button>
	</Sheet.Footer>
</Sheet.Content>
