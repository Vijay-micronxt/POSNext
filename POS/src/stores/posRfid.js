/**
 * RFID counter mode (optional).
 *
 * Active only when the rfid_retail app is installed and the POS Profile is an
 * RFID counter there. Tray reads go to an RFID basket on the server; every
 * complete sellable unit (a single garment, or a set with all its pieces read)
 * is added to the normal POS cart - with its serial number, or as one more
 * unit of the item when the item has no serial numbers. Incomplete sets stay
 * in the tray panel and block payment. The server re-checks everything on submit.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { call } from "@/utils/apiWrapper";
import { logger } from "@/utils/logger";

const log = logger.create("RFID");

export const usePosRfidStore = defineStore("posRfid", () => {
	const config = ref({ enabled: false });
	const profile = ref(null);
	const basket = ref(null);
	const lines = ref([]);
	const events = ref([]);
	const busy = ref(false);
	// serial_no -> true once it has been pushed into the cart
	const inCart = ref(new Set());
	// Units on their way off the basket; never pushed back into the cart meanwhile.
	const removing = new Set();
	// Basket calls run one after another, so an older reply never overwrites a newer one
	// (two removals answering out of order brought a removed unit back into the cart).
	let queue = Promise.resolve();
	function serial(fn) {
		const run = queue.then(fn);
		queue = run.catch(() => {});
		return run;
	}

	const enabled = computed(() => !!config.value.enabled);
	const incomplete = computed(() => lines.value.filter((l) => !l.complete));
	const blocked = computed(() => enabled.value && incomplete.value.length > 0);
	const requireScan = computed(
		() => enabled.value && !!config.value.require_scan,
	);
	// Hand-picked RFID items checked against untagged stock (RFID Settings switch).
	const handPickCheck = computed(
		() => enabled.value && !!config.value.hand_pick_check,
	);

	function applyView(view) {
		basket.value = view.basket;
		lines.value = view.lines || [];
	}

	async function load(posProfile) {
		profile.value = posProfile;
		reset(false);
		try {
			config.value = (await call("pos_next.api.rfid.get_rfid_config", {
				pos_profile: posProfile,
			})) || {
				enabled: false,
			};
		} catch (error) {
			log.warn("RFID config unavailable, staying in normal mode", error);
			config.value = { enabled: false };
		}
		if (enabled.value) await openBasket();
	}

	async function openBasket() {
		applyView(
			await call("rfid_retail.api.pos.open_basket", {
				pos_profile: profile.value,
				device: config.value.device || null,
			}),
		);
		// Units already on a resumed basket are not in this fresh cart yet.
		inCart.value = new Set();
	}

	async function scan(codes, source = "RFID") {
		if (!enabled.value || !codes.length) return null;
		busy.value = true;
		try {
			return await serial(async () => {
				if (!basket.value) await openBasket();
				const view = await call("rfid_retail.api.pos.scan", {
					basket: basket.value,
					codes,
					source,
				});
				applyView(view);
				events.value = view.events || [];
				return view;
			});
		} finally {
			busy.value = false;
		}
	}

	/** key = the unit's serial, or the tag itself for an item without serial numbers. */
	async function removeUnit(key) {
		if (!basket.value || removing.has(key)) return;
		removing.add(key);
		try {
			await serial(async () => {
				if (!basket.value) return;
				applyView(
					await call("rfid_retail.api.pos.remove_unit", {
						basket: basket.value,
						key,
					}),
				);
				inCart.value.delete(key);
			});
		} finally {
			removing.delete(key);
		}
	}

	const keyOf = (line) => line.key || line.serial_no;

	/** Lines complete on the tray but not yet in the cart. */
	function pendingForCart() {
		return lines.value.filter(
			(l) =>
				l.complete && !inCart.value.has(keyOf(l)) && !removing.has(keyOf(l)),
		);
	}

	/** Tags of non-serial units already pushed into the cart, per item. */
	function itemTagsInCart(itemCode) {
		return lines.value
			.filter(
				(l) =>
					!l.serial_no &&
					l.item_code === itemCode &&
					inCart.value.has(keyOf(l)) &&
					!removing.has(keyOf(l)),
			)
			.map(keyOf);
	}

	function markInCart(key) {
		inCart.value.add(key);
	}

	/** Invoice header fields that tie the sale to this basket. */
	function invoiceExtras() {
		return enabled.value && basket.value
			? { custom_rfid_basket: basket.value }
			: {};
	}

	function reset(reopen = true) {
		basket.value = null;
		lines.value = [];
		events.value = [];
		inCart.value = new Set();
		if (reopen && enabled.value)
			openBasket().catch((e) => log.error("Could not open next basket", e));
	}

	/** Cart was emptied by the cashier: release every unit held on the tray. */
	async function clearBasket() {
		if (!enabled.value || !basket.value) return;
		const current = basket.value;
		// Cleared synchronously so the cart watcher does not remove units one by one.
		inCart.value = new Set();
		try {
			await call("rfid_retail.api.pos.cancel_basket", { basket: current });
		} finally {
			reset(true);
		}
	}

	return {
		config,
		basket,
		lines,
		events,
		busy,
		inCart,
		enabled,
		incomplete,
		blocked,
		requireScan,
		handPickCheck,
		load,
		scan,
		removeUnit,
		pendingForCart,
		itemTagsInCart,
		keyOf,
		markInCart,
		invoiceExtras,
		reset,
		clearBasket,
	};
});
