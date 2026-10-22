<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { Dropzone } from '$lib/components/patterns/dropzone';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { ACCEPTED_EXTENSIONS } from '../workbookSource';
	import type { FlowSession } from '../flowTypes';

	let { session }: { session: FlowSession } = $props();

	const phase = $derived(session.phase.step === 'file' ? session.phase : null);
	const columns = $derived(Object.values(session.lane.columns));
	const splitters = $derived(session.lane.splitters ?? []);

	function otherNames(column: (typeof columns)[number]) {
		return column.aliases.filter((alias) => alias !== column.label.toLowerCase()).slice(0, 3);
	}
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="grid content-start gap-3">
		<Dropzone
			class="min-h-64 justify-center"
			title="Drop a spreadsheet here"
			hint="or choose a file · {ACCEPTED_EXTENSIONS.join(' · ')}"
			accept={ACCEPTED_EXTENSIONS.join(',')}
			error={phase?.error ?? null}
			onFiles={(files) => void session.chooseFile(files)}
		/>
		<div class="flex flex-wrap items-center gap-3">
			{#if phase?.reading}
				<span class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
					<Spinner class="size-4" /> Reading the file…
				</span>
			{/if}
			<Button variant="outline" class="ml-auto" onclick={() => void session.downloadTemplate()}>
				<DownloadIcon data-icon="inline-start" />
				Template (.xlsx)
			</Button>
		</div>
	</div>
	<aside class="grid content-start gap-3" aria-labelledby="import-columns-heading">
		<h2
			id="import-columns-heading"
			class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
		>
			Columns we look for
		</h2>
		<ul class="grid divide-y rounded-md border">
			{#each columns as column (column.label)}
				<li class="grid gap-0.5 px-3 py-2">
					<span class="flex items-center gap-2 text-sm font-medium">
						{column.label}
						<Badge variant={column.required ? 'warning' : 'outline'}>{column.required ? 'Required' : 'Optional'}</Badge>
					</span>
					{#if column.hint || otherNames(column).length}
						<span class="text-xs text-muted-foreground">
							{column.hint ?? `Also read as ${otherNames(column).join(', ')}`}
						</span>
					{/if}
				</li>
			{/each}
			{#each splitters as splitter (splitter.label)}
				<li class="grid gap-0.5 px-3 py-2">
					<span class="text-sm font-medium">{splitter.label}</span>
					<span class="text-xs text-muted-foreground">
						One column that fills {splitter.fills.map((field) => session.lane.columns[field].label).join(' and ')}.
					</span>
				</li>
			{/each}
		</ul>
		{#if session.lane.intro}
			<Alert.Root variant="info" role="note">
				<InfoIcon />
				<Alert.Title>{session.lane.intro.title}</Alert.Title>
				<Alert.Description>{session.lane.intro.body}</Alert.Description>
			</Alert.Root>
		{/if}
	</aside>
</div>
