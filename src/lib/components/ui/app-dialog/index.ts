import Root from './app-dialog-root.svelte';
import Content from './app-dialog-content.svelte';
import Header from './app-dialog-header.svelte';
import Body from './app-dialog-body.svelte';
import Footer from './app-dialog-footer.svelte';
import * as Dialog from '$lib/components/ui/dialog';

const Title = Dialog.Title;
const Description = Dialog.Description;
const Trigger = Dialog.Trigger;
const Close = Dialog.Close;

export {
	Root,
	Content,
	Header,
	Title,
	Description,
	Body,
	Footer,
	Trigger,
	Close,
	//
	Root as AppDialog,
	Content as AppDialogContent,
	Header as AppDialogHeader,
	Title as AppDialogTitle,
	Description as AppDialogDescription,
	Body as AppDialogBody,
	Footer as AppDialogFooter,
	Trigger as AppDialogTrigger,
	Close as AppDialogClose
};
