<script lang="ts">
	import { History, Play, Settings, UsersRound } from '@lucide/svelte';
	import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';
	import type { DutyRosterTemplateSetupOptions } from '$features/duty-roster/templates/dutyRosterTemplates';
	import { resolveDutyRosterPool } from '$features/duty-roster/templates/dutyRosterPool';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	let {
		basePath,
		templates,
		setupOptions = null
	}: {
		basePath: string;
		templates: DutyRosterTemplate[];
		setupOptions?: DutyRosterTemplateSetupOptions | null;
	} = $props();

	let selectedTemplateId = $state<string | null>(null);

	const templateRows = $derived(
		templates.map((template) => {
			const resolvedPool = setupOptions
				? resolveDutyRosterPool({ criteria: template.poolCriteria, personnel: setupOptions.personnel })
				: [];
			const exemptIds = new Set(template.exemptPersonnelIds);
			const eligiblePoolCount = setupOptions ? resolvedPool.filter((person) => !exemptIds.has(person.id)).length : null;

			return {
				template,
				poolCount: eligiblePoolCount,
				resolvedPoolCount: setupOptions ? resolvedPool.length : null,
				exemptCount: template.exemptPersonnelIds.length
			};
		})
	);

	const selectedRow = $derived(
		templateRows.find((row) => row.template.id === selectedTemplateId) ?? templateRows[0] ?? null
	);

	$effect(() => {
		if (templates.length === 0) {
			selectedTemplateId = null;
			return;
		}

		if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
			selectedTemplateId = templates[0].id;
		}
	});

	function formatUpdatedAt(value: string): string {
		if (!value) return 'Not recorded';

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Not recorded';

		const day = date.toLocaleDateString('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
		const time = date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});

		return `${day.toUpperCase()} ${time}`;
	}

	function describePool(template: DutyRosterTemplate): string {
		const activeFilters = [
			template.poolCriteria.rankValues.length ? `${template.poolCriteria.rankValues.length} rank filters` : null,
			template.poolCriteria.groupIds.length ? `${template.poolCriteria.groupIds.length} group filters` : null,
			template.poolCriteria.mosValues.length ? `${template.poolCriteria.mosValues.length} MOS filters` : null,
			template.poolCriteria.dutyRoleValues.length
				? `${template.poolCriteria.dutyRoleValues.length} duty role filters`
				: null
		].filter(Boolean);

		return activeFilters.length ? activeFilters.join(', ') : 'All active personnel';
	}
</script>

<section class="grid min-h-inherit flex-1 grid-rows-[auto_1fr] gap-0" aria-labelledby="template-register-heading">
	<div class="flex h-14 max-h-14 items-center justify-end gap-4 px-4" style="align-self: start;">
		<h2 id="template-register-heading" class="sr-only">Duty Roster Templates</h2>
		<Button href={`${basePath}/new`}>New Template</Button>
	</div>

	{#if templates.length === 0}
		<div class="grid place-items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
			<p class="font-medium text-foreground">No templates yet</p>
			<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
		</div>
	{:else}
		<div class="grid min-h-0 border-t border-border bg-card lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
			<div class="min-w-0 overflow-x-auto">
				<table class="w-full text-sm" role="table" aria-label="Duty Roster Template register">
					<thead>
						<tr class="border-b border-border bg-muted/50">
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Template</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Pool</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Updated</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each templateRows as row (row.template.id)}
							<tr
								class={[
									'border-b border-border transition-colors',
									selectedRow?.template.id === row.template.id && 'bg-muted/50'
								]}
							>
								<td class="px-4 py-2.5">
									<button
										class="flex cursor-pointer flex-col items-start gap-0.5 bg-transparent text-left"
										type="button"
										aria-pressed={selectedRow?.template.id === row.template.id}
										onclick={() => (selectedTemplateId = row.template.id)}
									>
										<span class="text-sm font-semibold text-foreground">{row.template.name}</span>
										<span class="text-xs text-muted-foreground">{row.template.shortCode ?? row.template.slug}</span>
									</button>
								</td>
								<td class="px-4 py-2.5" role="cell">
									<span class="text-sm text-foreground">{row.poolCount === null ? 'Not loaded' : `${row.poolCount} personnel`}</span>
									<span class="block text-xs text-muted-foreground">{describePool(row.template)}</span>
								</td>
								<td class="px-4 py-2.5 text-xs text-muted-foreground" role="cell">
									{formatUpdatedAt(row.template.updatedAt)}
								</td>
								<td class="px-4 py-2.5" role="cell" aria-label={`${row.template.name} quick actions`}>
									<div class="flex items-center gap-1">
										<Button variant="outline" size="sm" href={`${basePath}/${row.template.slug}/generate`}>
											<Play size={14} aria-hidden="true" />
											Generate
										</Button>
										<Button variant="outline" size="sm" href={`${basePath}/${row.template.slug}/history`}>
											<History size={14} aria-hidden="true" />
											History
										</Button>
										<Button variant="outline" size="sm" href={`${basePath}/${row.template.slug}/settings`}>
											<Settings size={14} aria-hidden="true" />
											Settings
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if selectedRow}
				<aside class="grid content-start gap-4 border-l border-border bg-muted/20 p-4" aria-label={`${selectedRow.template.name} template details`}>
					<div class="flex items-start justify-between gap-3">
						<div>
							<h3 class="text-sm font-semibold text-foreground">{selectedRow.template.name}</h3>
							<p class="text-xs text-muted-foreground">{selectedRow.template.shortCode ?? selectedRow.template.slug}</p>
						</div>
						<Badge variant="success">{selectedRow.template.status}</Badge>
					</div>

					<div class="grid gap-2 border-t border-border pt-3">
						<span class="text-xs font-medium text-muted-foreground">Template Slug</span>
						<p class="text-xs font-medium text-foreground" style="overflow-wrap: anywhere;">{selectedRow.template.slug}</p>
					</div>

					<div class="grid gap-2 border-t border-border pt-3">
						<div class="flex items-center justify-between gap-3">
							<span class="text-xs font-medium text-muted-foreground">Pool Summary</span>
							<UsersRound size={14} class="text-muted-foreground" aria-hidden="true" />
						</div>
						<dl class="grid gap-1.5">
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-xs text-muted-foreground">Pool</dt>
								<dd class="text-xs font-medium text-foreground">{selectedRow.poolCount === null ? 'Not loaded' : selectedRow.poolCount}</dd>
							</div>
							{#if selectedRow.resolvedPoolCount !== null}
								<div class="flex items-baseline justify-between gap-3">
									<dt class="text-xs text-muted-foreground">Before Exemptions</dt>
									<dd class="text-xs font-medium text-foreground">{selectedRow.resolvedPoolCount}</dd>
								</div>
							{/if}
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-xs text-muted-foreground">Exempt</dt>
								<dd class="text-xs font-medium text-foreground">{selectedRow.exemptCount}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-xs text-muted-foreground">Updated</dt>
								<dd class="text-xs font-medium text-foreground">{formatUpdatedAt(selectedRow.template.updatedAt)}</dd>
							</div>
						</dl>
					</div>

					<div class="mt-auto grid gap-2">
						<Button href={`${basePath}/${selectedRow.template.slug}/generate`}>
							<Play size={16} aria-hidden="true" />
							Open Generate
						</Button>
						<Button variant="outline" href={`${basePath}/${selectedRow.template.slug}/history`}>
							<History size={16} aria-hidden="true" />
							Open History
						</Button>
					</div>

					<p class="border-t border-border pt-3 text-xs text-muted-foreground">
						Pool rules are managed in Template Settings.
					</p>
				</aside>
			{/if}
		</div>
	{/if}
</section>
