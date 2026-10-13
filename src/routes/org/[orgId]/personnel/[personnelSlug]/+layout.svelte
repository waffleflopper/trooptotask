<script lang="ts">
	import { page } from '$app/state';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import type { RouteTabItem } from '$lib/components/patterns/page-shell';
	import type { PersonnelDetailHeader } from '$features/personnel/contracts';

	interface LayoutData {
		shell:
			| { kind: 'ready'; org: { urlSegment: string; name: string } }
			| { kind: 'suspended'; org: { urlSegment: string; name: string } };
		personnelDetailHeader: PersonnelDetailHeader;
	}

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	const person = $derived(data.personnelDetailHeader.person);
	const displayName = $derived(`${person.rank} ${person.lastName}, ${person.firstName}`);
	const initials = $derived(`${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase());
	const shell = $derived(data.shell);
	const orgUrlSegment = $derived(shell.org.urlSegment);
	const detailBasePath = $derived(`/org/${orgUrlSegment}/personnel/${person.slug}`);
	const sections = [
		{ label: 'Dashboard', path: '' },
		{ label: 'Follow-ups', path: '/follow-ups' },
		{ label: 'Counselings', path: '/counselings' },
		{ label: 'Documents', path: '/documents' },
		{ label: 'Notes', path: '/notes' },
		{ label: 'Archived', path: '/archived' }
	] as const;
	const sectionTabs = $derived(
		sections.map(
			(section): RouteTabItem => ({
				label: section.label,
				href: `/org/${orgUrlSegment}/personnel/${person.slug}${section.path}`,
				active: page.route.id === `/org/[orgId]/personnel/[personnelSlug]${section.path}`
			})
		)
	);
	const toolbarItems = $derived<ToolbarItem[]>([
		{ kind: 'action', id: 'upload-pdf', label: 'Upload PDF', icon: 'file-plus', href: `${detailBasePath}/documents` },
		{ kind: 'action', id: 'roster', label: 'Roster', icon: 'arrow-left', href: `/org/${orgUrlSegment}/personnel` }
	]);
</script>

<section class="flex min-h-full flex-col bg-background text-foreground">
	<header class="px-6 pt-5">
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
					{person.groupName || shell.org.name} / {person.mos || 'No MOS'} / {person.clinicRole || 'No duty role'}
				</p>
			</div>
		</div>
		<div class="mt-4">
			<WorkspaceToolbar
				ariaLabel="Personnel record controls"
				items={toolbarItems}
				primary={{ kind: 'action', id: 'add-note', label: 'Add note', href: `${detailBasePath}/notes` }}
			/>
		</div>
		<PageShell.Tabs class="mt-5" items={sectionTabs} label="Personnel detail sections" />
	</header>

	{@render children()}
</section>
