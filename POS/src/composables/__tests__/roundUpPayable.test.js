import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
vi.mock("frappe-ui", () => ({ createResource: () => ({ submit: vi.fn(), fetch: vi.fn() }), call: vi.fn() }));
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }));
vi.mock("@/stores/serialNumber", () => ({ useSerialNumberStore: () => ({ returnSerials: vi.fn() }) }));
vi.mock("@/utils/currency", () => ({ roundCurrency: (v) => Math.round((Number(v) || 0) * 100) / 100 }));
import { useInvoice } from "@/composables/useInvoice";

function cart({ inclusive = true, taxRate = 0, items, addl = 0, on = true, step = 10 }) {
  const inv = useInvoice();
  inv.taxInclusive.value = inclusive;
  inv.itemTaxTemplates.value = { default: { rate: taxRate, breakup: taxRate ? [{ account_head: "T", rate: taxRate }] : [] }, templates: {} };
  inv.invoiceItems.value = items.map((i) => ({ quantity: 1, conversion_factor: 1, ...i }));
  inv.invoiceItems.value.forEach((i) => inv.recalculateItem(i));
  inv.additionalDiscount.value = addl;
  inv.setPayableRounding({ enabled: on, step });
  inv.rebuildIncrementalCache();
  return inv;
}
describe("round up payable", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("300 with 5% item offer -> 290, discount 10", () => {
    const c = cart({ items: [{ item_code: "A", price_list_rate: 300, rate: 300, discount_percentage: 5, pricing_rules: ["PR1"] }] });
    expect(c.roundPayableActive.value).toBe(true);
    expect(c.grandTotal.value).toBe(290);
    expect(c.totalDiscount.value).toBe(10);
    const [row] = c.formatItemsForSubmission(c.invoiceItems.value);
    expect(row).toMatchObject({ rate: 300, discount_percentage: 0, discount_amount: 0, pricing_rules: "PR1" });
    expect(c.billDiscountFields()).toEqual({ discount_amount: 10, additional_discount_percentage: 0, apply_discount_on: "Grand Total", round_up_payable: 1 });
    expect(c.displayLineAmount(c.invoiceItems.value[0])).toBe(300);
  });
  it("flag off: unchanged", () => {
    const c = cart({ on: false, items: [{ item_code: "A", price_list_rate: 300, rate: 300, discount_percentage: 5 }] });
    expect(c.grandTotal.value).toBe(285);
    expect(c.billDiscountFields()).toEqual({ discount_amount: 0 });
    expect(c.formatItemsForSubmission(c.invoiceItems.value)[0].discount_percentage).toBe(5);
  });
  it("no discount: not rounded", () => {
    const c = cart({ items: [{ item_code: "A", price_list_rate: 283, rate: 283 }] });
    expect(c.roundPayableActive.value).toBe(false);
    expect(c.grandTotal.value).toBe(283);
  });
  it("coupon (header) discount: 300 - 15 -> 290", () => {
    const c = cart({ addl: 15, items: [{ item_code: "A", price_list_rate: 300, rate: 300 }] });
    expect(c.grandTotal.value).toBe(290);
    expect(c.billDiscount.value).toBe(10);
  });
  it("already round stays; never above full price", () => {
    expect(cart({ addl: 10, items: [{ item_code: "A", price_list_rate: 300, rate: 300 }] }).grandTotal.value).toBe(290);
    const c = cart({ items: [{ item_code: "A", price_list_rate: 300, rate: 300, discount_percentage: 1 }] });
    expect(c.grandTotal.value).toBe(300);
    expect(c.billDiscount.value).toBe(0);
  });
  it("manual discount kept, not rounded", () => {
    const c = cart({ items: [{ item_code: "A", price_list_rate: 300, rate: 300, discount_percentage: 5 }] });
    c.setManualBillDiscount(17.5);
    expect(c.grandTotal.value).toBe(282.5);
    expect(c.billDiscountFields().round_up_payable).toBe(0);
    c.invoiceItems.value.push({ item_code: "B", price_list_rate: 100, rate: 100, quantity: 1 });
    c.recalculateItem(c.invoiceItems.value[1]); c.rebuildIncrementalCache();
    expect(c.billDiscount.value).toBe(17.5);
    c.clearCart();
    expect(c.manualBillDiscount.value).toBe(null);
  });
  it("tax exclusive 18%: payable rounded up incl tax", () => {
    const c = cart({ inclusive: false, taxRate: 18, items: [{ item_code: "A", price_list_rate: 300, rate: 300, discount_percentage: 5 }] });
    // normal: 285 + 51.3 = 336.3 -> 340 ; gross 354 -> discount 14
    expect(c.grandTotal.value).toBe(340);
    expect(c.billDiscount.value).toBe(14);
    expect(c.subtotal.value + c.totalTax.value - c.totalDiscount.value).toBeCloseTo(340, 2);
  });
  it("tax inclusive 5%, two items, step 50", () => {
    const c = cart({ taxRate: 5, step: 50, items: [
      { item_code: "A", price_list_rate: 499, rate: 499, discount_percentage: 10 },
      { item_code: "B", price_list_rate: 250, rate: 250, quantity: 2 } ] });
    // 449.1 + 500 = 949.1 -> 950; gross 999 -> 49
    expect(c.grandTotal.value).toBe(950);
    expect(c.billDiscount.value).toBe(49);
  });
});
