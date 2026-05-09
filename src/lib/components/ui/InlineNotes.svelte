<script lang="ts">
	import { Root as InlineNotesRoot } from '$lib/components/ui/inline-notes/index.js';
	import type { InlineNote } from '$lib/components/ui/inline-notes/index.js';

	interface Props {
		notes: InlineNote[];
		onAddNote?: (text: string) => void;
		resolveAuthor: (userId: string) => string;
		disabled?: boolean;
	}

	let { notes, onAddNote, resolveAuthor, disabled = false }: Props = $props();
</script>

<InlineNotesRoot {notes} {onAddNote} {resolveAuthor} {disabled} />
