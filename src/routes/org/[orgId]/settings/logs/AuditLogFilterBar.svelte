<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { auditLogFilterParams, hasAuditLogFilters, type AuditLogFilters } from '$lib/audit/auditLogFilters';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { LogsFilterOptions } from '../settingsSectionTypes';
	import { auditKindOptions } from './auditLogEntries';

	let { filters, options }: { filters: AuditLogFilters; options: Promise<LogsFilterOptions> } = $props();

	// A second change made before the first navigation commits builds on the first. Once new filters arrive
	// (a commit, or Back superseding the request), they are the truth and the pending set is dropped.
	let pending: AuditLogFilters | null = null;
	let latest = 0;
	$effect.pre(() => {
		void filters;
		pending = null;
	});

	function apply(change: AuditLogFilters) {
		const next = { ...(pending ?? filters), ...change };
		if (next.from && next.to && next.from > next.to) {
			if (change.from) next.to = next.from;
			else next.from = next.to;
		}
		const query = auditLogFilterParams(next).toString();
		const path = resolve('/org/[orgId]/settings/logs', { orgId: page.params.orgId ?? '' });
		const request = ++latest;
		pending = next;
		return goto(query ? `${path}?${query}` : path, { reset: false }).finally(() => {
			if (request === latest) pending = null;
		});
	}

	const labelClass = 'font-mono text-[11px] leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase';
</script>

{#snippet picker(
	name: string,
	label: string,
	placeholder: string,
	items: readonly Combobox.ComboboxItemInput[],
	value: string | undefined,
	choose: (next: string) => void
)}
	<div class="grid min-w-0 gap-1.5">
		<span class={labelClass}>{label}</span>
		<Combobox.Root {items} value={value ?? ''} {label} autoHighlight onValueChange={(next) => choose(String(next))}>
			<Combobox.Trigger clearable {placeholder} aria-label={label} data-testid="audit-filter-{name}" />
			<Combobox.Content>
				<Combobox.Search placeholder="Search {label.toLowerCase()}..." />
				<Combobox.Empty>No match.</Combobox.Empty>
				<Combobox.List />
			</Combobox.Content>
		</Combobox.Root>
	</div>
{/snippet}

{#snippet pickerShell(label: string)}
	<div class="grid min-w-0 gap-1.5">
		<span class={labelClass}>{label}</span>
		<Skeleton class="h-8 w-full" />
	</div>
{/snippet}

{#snippet date(key: 'from' | 'to', label: string)}
	<div class="grid min-w-0 gap-1.5">
		<div class="flex h-4 items-center justify-between gap-2">
			<span class={labelClass}>{label}</span>
			{#if filters[key]}
				<button
					type="button"
					class="rounded-sm font-mono text-[11px] leading-4 text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Clear {label.toLowerCase()} date"
					onclick={() => apply({ [key]: undefined })}
				>
					Clear
				</button>
			{/if}
		</div>
		<DatePicker
			value={filters[key] ?? ''}
			placeholder="Any day"
			aria-label={label}
			onValueChange={(next) => apply({ [key]: next || undefined })}
		/>
	</div>
{/snippet}

<div class="mb-4 grid gap-3 md:grid-cols-3" role="group" aria-label="Filter the audit log">
	{#await options}
		{@render pickerShell('Person')}
		{@render pickerShell('Member')}
		{@render pickerShell('Kind')}
	{:then known}
		{@const people = known.people.map((person) => ({
			value: person.id,
			label: person.label,
			description: person.archived ? 'Archived' : undefined
		}))}
		{@const members = known.members.map((member) => ({ value: member.userId, label: member.label }))}
		{@render picker(
			'person',
			'Person',
			'Anyone',
			filters.personId && !people.some((person) => person.value === filters.personId)
				? [...people, { value: filters.personId, label: 'Person no longer on the roster' }]
				: people,
			filters.personId,
			(personId) => apply({ personId: personId || undefined })
		)}
		{@render picker(
			'member',
			'Member',
			'Anyone',
			filters.userId && !members.some((member) => member.value === filters.userId)
				? [...members, { value: filters.userId, label: 'Former member' }]
				: members,
			filters.userId,
			(userId) => apply({ userId: userId || undefined })
		)}
		{@render picker(
			'kind',
			'Kind',
			'Any kind',
			auditKindOptions([...known.actions, ...(filters.kind ? [filters.kind] : [])]),
			filters.kind,
			(kind) => apply({ kind: kind || undefined })
		)}
	{:catch}
		<div class="flex flex-wrap items-center gap-3 md:col-span-3" role="alert">
			<p class="text-sm text-muted-foreground">The people, members and kinds could not be loaded.</p>
			<Button variant="outline" size="sm" onclick={() => invalidateAll()}>Retry</Button>
		</div>
	{/await}
	<div class="grid grid-cols-2 gap-3 md:col-span-2">
		{@render date('from', 'From')}
		{@render date('to', 'To')}
	</div>
	{#if hasAuditLogFilters(filters)}
		<div class="flex items-end md:justify-end">
			<Button
				variant="outline"
				onclick={() =>
					apply({ personId: undefined, userId: undefined, kind: undefined, from: undefined, to: undefined })}
			>
				Clear filters
			</Button>
		</div>
	{/if}
</div>
