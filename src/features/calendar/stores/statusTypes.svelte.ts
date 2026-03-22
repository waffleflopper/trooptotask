import { defineStore } from '$lib/stores/core';
import type { StatusType } from '$lib/types';

const _base = defineStore<StatusType>({ table: 'status_types' });

export const statusTypesStore = {
	get list(): StatusType[] {
		return _base.items;
	},
	load: _base.load,
	add: _base.add,
	update: _base.update,
	remove: _base.removeBool,
	getById: _base.getById
};
