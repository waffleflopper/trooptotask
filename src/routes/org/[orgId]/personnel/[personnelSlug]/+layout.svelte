<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { PersonnelDetailHeader } from '$features/personnel/personnel-detail.types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import FilePlus2Icon from '@lucide/svelte/icons/file-plus-2';

	interface LayoutData {
		orgId: string;
		orgUrlSegment?: string;
		orgName: string;
		personnelDetailHeader: PersonnelDetailHeader;
	}

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	const person = $derived(data.personnelDetailHeader.person);
	const displayName = $derived(`${person.rank} ${person.lastName}, ${person.firstName}`);
	const initials = $derived(`${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase());
	const orgUrlSegment = $derived(data.orgUrlSegment ?? data.orgId);
	const detailBasePath = $derived(`/org/${orgUrlSegment}/personnel/${person.slug}`);
</script>

<section class="flex min-h-full flex-col bg-background text-foreground">
	<header class="border-b px-6 py-5">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="flex min-w-0 items-center gap-4">
				<div
					class="grid size-20 shrink-0 place-items-center rounded-md border bg-muted text-2xl font-semibold"
					aria-hidden="true"
				>
					{initials}
				</div>
				<div class="min-w-0">
					<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Personnel view</p>
					<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">{displayName}</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						{person.groupName || data.orgName} / {person.mos || 'No MOS'} / {person.clinicRole || 'No duty role'}
					</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button href={`/org/${orgUrlSegment}/personnel`} variant="outline" size="sm">
					<ArrowLeftIcon aria-hidden="true" size={15} />
					Roster
				</Button>
				<Button href={`${detailBasePath}/documents`} variant="outline" size="sm">
					<FilePlus2Icon aria-hidden="true" size={15} />
					Upload PDF
				</Button>
				<Button href={`${detailBasePath}/notes`} size="sm">Add note</Button>
			</div>
		</div>
		<nav class="mt-5 flex flex-wrap gap-2" aria-label="Personnel detail sections">
			<Button href={detailBasePath} variant="ghost" size="sm">Dashboard</Button>
			<Button href={`${detailBasePath}/follow-ups`} variant="ghost" size="sm">Follow-ups</Button>
			<Button href={`${detailBasePath}/counselings`} variant="ghost" size="sm">Counselings</Button>
			<Button href={`${detailBasePath}/documents`} variant="ghost" size="sm">Documents</Button>
			<Button href={`${detailBasePath}/notes`} variant="ghost" size="sm">Notes</Button>
			<Button href={`${detailBasePath}/archived`} variant="ghost" size="sm">Archived</Button>
		</nav>
	</header>

	{@render children()}
</section>
