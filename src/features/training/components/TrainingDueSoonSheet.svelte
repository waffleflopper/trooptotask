<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import type { TrainingType } from '../training.types';
	import type { TrainingDueSoon, TrainingDueSoonPerson } from '../utils/dueSoon';

	interface Props {
		/** Null while the lists are still loading. */
		dueSoon: readonly TrainingDueSoon[] | null;
		personnel: readonly Personnel[];
		trainingTypes: readonly TrainingType[];
		/** The Organization's calendar day, "YYYY-MM-DD". */
		asOf: string;
		/** Present where the viewer may record training. */
		onRecordClass?: (trainingTypeId: string) => void;
		onClose: () => void;
	}

	let { dueSoon, personnel, trainingTypes, asOf, onRecordClass, onClose }: Props = $props();

	const peopleById = $derived(new Map(personnel.map((person) => [person.id, person])));
	const typesById = $derived(new Map(trainingTypes.map((type) => [type.id, type])));
	const total = $derived(dueSoon?.reduce((sum, entry) => sum + entry.people.length, 0) ?? 0);

	const TONE: Record<TrainingDueSoonPerson['status'], string> = {
		'warning-orange': 'bg-warning/25 text-warning-foreground ring-1 ring-warning ring-inset',
		'warning-yellow': 'text-warning-foreground ring-1 ring-warning ring-inset'
	};

	function expiresOn(daysLeft: number): string {
		return formatDayMonthYear(fromDayNumber(toDayNumber(asOf) + daysLeft));
	}

	function daysLabel(daysLeft: number): string {
		return daysLeft === 0 ? 'Today' : `${daysLeft}d left`;
	}

	function nameOf(person: Personnel): string {
		return `${person.rank} ${person.lastName}, ${person.firstName}`;
	}
</script>

<AppDialog.Root open {onClose}>
	<AppDialog.Content presentation="sheet">
		<AppDialog.Header class="border-b px-5 pt-5 pb-4 sm:px-7">
			<p
				class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
			>
				Training
			</p>
			<AppDialog.Title>Due soon</AppDialog.Title>
			<AppDialog.Description>Soldiers whose training is about to expire.</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="flex flex-col gap-6 px-5 py-6 sm:px-7" aria-busy={dueSoon === null}>
			{#if dueSoon === null}
				<div role="status" aria-live="polite" aria-label="Loading due soon training" class="flex flex-col gap-3">
					{#each Array.from({ length: 5 }) as _, index (index)}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			{:else if total === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>Nothing is due soon.</Empty.Title>
						<Empty.Description>No one is inside a training warning window.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				{#each dueSoon as entry (entry.trainingTypeId)}
					{@const type = typesById.get(entry.trainingTypeId)}
					{#if type}
						<section class="flex flex-col gap-2" aria-labelledby="due-soon-{type.id}">
							<header class="flex items-center justify-between gap-3">
								<h3 id="due-soon-{type.id}" class="flex min-w-0 items-center gap-2 text-sm font-semibold">
									<span class="size-2 shrink-0 rounded-sm" style:background-color={type.color} aria-hidden="true"
									></span>
									<span class="truncate">{type.name}</span>
									<span class="font-mono text-xs font-normal text-muted-foreground">{entry.people.length}</span>
								</h3>
								{#if onRecordClass}
									<Button type="button" variant="outline" size="xs" onclick={() => onRecordClass(type.id)}>
										Record class
									</Button>
								{/if}
							</header>
							<ul class="flex flex-col divide-y rounded-md border">
								{#each entry.people as row (row.personnelId)}
									{@const person = peopleById.get(row.personnelId)}
									{#if person}
										<li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
											<span class="flex min-w-0 flex-col">
												<span class="truncate">{nameOf(person)}</span>
												<span class="font-mono text-xs text-muted-foreground">Expires {expiresOn(row.daysLeft)}</span>
											</span>
											<span class="shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-bold {TONE[row.status]}">
												{daysLabel(row.daysLeft)}
											</span>
										</li>
									{/if}
								{/each}
							</ul>
						</section>
					{/if}
				{/each}
			{/if}
		</AppDialog.Body>
	</AppDialog.Content>
</AppDialog.Root>
