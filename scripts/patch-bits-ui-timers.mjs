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

const bitsUiPackageDist = join(process.cwd(), 'node_modules', 'bits-ui', 'dist');
const bitsUiDist = join(bitsUiPackageDist, 'bits');

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
	patchName: 'dismissible layer focus tick cleanup',
	filePath: join(bitsUiDist, 'utilities', 'dismissible-layer', 'use-dismissable-layer.svelte.js'),
	replacements: [
		{
			original: `    #handleFocus = (event) => {
        if (event.defaultPrevented)
            return;
        if (!this.opts.ref.current)
            return;
        afterTick(() => {
            if (!this.opts.ref.current || this.#isTargetWithinLayer(event.target))
                return;
            if (event.target && !this.#isFocusInsideDOMTree) {
                this.#onFocusOutside.current?.(event);
            }
        });
    };`,
			patched: `    #handleFocus = (event) => {
        if (event.defaultPrevented)
            return;
        const layerNode = this.opts.ref.current;
        if (!layerNode)
            return;
        afterTick(() => {
            if (!globalThis.bitsDismissableLayers.has(this) || isOrContainsTarget(layerNode, event.target))
                return;
            if (event.target && !this.#isFocusInsideDOMTree) {
                this.#onFocusOutside.current?.(event);
            }
        });
    };`
		}
	]
});

patchFile({
	patchName: 'menu deferred focus cleanup',
	filePath: join(bitsUiDist, 'menu', 'menu.svelte.js'),
	replacements: [
		{
			original: `    #timer = 0;
    #handleTypeaheadSearch;
    mounted = $state(false);
    #isSub;`,
			patched: `    #timer = 0;
    #handleTypeaheadSearch;
    mounted = $state(false);
    #isSub;
    #destroyed = false;`
		},
		{
			original: `        this.rovingFocusGroup = new RovingFocusGroup({
            rootNode: boxWith(() => this.parentMenu.contentNode),
            candidateAttr: this.parentMenu.root.getBitsAttr("item"),
            loop: this.opts.loop,
            orientation: boxWith(() => "vertical"),
        });`,
			patched: `        this.rovingFocusGroup = new RovingFocusGroup({
            rootNode: boxWith(() => this.parentMenu.contentNode),
            candidateAttr: this.parentMenu.root.getBitsAttr("item"),
            loop: this.opts.loop,
            orientation: boxWith(() => "vertical"),
        });
        onDestroyEffect(() => {
            this.#destroyed = true;
        });`
		},
		{
			original: `            const handler = () => {
                afterTick(() => {
                    if (!this.parentMenu.root.isUsingKeyboard.current)
                        return;
                    this.rovingFocusGroup.focusFirstCandidate();
                });
            };`,
			patched: `            const handler = () => {
                const isUsingKeyboard = this.parentMenu.root.isUsingKeyboard.current;
                afterTick(() => {
                    if (this.#destroyed || !isUsingKeyboard)
                        return;
                    this.rovingFocusGroup.focusFirstCandidate();
                });
            };`
		},
		{
			original: `    onfocus(_) {
        if (!this.parentMenu.root.isUsingKeyboard.current)
            return;
        afterTick(() => this.rovingFocusGroup.focusFirstCandidate());
    }`,
			patched: `    onfocus(_) {
        if (!this.parentMenu.root.isUsingKeyboard.current)
            return;
        afterTick(() => {
            if (this.#destroyed)
                return;
            this.rovingFocusGroup.focusFirstCandidate();
        });
    }`
		},
		{
			original: `    #isFocused = $state(false);
    constructor(opts, content) {
        this.opts = opts;`,
			patched: `    #isFocused = $state(false);
    #destroyed = false;
    constructor(opts, content) {
        this.opts = opts;`
		},
		{
			original: `        this.onfocus = this.onfocus.bind(this);
        this.onblur = this.onblur.bind(this);
    }`,
			patched: `        this.onfocus = this.onfocus.bind(this);
        this.onblur = this.onblur.bind(this);
        onDestroyEffect(() => {
            this.#destroyed = true;
        });
    }`
		},
		{
			original: `    onfocus(e) {
        afterTick(() => {
            if (e.defaultPrevented || this.opts.disabled.current)
                return;
            this.#isFocused = true;
        });
    }
    onblur(e) {
        afterTick(() => {
            if (e.defaultPrevented)
                return;
            this.#isFocused = false;
        });
    }`,
			patched: `    onfocus(e) {
        const disabled = this.opts.disabled.current;
        afterTick(() => {
            if (this.#destroyed || e.defaultPrevented || disabled)
                return;
            this.#isFocused = true;
        });
    }
    onblur(e) {
        afterTick(() => {
            if (this.#destroyed || e.defaultPrevented)
                return;
            this.#isFocused = false;
        });
    }`
		}
	]
});

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
