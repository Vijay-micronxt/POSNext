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
	// item_code -> pieces approved on this basket to sell although their tag will not read
	const unread = ref({});
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
	// A piece whose tag is damaged or missing may be sold by hand, with a reason (RFID Settings switch).
	const unreadSale = computed(
		() => handPickCheck.value && !!config.value.unread_sale,
	);
	const unreadNeedsManager = computed(
		() => !!config.value.unread_needs_manager,
	);
	// self | pin | password | pin_or_password (who approves, and how)
	const unreadApproval = computed(
		() => config.value.unread_approval || (unreadNeedsManager.value ? "password" : "self"),
	);
	const unreadReasons = computed(
		() => config.value.unread_reasons || ["Tag Damaged", "Tag Missing"],
	);
	// The server can keep a held bill's basket (and the tags claimed on it) until the bill is resumed.
	const canHold = computed(() => enabled.value && !!config.value.hold);

	function applyView(view) {
		basket.value = view.basket;
		lines.value = view.lines || [];
		unread.value = view.unread || {};
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

	/** Approve pieces of an item whose tag will not read; throws with the server's message when refused. */
	async function approveUnread({ itemCode, qty = 1, reason, note, manager, password }) {
		return serial(async () => {
			if (!basket.value) await openBasket();
			const res = await call("rfid_retail.api.pos.approve_unread", {
				basket: basket.value,
				item_code: itemCode,
				qty,
				reason,
				note: note || null,
				manager: manager || null,
				password: password || null,
			});
			unread.value = res.unread || {};
			return res;
		});
	}

	/** Ask the approvers for a PIN; returns { request, expires_at, sent_to } (or the approval when none is needed). */
	async function requestUnreadPin({ itemCode, qty = 1, reason, note }) {
		return serial(async () => {
			if (!basket.value) await openBasket();
			const res = await call("rfid_retail.api.pos.request_unread_approval", {
				basket: basket.value,
				item_code: itemCode,
				qty,
				reason,
				note: note || null,
			});
			if (res.unread) unread.value = res.unread;
			return res;
		});
	}

	/** Type the PIN an approver gave; returns { status, error }. */
	async function confirmUnreadPin(request, pin) {
		const res = await call("rfid_retail.api.pos.confirm_unread_pin", { request, pin });
		if (res.unread) unread.value = res.unread;
		return res;
	}

	/** Polled while waiting: the approver may approve with one click instead. */
	async function unreadApprovalStatus(request) {
		const res = await call("rfid_retail.api.pos.unread_approval_status", { request });
		if (res.unread) unread.value = res.unread;
		return res;
	}

	const keyOf = (line) => line.key || line.serial_no;

	/** Every code read for a line: its tags (server sends them), else the tag or serial it is known by. */
	function lineCodes(line) {
		if (line.epcs?.length) return line.epcs;
		return [line.epc || line.serial_no].filter(Boolean);
	}

	/**
	 * Hold: what the draft needs to get this bill's tray back on resume. The basket is kept on the
	 * server when it can hold one; the codes read are kept too, to read them again into a new basket
	 * if the held one cannot be resumed. Null when nothing on the tray belongs to this bill.
	 */
	function holdState() {
		if (!enabled.value || !basket.value) return null;
		const hasUnread = Object.keys(unread.value || {}).length > 0;
		if (!lines.value.length && !hasUnread) return null;
		return {
			basket: canHold.value ? basket.value : null,
			keys: [...inCart.value],
			epcs: [...new Set(lines.value.flatMap(lineCodes))],
		};
	}

	/** Hold, step 1: park the basket on the server. Throws when it cannot, so the bill is not held. */
	async function hold(state) {
		if (!state?.basket) return;
		await serial(() => call("rfid_retail.api.pos.hold_basket", { basket: state.basket }));
	}

	/** The draft could not be saved after all: give the basket back to the bill on screen. */
	async function undoHold(state) {
		if (!state?.basket) return;
		await serial(() =>
			call("rfid_retail.api.pos.resume_basket", {
				basket: state.basket,
				pos_profile: profile.value,
			}),
		);
	}

	/**
	 * Hold, step 2, called right before the cart is cleared: forget this bill's units locally (so the
	 * cart watchers do not take them off the held basket) and start a new basket for the next bill.
	 * Without server support the basket is cancelled instead; the draft keeps the codes read.
	 */
	async function finishHold(state) {
		if (!enabled.value || !state) return; // nothing on the tray: the basket stays for the next bill
		const current = basket.value;
		inCart.value = new Set(); // synchronously, before the caller clears the cart
		await serial(async () => {
			try {
				if (!state.basket && current)
					await call("rfid_retail.api.pos.cancel_basket", { basket: current });
			} finally {
				reset(false);
				await openBasket();
			}
		});
	}

	/**
	 * Resume: get the held bill's tray back. Called after the draft's items are in the cart.
	 * Takes back the held basket when the server can; otherwise (or when that fails) reads the
	 * saved codes again into the current basket. Returns how many cart units are not on the tray.
	 */
	async function restore(state) {
		if (!enabled.value || !state) return { missing: 0, events: [] };
		return serial(async () => {
			let view = null;
			if (state.basket && canHold.value) {
				try {
					view = await call("rfid_retail.api.pos.resume_basket", {
						basket: state.basket,
						current: basket.value,
						pos_profile: profile.value,
					});
				} catch (error) {
					log.warn("Held basket could not be resumed, reading its tags again", error);
					// Its tags are still claimed by it; let go so they can be read into this basket.
					await call("rfid_retail.api.pos.release_held_basket", { basket: state.basket }).catch(() => {});
				}
			}
			if (!view && state.epcs?.length) {
				if (!basket.value) await openBasket();
				view = await call("rfid_retail.api.pos.scan", {
					basket: basket.value,
					codes: state.epcs,
					source: "RFID",
				});
			}
			if (view) {
				applyView(view);
				events.value = view.events || [];
			}
			// Same tick as the lines: the tray must not push these units into the cart a second time.
			const onTray = new Set(lines.value.map(keyOf));
			const keys = state.keys || [];
			inCart.value = new Set(keys.filter((k) => onTray.has(k)));
			return {
				missing: keys.filter((k) => !onTray.has(k)).length,
				events: events.value,
			};
		});
	}

	/** A held draft was deleted: cancel its basket so its tags can be sold again. Never throws. */
	async function releaseHeld(state) {
		if (!enabled.value || !state?.basket || state.basket === basket.value) return;
		try {
			await call("rfid_retail.api.pos.release_held_basket", { basket: state.basket });
		} catch (error) {
			log.warn("Could not release held basket", state.basket, error);
		}
	}

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
		unread.value = {};
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
		unread,
		unreadSale,
		unreadNeedsManager,
		unreadApproval,
		unreadReasons,
		canHold,
		holdState,
		hold,
		undoHold,
		finishHold,
		restore,
		releaseHeld,
		approveUnread,
		requestUnreadPin,
		confirmUnreadPin,
		unreadApprovalStatus,
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
