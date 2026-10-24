<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Popover from '$lib/components/ui/popover';
	import { withinOrganizationLifetime } from '$lib/stores/core';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../../personnel.types';
	import { alreadyOpenOf, type ComposerEntry } from '../../rosterComposer';
	import { saveRosterEntry } from '../../workspace/rosterEntrySave';
	import RosterComposer from './RosterComposer.svelte';
	import { rosterEntrySaved } from './rosterEntrySaved';

	interface Props {
		ctx: PersonnelPageContext;
		person: Personnel;
		recordHref: string;
		onclose: () => void;
	}

	let { ctx, person, recordHref, onclose }: Props = $props();

	let open = $state(true);
	let composer = $state<RosterComposer>();
	let alive = true;
	let leaving = false;
	onDestroy(() => {
		alive = false;
	});

	const name = $derived(`${person.rank} ${person.firstName} ${person.lastName}`);
	const today = untrack(() => ctx.signals.viewerDay());
	const alreadyOpen = $derived(alreadyOpenOf(ctx.signalRow(person), today));

	export function requestClose(then?: () => void): boolean {
		return composer?.requestClose(then) ?? true;
	}

	function close(): void {
		open = false;
		onclose();
	}

	async function save(entry: ComposerEntry): Promise<void> {
		const target = person;
		const href = recordHref;
		await withinOrganizationLifetime(saveRosterEntry(fetch, { orgId: ctx.orgId, personId: target.id }, entry));
		rosterEntrySaved(ctx, target, entry, href);
		if (alive) close();
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
		if ((event.target as Element | null)?.closest?.('[data-roster-note][aria-expanded="true"]')) return;
		composer?.requestClose();
	}
</script>

<Popover.Root bind:open>
	<Popover.Content
		customAnchor={`[data-roster-row="${CSS.escape(person.id)}"]`}
		side="bottom"
		align="end"
		sideOffset={4}
		collisionPadding={8}
		role="dialog"
		aria-label="Add to log for {name}"
		class="max-h-(--bits-popover-content-available-height) w-[min(26.25rem,calc(100vw-1rem))] gap-0 overflow-y-auto p-0"
		onOpenAutoFocus={(event) => event.preventDefault()}
		onCloseAutoFocus={(event) => event.preventDefault()}
		onEscapeKeydown={keepOpenUnlessClean}
		onInteractOutside={keepOpenUnlessClean}
	>
		<RosterComposer bind:this={composer} heading={name} {today} {alreadyOpen} onsave={save} onclose={close} />
	</Popover.Content>
</Popover.Root>
