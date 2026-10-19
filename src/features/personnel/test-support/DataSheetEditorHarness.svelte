<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import PersonnelDataSheetEditor from '../components/PersonnelDataSheetEditor.svelte';
	import { provideDataSheetEditSession } from '../workspace/dataSheetEditSession.svelte';

	let props: ComponentProps<typeof PersonnelDataSheetEditor> = $props();
	const session = provideDataSheetEditSession();
</script>

<button type="button" onclick={session.save}>Save changes</button>
<button type="button" onclick={session.cancel}>Cancel</button>
<PersonnelDataSheetEditor {...props} />
