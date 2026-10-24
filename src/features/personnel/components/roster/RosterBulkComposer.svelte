<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Popover from '$lib/components/ui/popover';
	import { withinOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { ComposerEntry, ComposerKind } from '../../rosterComposer';
	import { saveRosterEntryBatch } from '../../workspace/rosterEntrySave';
	import RosterComposer from './RosterComposer.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		personnelIds: string[];
		skipped: number;
		heading: string;
		anchor: string;
		initialKind: ComposerKind;
		onclose: () => void;
	}

	let { ctx, personnelIds, skipped, heading, anchor, initialKind, onclose }: Props = $props();

	let open = $state(true);
	let composer = $state<RosterComposer>();
	let alive = true;
	let leaving = false;
	onDestroy(() => {
		alive = false;
	});

	export function requestClose(then?: () => void): boolean {
		return composer?.requestClose(then) ?? true;
	}

	function close(): void {
		open = false;
		onclose();
	}

	const today = untrack(() => ctx.signals.viewerDay());
	const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`;

	async function save(entry: ComposerEntry): Promise<void> {
		const result = await withinOrganizationLifetime(
			saveRosterEntryBatch(fetch, ctx.orgId, personnelIds, entry),
			() => alive
		);
		ctx.peek.invalidate(result.writtenIds, [entry.kind === 'follow-up' ? 'followUps' : 'note']);
		if (entry.kind === 'follow-up' && result.writtenIds.length) void ctx.signals.refresh(result.writtenIds);
		const left = skipped + result.unavailableIds.length;
		const written = `${entry.kind === 'follow-up' ? 'Follow-up' : 'Note'} added for ${people(result.writtenIds.length)}`;
		const message = left ? `${written} · ${people(left)} skipped` : written;
		if (result.writtenIds.length) toastStore.success(message, 6000);
		else toastStore.warning(`Nothing was added · ${people(left)} skipped`);
		close();
	}

	beforeNavigate((navigation) => {
		if (leaving || !composer?.hasDraft()) return;
		navigation.cancel();
		if (navigation.willUnload || !navigation.to) return;
		const { url } = navigation.to;
		const delta = navigation.type === 'popstate' ? navigation.delta : undefined;
		composer.requestClose(() => {
			leaving = true;
			if (delta) history.go(delta);
			else void goto(resolve((url.pathname + url.search + url.hash) as '/'));
		});
	});

	function keepOpenUnlessClean(event: Event): void {
		event.preventDefault();
		composer?.requestClose();
	}
</script>

<Popover.Root bind:open>
	<Popover.Content
		customAnchor={anchor}
		side="top"
		align="center"
		sideOffset={8}
		collisionPadding={8}
		role="dialog"
		aria-label="Add to log for {heading}"
		class="max-h-(--bits-popover-content-available-height) w-[min(26.25rem,calc(100vw-1rem))] gap-0 overflow-y-auto p-0"
		onOpenAutoFocus={(event) => event.preventDefault()}
		onCloseAutoFocus={(event) => event.preventDefault()}
		onEscapeKeydown={keepOpenUnlessClean}
		onInteractOutside={keepOpenUnlessClean}
	>
		<RosterComposer
			bind:this={composer}
			{heading}
			{today}
			alreadyOpen={{ kind: 'none' }}
			{initialKind}
			onsave={save}
			onclose={close}
		/>
	</Popover.Content>
</Popover.Root>
