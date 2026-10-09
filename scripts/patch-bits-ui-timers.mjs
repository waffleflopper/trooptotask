import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function patchFile({ filePath, patchName, replacements }) {
	if (!existsSync(filePath)) {
		throw new Error(`[patch-bits-ui] Patch target missing for ${patchName}: ${filePath}`);
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

// Each retained transformation has a public regression test; drop this gate only when none remain.
const auditedBitsUiVersion = '2.19.5';
const bitsUiPackageRoot = join(process.cwd(), 'node_modules', 'bits-ui');
const bitsUiPackageJsonPath = join(bitsUiPackageRoot, 'package.json');
const bitsUiPackageDist = join(bitsUiPackageRoot, 'dist');
const bitsUiDist = join(bitsUiPackageDist, 'bits');

function assertAuditedBitsUiVersion() {
	if (!existsSync(bitsUiPackageJsonPath)) {
		throw new Error(`[patch-bits-ui] bits-ui package.json not found at ${bitsUiPackageJsonPath}`);
	}

	const packageJson = JSON.parse(readFileSync(bitsUiPackageJsonPath, 'utf8'));
	if (packageJson.version !== auditedBitsUiVersion) {
		throw new Error(
			`[patch-bits-ui] Refusing to patch bits-ui ${packageJson.version ?? 'unknown'}; audited version is ${auditedBitsUiVersion}.`
		);
	}
}

assertAuditedBitsUiVersion();

// Unfixed upstream: completing a cross-month range recenters on the start and strands focus.
// Remove with the unused range-calendar family (D02).
patchFile({
	patchName: 'range calendar start placeholder synchronization',
	filePath: join(bitsUiDist, 'range-calendar', 'range-calendar.svelte.js'),
	replacements: [
		{
			original: `        watch(() => this.opts.value.current, (value) => {
            const startValue = value.start;
            if (startValue && this.opts.placeholder.current !== startValue) {`,
			patched: `        watch(() => this.opts.value.current.start, (startValue, previousStartValue) => {
            if (startValue && startValue !== previousStartValue && this.opts.placeholder.current !== startValue) {`
		}
	]
});

// Unfixed upstream (huntabyte/bits-ui#2146): a superseded animation run can still fire its callback.
patchFile({
	patchName: 'presence animation tick cleanup',
	filePath: join(bitsUiPackageDist, 'internal', 'animations-complete.js'),
	replacements: [
		{
			original: `        const executeIfCurrent = () => {
            if (runId !== this.#runId)
                return;
            this.#executeCallback(fn);
        };`,
			patched: `        const executeIfCurrent = () => {
            if (runId !== this.#runId)
                return;
            this.#executeCallback(fn, runId);
        };`
		},
		{
			original: `    #executeCallback(fn) {
        const execute = () => {
            fn();
        };`,
			patched: `    #executeCallback(fn, runId = this.#runId) {
        const execute = () => {
            if (runId !== this.#runId)
                return;
            fn();
        };`
		}
	]
});

// Unfixed upstream: the deferred autofocus reads the content ref after an immediate unmount.
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
