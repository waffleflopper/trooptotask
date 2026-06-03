import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function patchFile({ filePath, patchName, replacements }) {
	if (!existsSync(filePath)) {
		console.warn(`[patch-bits-ui] Skipping ${patchName}: ${filePath} does not exist.`);
		return;
	}

	let source = readFileSync(filePath, 'utf8');
	const alreadyPatched = replacements.every(({ patched }) => source.includes(patched));
	if (alreadyPatched) {
		console.log(`[patch-bits-ui] ${patchName} patch already applied.`);
		return;
	}

	for (const { original, patched } of replacements) {
		if (!source.includes(original)) {
			throw new Error(`[patch-bits-ui] Could not find expected source for ${patchName}.`);
		}
		source = source.replace(original, patched);
	}

	writeFileSync(filePath, source);
	console.log(`[patch-bits-ui] Applied ${patchName} patch.`);
}

const bitsUiDist = join(process.cwd(), 'node_modules', 'bits-ui', 'dist', 'bits');

patchFile({
	patchName: 'dismissible layer timeout cleanup',
	filePath: join(bitsUiDist, 'utilities', 'dismissible-layer', 'use-dismissable-layer.svelte.js'),
	replacements: [
		{
			original: `        let unsubEvents = noop;
        const cleanup = () => {
            this.#resetState();`,
			patched: `        let unsubEvents = noop;
        let layerRegistrationTimeout;
        const cleanup = () => {
            if (layerRegistrationTimeout) {
                clearTimeout(layerRegistrationTimeout);
                layerRegistrationTimeout = undefined;
            }
            this.#resetState();`
		},
		{
			original: `            afterSleep(1, () => {
                if (!this.opts.ref.current)`,
			patched: `            if (layerRegistrationTimeout) {
                clearTimeout(layerRegistrationTimeout);
            }
            layerRegistrationTimeout = afterSleep(1, () => {
                layerRegistrationTimeout = undefined;
                if (!this.opts.ref.current)`
		}
	]
});

patchFile({
	patchName: 'alert dialog open autofocus timeout cleanup',
	filePath: join(bitsUiDist, 'alert-dialog', 'components', 'alert-dialog-content.svelte'),
	replacements: [
		{
			original: `		onOpenAutoFocus={(e) => {
			onOpenAutoFocus(e);
			if (e.defaultPrevented) return;
			e.preventDefault();
			afterSleep(0, () => contentState.opts.ref.current?.focus());
		}}`,
			patched: `		onOpenAutoFocus={(e) => {
			onOpenAutoFocus(e);
			if (e.defaultPrevented) return;
			e.preventDefault();
			const contentNode = contentState.opts.ref.current;
			afterSleep(0, () => contentNode?.focus());
		}}`
		}
	]
});
