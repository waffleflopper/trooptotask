<script lang="ts">
	import { CalendarDays, User } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import WarningSummary from './WarningSummary.svelte';
	import type { DutyRosterSoldierOption } from './types.js';

	type Props = {
		dateLabel: string;
		currentSoldier: string;
		currentRole?: string;
		originalSoldier: string;
		originalRole?: string;
		riskItems?: string[];
		soldiers: DutyRosterSoldierOption[];
		replacementValue?: string;
		replacementSummary?: string;
		reasonRequired?: boolean;
		blockedWarning?: string;
	};

	let {
		dateLabel,
		currentSoldier,
		currentRole,
		originalSoldier,
		originalRole,
		riskItems = [],
		soldiers,
		replacementValue = '',
		replacementSummary,
		reasonRequired = false,
		blockedWarning = 'Only active, eligible personnel can be selected.'
	}: Props = $props();
</script>

<Sheet.Content class="sm:max-w-md">
	<Sheet.Header>
		<Sheet.Title>Manual Preview Change</Sheet.Title>
		<Sheet.Description>Resolve or review a draft roster assignment before acceptance.</Sheet.Description>
	</Sheet.Header>
	<div class="grid gap-4 px-4 pb-4">
		<section class="grid gap-2">
			<h3 class="font-semibold">Selected Date</h3>
			<p class="flex items-center gap-2 text-sm">
				<CalendarDays class="size-4" />
				{dateLabel}
			</p>
		</section>
		<div class="overflow-hidden rounded-lg border">
			<div class="grid gap-1 border-b p-4">
				<span class="text-sm font-medium">Current Final Selection</span>
				<strong class="flex items-center gap-2"><User class="size-4" /> {currentSoldier}</strong>
				{#if currentRole}
					<span class="text-sm text-muted-foreground">{currentRole}</span>
				{/if}
			</div>
			<div class="grid gap-1 p-4">
				<span class="text-sm font-medium">Original Generated Selection</span>
				<strong>{originalSoldier}</strong>
				{#if originalRole}
					<span class="text-sm text-muted-foreground">{originalRole}</span>
				{/if}
			</div>
		</div>
		{#if riskItems.length > 0}
			<WarningSummary tone="warning" title="Why this replacement is considered risky" items={riskItems} />
		{/if}
		<Field.Root>
			<Field.Label>Replacement Soldier</Field.Label>
			<Combobox.Root items={soldiers} value={replacementValue}>
				<Combobox.Trigger placeholder="Search personnel..." />
				<Combobox.Content>
					<Combobox.List />
				</Combobox.Content>
			</Combobox.Root>
			{#if replacementSummary}
				<Field.Description>{replacementSummary}</Field.Description>
			{/if}
		</Field.Root>
		<Field.Root>
			<Field.Label>Reason for Change{reasonRequired ? ' *' : ''}</Field.Label>
			<Textarea placeholder="Provide a clear reason for this manual change..." aria-required={reasonRequired} />
			<Field.Description>0 / 300</Field.Description>
		</Field.Root>
		<WarningSummary tone="warning" title="Archived or missing personnel are blocked." description={blockedWarning} />
	</div>
	<Sheet.Footer>
		<Button variant="outline">Cancel</Button>
		<Button>Save Change</Button>
	</Sheet.Footer>
</Sheet.Content>
