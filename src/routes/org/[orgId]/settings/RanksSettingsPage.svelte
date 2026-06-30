<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { RanksSettingsData } from './settingsRanks.server';
	import type { SettingsRankCatalogRow } from './settingsSectionTypes';

	let {
		ranksSettings,
		form
	}: {
		ranksSettings: RanksSettingsData;
		form: { [key: string]: unknown; rankError?: string } | null;
	} = $props();

	let savingAction = $state<string | null>(null);

	const ranks = $derived(ranksSettings.sections.ranks);
	const rankError = $derived(typeof form?.rankError === 'string' ? form.rankError : null);

	function enhancedForm(key: string): SubmitFunction {
		return () => {
			savingAction = key;
			return async ({ update }) => {
				try {
					await update();
				} finally {
					savingAction = null;
				}
			};
		};
	}

	function sourceVariant(source: SettingsRankCatalogRow['source']): 'secondary' | 'outline' {
		return source === 'built-in' ? 'secondary' : 'outline';
	}

	function rankDomId(code: string): string {
		const safeCode = Array.from(code, (char) => char.codePointAt(0)?.toString(36) ?? '0').join('-');
		return `rank-${safeCode || 'entry'}`;
	}
</script>

<div class="grid max-w-6xl gap-4">
	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="rank-catalog-heading">
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="rank-catalog-heading" class="font-heading text-lg font-semibold tracking-tight">Rank Catalog</h2>
				<p class="text-sm text-muted-foreground">
					Manage the Organization vocabulary used for future rank selection, imports, and ordering.
				</p>
			</div>
			<Badge variant={ranks.commands.canManageCatalog ? 'secondary' : 'outline'}>
				{ranks.commands.canManageCatalog ? 'Catalog manager' : 'View only'}
			</Badge>
		</div>

		{#if rankError}
			<Alert.Root variant="destructive">
				<Alert.Description>{rankError}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if !ranks.commands.canManageCatalog}
			<Alert.Root>
				<Alert.Description>
					Organization admin or owner access is required to change service packs, custom ranks, or retirement state.
				</Alert.Description>
			</Alert.Root>
		{/if}

		<div class="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
			<p>{ranks.copy.payGradeHelp}</p>
			<p>{ranks.copy.tieBreakHelp}</p>
		</div>
	</section>

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="rank-service-packs">
		<div class="grid gap-1">
			<h2 id="rank-service-packs" class="font-heading text-lg font-semibold tracking-tight">Service Packs</h2>
			<p class="text-sm text-muted-foreground">
				Add missing built-in ranks for a service without changing existing Personnel Records.
			</p>
		</div>
		<Separator />
		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each ranks.servicePacks as pack (pack.value)}
				<form
					method="POST"
					action="?/addServicePack"
					class="flex min-h-24 flex-col justify-between gap-3 rounded-lg border p-3"
					use:enhance={enhancedForm(`pack-${pack.value}`)}
				>
					<input type="hidden" name="service" value={pack.value} />
					<div class="flex items-start justify-between gap-3">
						<div class="grid gap-1">
							<h3 class="font-medium">{pack.label}</h3>
							<p class="text-sm text-muted-foreground">
								{pack.existingCount} of {pack.builtInCount} ranks available
							</p>
						</div>
						<Badge variant={pack.isInstalled ? 'secondary' : 'outline'}>
							{pack.isInstalled ? 'Added' : `${pack.missingCount} missing`}
						</Badge>
					</div>
					<div>
						<Button
							type="submit"
							size="sm"
							disabled={!ranks.commands.canAddServicePack || pack.isInstalled || savingAction === `pack-${pack.value}`}
							aria-label={`Add ${pack.label}`}
						>
							{#if savingAction === `pack-${pack.value}`}
								<Spinner />
							{:else}
								<PlusIcon aria-hidden />
							{/if}
							Add {pack.label}
						</Button>
					</div>
				</form>
			{/each}
		</div>
	</section>

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="add-custom-rank">
		<div class="grid gap-1">
			<h2 id="add-custom-rank" class="font-heading text-lg font-semibold tracking-tight">Add Custom Rank</h2>
			<p class="text-sm text-muted-foreground">
				Custom entries are available for future selection and can be retired or removed when unused.
			</p>
		</div>
		<Separator />
		<form method="POST" action="?/saveRank" class="grid gap-4" use:enhance={enhancedForm('rank-add')}>
			<input type="hidden" name="intent" value="add" />
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<div class="grid gap-2">
					<Label for="rank-code">Code</Label>
					<Input id="rank-code" name="code" maxlength={80} required disabled={!ranks.commands.canAddCustomRank} />
				</div>
				<div class="grid gap-2">
					<Label for="rank-label">Label</Label>
					<Input id="rank-label" name="label" maxlength={120} required disabled={!ranks.commands.canAddCustomRank} />
				</div>
				<div class="grid gap-2">
					<Label for="rank-service">Service</Label>
					<NativeSelect.Root
						id="rank-service"
						name="service"
						value="custom"
						disabled={!ranks.commands.canAddCustomRank}
					>
						{#each ranks.options.services as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
				<div class="grid gap-2">
					<Label for="rank-category">Category</Label>
					<NativeSelect.Root
						id="rank-category"
						name="category"
						value="custom"
						disabled={!ranks.commands.canAddCustomRank}
					>
						{#each ranks.options.categories as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
				<div class="grid gap-2">
					<Label for="rank-pay-grade">Pay grade</Label>
					<NativeSelect.Root
						id="rank-pay-grade"
						name="payGrade"
						value="ungraded"
						disabled={!ranks.commands.canAddCustomRank}
					>
						{#each ranks.options.payGrades as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
				<div class="grid gap-2">
					<Label for="rank-state">State</Label>
					<NativeSelect.Root id="rank-state" name="state" value="active" disabled={!ranks.commands.canAddCustomRank}>
						{#each ranks.options.states as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
				<div class="grid gap-2">
					<Label for="rank-sort-order">Tie-break order</Label>
					<Input
						id="rank-sort-order"
						name="sortOrder"
						type="number"
						value="500"
						disabled={!ranks.commands.canAddCustomRank}
					/>
				</div>
			</div>
			<div>
				<Button type="submit" disabled={!ranks.commands.canAddCustomRank || savingAction === 'rank-add'}>
					{#if savingAction === 'rank-add'}<Spinner />{:else}<PlusIcon aria-hidden />{/if}
					Add Rank
				</Button>
			</div>
		</form>
	</section>

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="active-ranks-heading">
		<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
			<div class="grid gap-1">
				<h2 id="active-ranks-heading" class="font-heading text-lg font-semibold tracking-tight">Active Ranks</h2>
				<p class="text-sm text-muted-foreground">Available for future selection and import matching.</p>
			</div>
			<Badge variant="outline">{ranks.entries.active.length} active</Badge>
		</div>
		<Separator />
		{#if ranks.entries.active.length > 0}
			<div class="grid gap-3">
				{#each ranks.entries.active as entry (entry.code)}
					{@render rankCard(entry)}
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No active ranks have been added.</p>
		{/if}
	</section>

	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="retired-ranks-heading"
	>
		<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
			<div class="grid gap-1">
				<h2 id="retired-ranks-heading" class="font-heading text-lg font-semibold tracking-tight">Retired Ranks</h2>
				<p class="text-sm text-muted-foreground">Hidden from future selection while preserving existing references.</p>
			</div>
			<Badge variant="outline">{ranks.entries.retired.length} retired</Badge>
		</div>
		<Separator />
		{#if ranks.entries.retired.length > 0}
			<div class="grid gap-3">
				{#each ranks.entries.retired as entry (entry.code)}
					{@render rankCard(entry)}
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No ranks are retired.</p>
		{/if}
	</section>
</div>

{#snippet rankCard(entry: SettingsRankCatalogRow)}
	{@const domId = rankDomId(entry.code)}
	<article class="grid gap-3 rounded-lg border p-3" aria-labelledby={`${domId}-heading`}>
		<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
			<div class="grid gap-2">
				<div class="flex flex-wrap items-center gap-2">
					<h3 id={`${domId}-heading`} class="text-base font-semibold">
						{entry.code} · {entry.label}
					</h3>
					<Badge variant={sourceVariant(entry.source)}>{entry.sourceLabel}</Badge>
					<Badge variant={entry.state === 'active' ? 'secondary' : 'outline'}>{entry.state}</Badge>
				</div>
				<p class="text-sm text-muted-foreground">
					{entry.serviceLabel} · {entry.categoryLabel} · {entry.payGradeLabel} · tie-break {entry.sortOrder}
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#if entry.commands.canRetire}
					<form method="POST" action="?/retireRank" use:enhance={enhancedForm(`retire-${entry.code}`)}>
						<input type="hidden" name="code" value={entry.code} />
						<Button
							type="submit"
							variant="outline"
							size="sm"
							disabled={savingAction === `retire-${entry.code}`}
							aria-label={`Retire ${entry.code}`}
						>
							{#if savingAction === `retire-${entry.code}`}<Spinner />{:else}<ArchiveIcon aria-hidden />{/if}
							Retire
						</Button>
					</form>
				{/if}
				{#if entry.commands.canReactivate}
					<form method="POST" action="?/reactivateRank" use:enhance={enhancedForm(`reactivate-${entry.code}`)}>
						<input type="hidden" name="code" value={entry.code} />
						<Button
							type="submit"
							variant="outline"
							size="sm"
							disabled={savingAction === `reactivate-${entry.code}`}
							aria-label={`Reactivate ${entry.code}`}
						>
							{#if savingAction === `reactivate-${entry.code}`}<Spinner />{:else}<RotateCcwIcon aria-hidden />{/if}
							Reactivate
						</Button>
					</form>
				{/if}
				{#if entry.commands.canDelete}
					<form method="POST" action="?/deleteRank" use:enhance={enhancedForm(`delete-${entry.code}`)}>
						<input type="hidden" name="code" value={entry.code} />
						<Button
							type="submit"
							variant="destructive"
							size="sm"
							disabled={savingAction === `delete-${entry.code}`}
							aria-label={`Remove ${entry.code}`}
						>
							{#if savingAction === `delete-${entry.code}`}<Spinner />{:else}<Trash2Icon aria-hidden />{/if}
							Remove
						</Button>
					</form>
				{/if}
			</div>
		</div>

		<div class="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
			<p><span class="font-medium">Personnel</span> {entry.referenceSummary.activeReferences.personnel}</p>
			<p>
				<span class="font-medium">Training filters</span>
				{entry.referenceSummary.activeReferences.trainingApplicability}
			</p>
			<p>
				<span class="font-medium">Duty templates</span>
				{entry.referenceSummary.activeReferences.dutyRosterTemplateFilters}
			</p>
			<p><span class="font-medium">Historical warnings</span> {entry.referenceSummary.historicalReferences.total}</p>
		</div>

		{#if entry.warnings.length > 0}
			<div class="grid gap-2">
				{#each entry.warnings as warning (warning)}
					<Alert.Root variant="warning">
						<Alert.Description>{warning}</Alert.Description>
					</Alert.Root>
				{/each}
			</div>
		{/if}

		{#if entry.commands.deleteDisabledReason && !entry.commands.canDelete}
			<p class="text-sm text-muted-foreground">{entry.commands.deleteDisabledReason}</p>
		{/if}

		{#if entry.commands.canEdit}
			<details class="rounded-lg border bg-muted/30 p-3">
				<summary class="flex cursor-pointer items-center gap-2 text-sm font-medium">
					<PencilIcon aria-hidden class="size-4" />
					Edit rank
				</summary>
				<form
					method="POST"
					action="?/saveRank"
					class="mt-3 grid gap-3"
					use:enhance={enhancedForm(`edit-${entry.code}`)}
				>
					<input type="hidden" name="intent" value="edit" />
					<input type="hidden" name="originalCode" value={entry.code} />
					<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						<div class="grid gap-2">
							<Label for={`${domId}-edit-code`}>Code</Label>
							<Input id={`${domId}-edit-code`} name="code" value={entry.code} readonly />
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-label`}>Label</Label>
							<Input id={`${domId}-edit-label`} name="label" value={entry.label} maxlength={120} required />
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-service`}>Service</Label>
							<NativeSelect.Root id={`${domId}-edit-service`} name="service" value={entry.service}>
								{#each ranks.options.services as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-category`}>Category</Label>
							<NativeSelect.Root id={`${domId}-edit-category`} name="category" value={entry.category}>
								{#each ranks.options.categories as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-pay-grade`}>Pay grade</Label>
							<NativeSelect.Root id={`${domId}-edit-pay-grade`} name="payGrade" value={entry.payGrade}>
								{#each ranks.options.payGrades as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-state`}>State</Label>
							<NativeSelect.Root id={`${domId}-edit-state`} name="state" value={entry.state}>
								{#each ranks.options.states as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-sort-order`}>Tie-break order</Label>
							<Input id={`${domId}-edit-sort-order`} name="sortOrder" type="number" value={entry.sortOrder} />
						</div>
					</div>
					<div>
						<Button
							type="submit"
							size="sm"
							disabled={savingAction === `edit-${entry.code}`}
							aria-label={`Save ${entry.code}`}
						>
							{#if savingAction === `edit-${entry.code}`}<Spinner />{:else}<SaveIcon aria-hidden />{/if}
							Save
						</Button>
					</div>
				</form>
			</details>
		{/if}
	</article>
{/snippet}
