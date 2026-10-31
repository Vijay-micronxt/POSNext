import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { reactive } from "vue";

globalThis.__ = (text, args = []) => String(text).replace(/\{(\d+)\}/g, (_, i) => args[i]);

// Server stand-in for apply_offers: an offer listed in selected_offers gives its % on every line.
const RATES = { PROMO5: 5, PROMO10: 10 };
const applyOffersCalls = [];
vi.mock("frappe-ui", () => ({
	createResource: (opts) => ({
		submit: vi.fn(async (params) => {
			if (opts?.url !== "pos_next.api.invoices.apply_offers") return {};
			applyOffersCalls.push(params.selected_offers);
			const codes = params.selected_offers || [];
			const pct = codes.reduce((sum, c) => sum + (RATES[c] || 0), 0);
			return {
				items: params.invoice_data.items.map(() => ({
					discount_percentage: pct,
					discount_amount: 0,
					pricing_rules: codes.length ? codes.join(",") : "",
				})),
				free_items: [],
				applied_pricing_rules: codes,
				// the server sends back the bill's header discount it was given (e.g. a coupon)
				discount_amount: params.invoice_data.discount_amount || 0,
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
vi.mock("@/stores/posOffers", () => ({
	usePOSOffersStore: () =>
		reactive({
			hasFetched: true,
			allEligibleOffers: offers,
			autoEligibleOffers: offers,
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
});
