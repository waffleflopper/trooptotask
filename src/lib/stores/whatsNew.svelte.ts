let showWhatsNew = $state(false);

export const whatsNewStore = {
	get open() { return showWhatsNew; },
	show() { showWhatsNew = true; },
	close() { showWhatsNew = false; }
};
