<script lang="ts">
	import { Button } from './index.js';

	let submitted = $state(0);
</script>

<form
	onsubmit={(event) => {
		event.preventDefault();
		submitted += 1;
	}}
>
	<Button>Preview</Button>
	<Button type="submit">Save</Button>
</form>
<Button href="/reports">Reports</Button>
<Button href="/exports" disabled>Exports</Button>
<output aria-label="Submissions">{submitted}</output>
