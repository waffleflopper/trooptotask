<script lang="ts">
	import { page } from '$app/state';
	import { startingNumbersStatusSchema, type StartingNumbersStatus } from '$features/calendar/contracts';
	import { da6SetupHref } from '$features/calendar/utils/da6View';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatDate } from '$lib/utils/dates';

	interface Props {
		typeId: string;
		shortName: string;
		/** Leaving for the DA 6 would drop unsaved changes in the sheet. */
		blocked: boolean;
	}

	let { typeId, shortName, blocked }: Props = $props();

	let read = $state.raw<{ typeId: string; attempt: number; status: StartingNumbersStatus | null | 'failed' } | null>(
		null
	);
	let attempt = $state(0);
	const status = $derived(read?.typeId === typeId && read.attempt === attempt ? read.status : 'loading');
	const orgId = $derived(page.params.orgId ?? '');

	$effect(() => {
		const requested = { typeId, attempt, orgId };
		let cancelled = false;
		fetch(
			`/org/${requested.orgId}/api/duty-rosters/starting-numbers?typeId=${requested.typeId}&today=${formatDate(new Date())}`
		)
			.then(async (res) => {
				if (!res.ok) throw new Error('Starting numbers unavailable');
				const parsed = startingNumbersStatusSchema.safeParse(await res.json());
				if (!parsed.success) throw new Error('Starting numbers unavailable');
				return parsed.data;
			})
			.then(
				(value) => {
					if (!cancelled) read = { typeId: requested.typeId, attempt: requested.attempt, status: value };
				},
				() => {
					if (!cancelled) read = { typeId: requested.typeId, attempt: requested.attempt, status: 'failed' };
				}
			);
		return () => {
			cancelled = true;
		};
	});

	const text = $derived.by(() => {
		if (typeof status !== 'object' || status === null) return '';
		if (status.state === 'carried')
			return 'Carried over from the last DA 6 when the roster rules changed. They’re part of the record.';
		if (status.state === 'locked')
			return status.numbered
				? `Copied from a paper DA 6. The first ${shortName} has been pulled, so they’re part of the record now.`
				: `Everyone started even. The first ${shortName} has been pulled, so that’s part of the record now.`;
		return status.numbered
			? `Copied from a paper DA 6. You can change them until the first ${shortName} is pulled.`
			: `Everyone starts even. Keeping a paper DA 6 already? You can copy it in until the first ${shortName} is pulled.`;
	});
</script>

{#if status !== null}
	<div class="flex items-center gap-4 rounded-lg border p-4" data-testid="starting-numbers">
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<span class="text-sm font-medium">Starting numbers</span>
			{#if status === 'loading'}
				<div role="status">
					<span class="sr-only">Loading starting numbers</span>
					<Skeleton class="mt-1 h-4 w-full" aria-hidden="true" />
					<Skeleton class="mt-1 h-4 w-2/3" aria-hidden="true" />
				</div>
			{:else if status === 'failed'}
				<p class="text-sm text-destructive" role="alert">The starting numbers could not be checked.</p>
			{:else}
				<p class="text-sm text-muted-foreground">
					{text}
					{#if status.state === 'editable' && blocked}Save or cancel your changes first.{/if}
				</p>
			{/if}
		</div>
		{#if status === 'failed'}
			<Button variant="outline" size="sm" onclick={() => attempt++}>Try again</Button>
		{:else if status !== 'loading' && status.state === 'editable'}
			{#if blocked}
				<Button variant="outline" size="sm" disabled>{status.numbered ? 'Change them' : 'Copy it in'}</Button>
			{:else}
				<Button variant="outline" size="sm" href={da6SetupHref(orgId, typeId)}>
					{status.numbered ? 'Change them' : 'Copy it in'}
				</Button>
			{/if}
		{/if}
	</div>
{/if}
