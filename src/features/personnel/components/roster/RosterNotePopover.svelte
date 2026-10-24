<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Popover from '$lib/components/ui/popover';
	import { withinOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../../personnel.types';
	import { alreadyOpenOf, type ComposerEntry } from '../../rosterComposer';
	import { saveRosterEntry } from '../../workspace/rosterEntrySave';
	import RosterComposer from './RosterComposer.svelte';

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
	// A roster left open overnight still shows yesterday: the due shortcuts count from the viewer's day when this opens.
	const today = untrack(() => ctx.signals.viewerDay());
	const alreadyOpen = $derived(alreadyOpenOf(ctx.signalRow(person), today));

	/**
	 * Closes now, or asks to discard typed text. Returns false while it is waiting on the answer or a save.
	 * `then` runs after the close, and only if the user confirms a discard.
	 */
	export function requestClose(then?: () => void): boolean {
		return composer?.requestClose(then) ?? true;
	}

	function close(): void {
		open = false;
		onclose();
	}

	async function save(entry: ComposerEntry): Promise<void> {
		// The toast outlives this popover, and the props read through to page state that is cleared on close.
		const logHref = `${recordHref}/log`;
		// The write may land after the user left the Organization; the lifetime then never settles, so nothing follows.
		await withinOrganizationLifetime(saveRosterEntry(fetch, { orgId: ctx.orgId, personId: person.id }, entry));
		if (entry.kind === 'follow-up') void ctx.signals.refresh([person.id]);
		const subject = `${person.rank} ${person.lastName}`;
		toastStore.success(
			entry.kind === 'follow-up' ? `Follow-up added for ${subject}` : `Note added for ${subject}`,
			6000,
			ctx.canOpenPersonnelDetail(person) ? { label: 'Open log', onClick: () => void goto(logHref) } : undefined
		);
		if (alive) close();
	}

	// A row click, a name link or Back would unmount this and lose the draft: hold the navigation until Discard.
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
		// The Note button that opened this is a toggle: it closes through its own click.
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
