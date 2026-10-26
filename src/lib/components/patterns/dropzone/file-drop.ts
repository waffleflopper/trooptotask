import type { Attachment } from 'svelte/attachments';

/** Turns an element into a file drop target, so a row or a card can take a drop without being a Dropzone. */
export function fileDrop(options: {
	/** Called with every file dropped; the owner decides which it can take. */
	onFiles: (files: File[]) => void;
	/** True from the first drag over the element until it leaves or drops. */
	onDraggingChange?: (dragging: boolean) => void;
}): Attachment<HTMLElement> {
	return (node) => {
		function acceptsDrag(event: DragEvent) {
			return event.dataTransfer?.types.includes('Files') === true;
		}

		function dragOver(event: DragEvent) {
			if (!acceptsDrag(event)) return;
			event.preventDefault();
			options.onDraggingChange?.(true);
		}

		function dragLeave(event: DragEvent) {
			if (!node.contains(event.relatedTarget as Node | null)) options.onDraggingChange?.(false);
		}

		function drop(event: DragEvent) {
			event.preventDefault();
			options.onDraggingChange?.(false);
			const files = [...(event.dataTransfer?.files ?? [])];
			if (files.length > 0) options.onFiles(files);
		}

		node.addEventListener('dragenter', dragOver);
		node.addEventListener('dragover', dragOver);
		node.addEventListener('dragleave', dragLeave);
		node.addEventListener('drop', drop);
		return () => {
			node.removeEventListener('dragenter', dragOver);
			node.removeEventListener('dragover', dragOver);
			node.removeEventListener('dragleave', dragLeave);
			node.removeEventListener('drop', drop);
		};
	};
}
