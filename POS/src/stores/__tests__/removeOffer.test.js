import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { reactive } from "vue";

globalThis.__ = (text, args = []) => String(text).replace(/\{(\d+)\}/g, (_, i) => args[i]);

// Server stand-in for apply_offers: an item offer listed in selected_offers gives its % on every
// line; a whole-bill (Transaction) offer sets the header discount. Like the real server, a
// whole-bill offer counts as applied only when the header discount it sets differs from the one
// the cart sent, and otherwise the header discount sent is handed back.
const RATES = { PROMO5: 5, PROMO10: 10 };
const BILL_RATES = { BILL10: 10 };
const applyOffersCalls = [];
vi.mock("frappe-ui", () => ({
	createResource: (opts) => ({
		submit: vi.fn(async (params) => {
			if (opts?.url !== "pos_next.api.invoices.apply_offers") return {};
			applyOffersCalls.push(params.selected_offers);
			const codes = params.selected_offers || [];
			const itemCodes = codes.filter((c) => RATES[c]);
			const pct = itemCodes.reduce((sum, c) => sum + RATES[c], 0);
			const sent = params.invoice_data.discount_amount || 0;
			let header = sent;
			const applied = [...itemCodes];
			for (const c of codes.filter((c) => BILL_RATES[c])) {
				const total = params.invoice_data.items.reduce((t, i) => t + i.price_list_rate * i.qty, 0);
				header = Math.round(total * BILL_RATES[c]) / 100;
				if (header !== sent) applied.push(c);
			}
			return {
				items: params.invoice_data.items.map(() => ({
					discount_percentage: pct,
					discount_amount: 0,
					pricing_rules: itemCodes.join(","),
				})),
				free_items: [],
				applied_pricing_rules: applied,
				discount_amount: header,
			};
		}),
		fetch: vi.fn(),
	}),
	call: vi.fn(),
}));
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }));
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }));
vi.mock("@/stores/serialNumber", () => ({ useSerialNumberStore: () => ({ returnSerials: vi.fn() }) }));
vi.mock("@/utils/currency", () => ({ roundCurrency: (v) => Math.round((Number(v) || 0) * 100) / 100 }));
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}));
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ currentProfile: {} }) }));
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => reactive({ roundUpPayable: false, payableRoundingStep: 10 }),
}));
const offers = [
	{ name: "PROMO5", title: "5% off", auto: true },
	{ name: "PROMO10", title: "10% off", auto: true },
];
const allOffers = [...offers, { name: "BILL10", title: "10% off the bill", auto: true }];
let eligible = offers;
vi.mock("@/stores/posOffers", () => ({
	usePOSOffersStore: () =>
		reactive({
			hasFetched: true,
			get allEligibleOffers() {
				return eligible;
			},
			get autoEligibleOffers() {
				return eligible;
			},
			ensureOffersFetched: async () => {},
			checkOfferEligibility: () => ({ eligible: true }),
			updateCartSnapshot: () => {},
			clearOneTimeContext: () => {},
			loadOneTimeContextForCustomer: async () => {},
			getOneTimeContext: () => null,
		}),
}));

import { usePOSCartStore } from "@/stores/posCart";

const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));

async function cartWithBothOffers() {
	const cart = usePOSCartStore();
	cart.posProfile = "P";
	cart.invoiceItems = [{ item_code: "A", quantity: 1, price_list_rate: 300, rate: 300, conversion_factor: 1 }];
	cart.invoiceItems.forEach((i) => cart.recalculateItem(i));
	cart.rebuildIncrementalCache();
	await wait(); // automatic processing applies every eligible offer
	return cart;
}

describe("removing an offer while billing", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		applyOffersCalls.length = 0;
		eligible = offers;
	});

	it("auto-applies both offers to begin with", async () => {
		const cart = await cartWithBothOffers();
		expect(cart.appliedOffers.map((o) => o.code).sort()).toEqual(["PROMO10", "PROMO5"]);
		expect(cart.grandTotal).toBe(255);
	});

	it("removes one offer, keeps the other, and it stays removed after the cart changes", async () => {
		const cart = await cartWithBothOffers();
		await cart.removeOffer("PROMO10", {});
		expect(cart.appliedOffers.map((o) => o.code)).toEqual(["PROMO5"]);
		expect(cart.declinedOffers).toEqual(["PROMO10"]);
		expect(cart.invoiceItems[0].discount_percentage).toBe(5);
		expect(cart.grandTotal).toBe(285);

		cart.invoiceItems[0].quantity = 2; // cart change -> automatic processing again
		cart.recalculateItem(cart.invoiceItems[0]);
		cart.rebuildIncrementalCache();
		await wait();
		expect(applyOffersCalls.at(-1)).toEqual(["PROMO5"]);
		expect(cart.appliedOffers.map((o) => o.code)).toEqual(["PROMO5"]);
		expect(cart.grandTotal).toBe(570);
	});

	it("removing the last offer clears its discount but keeps a coupon", async () => {
		const cart = await cartWithBothOffers();
		cart.appliedCoupon = { name: "CPN" };
		cart.additionalDiscount = 20;
		await cart.removeOffer("PROMO10", {});
		await cart.removeOffer("PROMO5", {});
		expect(cart.appliedOffers).toEqual([]);
		expect(cart.invoiceItems[0].discount_percentage).toBe(0);
		expect(cart.additionalDiscount).toBe(20);
		expect(cart.grandTotal).toBe(280);
		await wait();
		expect(cart.appliedOffers).toEqual([]);
	});

	it("apply again lifts the removal; clearing the bill forgets it", async () => {
		const cart = await cartWithBothOffers();
		await cart.removeOffer("PROMO10", {});
		await cart.applyOffer({ name: "PROMO10", title: "10% off" }, {});
		expect(cart.declinedOffers).toEqual([]);
		expect(cart.appliedOffers.map((o) => o.code).sort()).toEqual(["PROMO10", "PROMO5"]);
		await cart.removeOffer("PROMO10", {});
		cart.clearCart();
		expect(cart.declinedOffers).toEqual([]);
	});

	it("a whole-bill offer: removed while another stays, then applied again", async () => {
		eligible = [offers[0], allOffers[2]]; // PROMO5 on the lines + BILL10 on the bill
		const cart = await cartWithBothOffers();
		expect(cart.appliedOffers.map((o) => o.code).sort()).toEqual(["BILL10", "PROMO5"]);
		expect(cart.additionalDiscount).toBe(30);
		expect(cart.grandTotal).toBe(255); // 300 - 15 - 30

		await cart.removeOffer("BILL10", {});
		expect(cart.additionalDiscount).toBe(0); // its discount goes with it
		expect(cart.grandTotal).toBe(285);
		await wait();
		expect(cart.additionalDiscount).toBe(0); // and stays gone after automatic processing

		await cart.applyOffer({ name: "BILL10", title: "10% off the bill" }, {});
		expect(cart.appliedOffers.map((o) => o.code).sort()).toEqual(["BILL10", "PROMO5"]);
		expect(cart.additionalDiscount).toBe(30);
		expect(cart.grandTotal).toBe(255);
	});

	it("removing a whole-bill offer keeps a coupon's discount", async () => {
		eligible = [allOffers[2]];
		const cart = await cartWithBothOffers();
		expect(cart.additionalDiscount).toBe(30);
		cart.applyDiscountToCart({ name: "CPN", amount: 20 }); // the coupon replaces the header discount
		await cart.removeOffer("BILL10", {});
		expect(cart.appliedOffers).toEqual([]);
		expect(cart.additionalDiscount).toBe(20);
		expect(cart.grandTotal).toBe(280);
	});
});
