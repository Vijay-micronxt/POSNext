<template>
	<Dialog v-model="showDialog" :options="{ title: __('Return Without Invoice'), size: '4xl' }">
		<template #body-content>
			<!-- reka-ui's DialogOverlay prevents pointerdown, which stops inputs getting focus -->
			<div class="flex flex-col gap-4 text-start" @pointerdown.stop>
				<div class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
					<FeatherIcon name="alert-triangle" class="h-5 w-5 flex-shrink-0 text-amber-600" />
					<p class="text-xs text-amber-900">
						{{
							__(
								"Use this only when the customer has no bill. Items go back into stock at the price you enter here."
							)
						}}
					</p>
				</div>

				<!-- Customer -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-2">{{ __("Customer") }}</label>
					<div v-if="customer && !editingCustomer" class="flex items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 py-2">
						<div class="min-w-0">
							<p class="text-sm font-semibold text-gray-900 truncate">
								{{ customer.customer_name || customer.name }}
							</p>
							<p class="text-xs text-gray-500 truncate">
								{{ customer.mobile_no || customer.name }}
							</p>
						</div>
						<Button variant="subtle" size="sm" @click="startCustomerEdit">{{ __("Change") }}</Button>
					</div>
					<div v-else class="relative">
						<div class="flex gap-2">
							<input
								ref="customerInput"
								v-model="customerSearch"
								type="text"
								autocomplete="off"
								:placeholder="__('Search customer by name or mobile...')"
								class="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								@input="onCustomerInput"
							/>
							<Button variant="subtle" class="h-auto whitespace-nowrap" @click="openCreateCustomer">
								<template #prefix><FeatherIcon name="user-plus" class="h-4 w-4" /></template>
								{{ __("New Customer") }}
							</Button>
						</div>
						<div
							v-if="customerResults.length"
							class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
						>
							<button
								v-for="c in customerResults"
								:key="c.name"
								type="button"
								class="block w-full px-3 py-2 text-start hover:bg-blue-50"
								@click="pickCustomer(c)"
							>
								<span class="text-sm font-medium text-gray-900">{{ c.customer_name || c.name }}</span>
								<span v-if="c.mobile_no" class="ms-2 text-xs text-gray-500">{{ c.mobile_no }}</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Item search -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-2">{{ __("Items Returned") }}</label>
					<div class="relative">
						<FeatherIcon
							name="search"
							class="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
						/>
						<input
							ref="itemInput"
							v-model="itemSearch"
							type="text"
							autocomplete="off"
							:placeholder="__('Scan barcode or search item code / name...')"
							class="w-full ps-10 pe-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							@input="onItemInput"
							@keydown.enter.prevent="onItemEnter"
						/>
						<div
							v-if="itemResults.length"
							class="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
						>
							<button
								v-for="it in itemResults"
								:key="it.item_code"
								type="button"
								class="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-blue-50"
								@click="addItem(it)"
							>
								<div class="min-w-0">
									<p class="text-sm font-medium text-gray-900 truncate">{{ it.item_name }}</p>
									<p class="text-xs text-gray-500 truncate">{{ it.item_code }}</p>
								</div>
								<span class="text-sm font-semibold text-gray-700 whitespace-nowrap">
									{{ formatCurrency(it.rate) }}
								</span>
							</button>
						</div>
						<p v-else-if="itemSearched && itemSearch && !itemLoading" class="mt-1 text-xs text-gray-500">
							{{ __("No item found") }}
						</p>
					</div>

					<div v-if="rows.length" class="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
						<div v-for="(row, idx) in rows" :key="row.item_code" class="flex flex-wrap items-center gap-3 px-3 py-2">
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-gray-900 truncate">{{ row.item_name }}</p>
								<p class="text-xs text-gray-500 truncate">{{ row.item_code }}</p>
							</div>
							<div class="flex items-center gap-1">
								<button type="button" class="h-8 w-8 rounded border border-gray-300 text-gray-700" @click="changeQty(row, -1)">-</button>
								<input
									v-model.number="row.qty"
									type="number"
									min="1"
									step="1"
									class="h-8 w-14 rounded border border-gray-300 text-center text-sm"
									@change="normalizeQty(row)"
								/>
								<button type="button" class="h-8 w-8 rounded border border-gray-300 text-gray-700" @click="changeQty(row, 1)">+</button>
							</div>
							<div class="w-28">
								<input
									v-if="canEditRate"
									v-model.number="row.rate"
									type="number"
									min="0"
									step="0.01"
									class="h-8 w-full rounded border border-gray-300 px-2 text-end text-sm"
									@change="normalizeRate(row)"
								/>
								<p v-else class="text-end text-sm text-gray-700">{{ formatCurrency(row.rate) }}</p>
							</div>
							<p class="w-28 text-end text-sm font-semibold text-gray-900">
								{{ formatCurrency(row.qty * row.rate) }}
							</p>
							<button type="button" class="text-gray-400 hover:text-red-600" :title="__('Remove')" @click="rows.splice(idx, 1)">
								<FeatherIcon name="trash-2" class="h-4 w-4" />
							</button>
						</div>
					</div>
				</div>

				<!-- What the customer gets for the clothes -->
				<div v-if="rows.length">
					<label class="block text-sm font-medium text-gray-700 mb-2">{{ __("Customer Gets") }}</label>
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
						<button
							v-for="opt in settleOptions"
							:key="opt.value"
							type="button"
							:disabled="opt.disabled"
							class="rounded-xl border-2 p-3 text-start transition-colors"
							:class="[
								settle === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300',
								opt.disabled ? 'opacity-50 cursor-not-allowed' : '',
							]"
							@click="settle = opt.value"
						>
							<span class="block text-sm font-bold text-gray-900">{{ opt.label }}</span>
							<span class="block text-xs text-gray-600 mt-1">{{ opt.hint }}</span>
						</button>
					</div>
					<div v-if="settle !== 'credit'">
						<label class="block text-sm font-medium text-gray-700 mb-2">
							{{ settle === "exchange" ? __("If the new clothes cost less, give the rest back by") : __("Refund Mode") }}
						</label>
						<div class="flex flex-wrap gap-2">
							<button
								v-for="m in paymentMethods"
								:key="m.mode_of_payment"
								type="button"
								class="rounded-lg border px-4 py-2 text-sm"
								:class="refundMode === m.mode_of_payment ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700' : 'border-gray-300 text-gray-700'"
								@click="refundMode = m.mode_of_payment"
							>
								{{ m.mode_of_payment }}
							</button>
						</div>
					</div>
				</div>

				<!-- Reason -->
				<div v-if="rows.length">
					<label class="block text-sm font-medium text-gray-700 mb-2">
						{{ __("Return Reason") }} <span class="text-red-500">*</span>
					</label>
					<textarea
						v-model="reason"
						rows="2"
						:placeholder="__('Why is there no bill? e.g. customer lost the bill')"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
					></textarea>
				</div>

				<div v-if="rows.length" class="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
					<span class="text-sm text-gray-700">
						{{ totalLabel }}
						<span v-if="!taxInclusive" class="text-xs text-gray-500">({{ __("plus tax") }})</span>
					</span>
					<span class="text-lg font-bold text-gray-900">{{ formatCurrency(returnTotal) }}</span>
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex w-full flex-col gap-2">
				<p v-if="!hasOpenShift" class="text-xs text-red-600">{{ __("Open a shift to make a return.") }}</p>
				<div class="flex justify-end gap-2">
					<Button variant="subtle" @click="showDialog = false">{{ __("Cancel") }}</Button>
					<Button
						variant="solid"
						theme="red"
						:disabled="!canSubmit || submitResource.loading"
						:loading="submitResource.loading"
						@click="handleSubmit"
					>
						{{ settle === "exchange" ? __("Add New Clothes") : __("Create Return") }}
					</Button>
				</div>
			</div>
		</template>
	</Dialog>

	<CreateCustomerDialog
		v-model="showCreateCustomer"
		:pos-profile="posProfile"
		:initial-name="newCustomerName"
		@customer-created="onCustomerCreated"
	/>
</template>

<script setup>
import { useToast } from "@/composables/useToast";
import { useCustomerSearchStore } from "@/stores/customerSearch";
import { usePOSCartStore } from "@/stores/posCart";
import { usePOSSettingsStore } from "@/stores/posSettings";
import { usePOSShiftStore } from "@/stores/posShift";
import { DEFAULT_CURRENCY, formatCurrency as formatCurrencyUtil, roundCurrency } from "@/utils/currency";
import { Button, Dialog, FeatherIcon, call, createResource } from "frappe-ui";
import { computed, nextTick, ref, watch } from "vue";
import CreateCustomerDialog from "./CreateCustomerDialog.vue";

const props = defineProps({
	modelValue: Boolean,
	posProfile: String,
	posOpeningShift: String,
	currency: { type: String, default: DEFAULT_CURRENCY },
});
const emit = defineEmits(["update:modelValue", "return-created", "exchange-started"]);

const showDialog = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
});

const { showSuccess, showError } = useToast();
const settingsStore = usePOSSettingsStore();
const shiftStore = usePOSShiftStore();
const cartStore = usePOSCartStore();
const customerSearchStore = useCustomerSearchStore();

const SEARCH_DEBOUNCE_MS = 300;

const customer = ref(null);
const editingCustomer = ref(false);
const customerSearch = ref("");
const customerResults = ref([]);
const customerInput = ref(null);
const showCreateCustomer = ref(false);
const newCustomerName = ref("");

const itemSearch = ref("");
const itemResults = ref([]);
const itemLoading = ref(false);
const itemSearched = ref(false);
const itemInput = ref(null);

const rows = ref([]);
const paymentMethods = ref([]);
const refundMode = ref("");
// refund | credit | exchange (customer takes other clothes for it)
const settle = ref("refund");
const addToCustomerCredit = computed(() => settle.value === "credit");
const reason = ref("");

let customerTimer = null;
let itemTimer = null;
let itemRequest = 0;

const taxInclusive = computed(() => Boolean(cartStore.taxInclusive));
const canEditRate = computed(() => settingsStore.allowUserToEditRate);
const hasOpenShift = computed(() => Boolean(props.posOpeningShift));
const defaultCustomer = computed(() => shiftStore.profileCustomer);
// Credit on the shop's walk-in customer can never be claimed back by anyone.
const canUseCredit = computed(
	() => Boolean(customer.value?.name) && customer.value.name !== defaultCustomer.value
);

const returnTotal = computed(() =>
	roundCurrency(rows.value.reduce((sum, r) => sum + roundCurrency((r.qty || 0) * (r.rate || 0)), 0))
);

const settleOptions = computed(() => [
	{
		value: "exchange",
		label: __("Other Clothes"),
		hint: __("Exchange: value goes to the new bill, customer pays or gets back the difference."),
	},
	{
		value: "refund",
		label: __("Money Back"),
		hint: __("Pay the amount back now."),
	},
	{
		value: "credit",
		label: __("Customer Credit"),
		hint: canUseCredit.value
			? __("Keep it for a later bill.")
			: __("Pick a named customer to give credit."),
		disabled: !canUseCredit.value,
	},
]);

const totalLabel = computed(() => {
	if (settle.value === "exchange") return __("Exchange Value:");
	return addToCustomerCredit.value ? __("Amount to Credit:") : __("Refund Amount:");
});

const canSubmit = computed(
	() =>
		hasOpenShift.value &&
		Boolean(customer.value?.name) &&
		rows.value.length > 0 &&
		rows.value.every((r) => r.qty > 0 && r.rate > 0) &&
		reason.value.trim().length > 0 &&
		(addToCustomerCredit.value || Boolean(refundMode.value))
);

function formatCurrency(amount) {
	return formatCurrencyUtil(amount || 0, props.currency);
}

// Start with the customer tagged on the cart, else the profile's walk-in customer
function initialCustomer() {
	const cartCustomer = cartStore.customer;
	if (cartCustomer?.name) return { ...cartCustomer };
	if (typeof cartCustomer === "string" && cartCustomer) {
		return { name: cartCustomer, customer_name: cartCustomer };
	}
	return defaultCustomer.value
		? { name: defaultCustomer.value, customer_name: defaultCustomer.value }
		: null;
}

function resetForm() {
	customer.value = initialCustomer();
	editingCustomer.value = !customer.value;
	customerSearch.value = "";
	customerResults.value = [];
	itemSearch.value = "";
	itemResults.value = [];
	itemSearched.value = false;
	rows.value = [];
	reason.value = "";
	settle.value = settingsStore.returnToCreditByDefault && canUseCredit.value ? "credit" : "refund";
	refundMode.value = paymentMethods.value.find((m) => m.default)?.mode_of_payment
		|| paymentMethods.value[0]?.mode_of_payment
		|| "";
}

async function loadPaymentMethods() {
	if (!props.posProfile) return;
	try {
		const doc = await call("frappe.client.get", { doctype: "POS Profile", name: props.posProfile });
		paymentMethods.value = doc?.payments || [];
		if (!refundMode.value) {
			refundMode.value = paymentMethods.value.find((m) => m.default)?.mode_of_payment
				|| paymentMethods.value[0]?.mode_of_payment
				|| "";
		}
	} catch (error) {
		console.error("Error loading payment methods:", error);
	}
}

// Customer search
function startCustomerEdit() {
	editingCustomer.value = true;
	customerSearch.value = "";
	customerResults.value = [];
	nextTick(() => customerInput.value?.focus());
}

function cancelCustomerEdit() {
	if (customer.value) editingCustomer.value = false;
	customerResults.value = [];
}

function onCustomerInput() {
	clearTimeout(customerTimer);
	const term = customerSearch.value.trim();
	if (term.length < 2) {
		customerResults.value = [];
		return;
	}
	customerTimer = setTimeout(async () => {
		try {
			const list = await call("pos_next.api.customers.get_customers", {
				search_term: term,
				pos_profile: props.posProfile,
				limit: 8,
			});
			if (customerSearch.value.trim() === term) customerResults.value = list || [];
		} catch (error) {
			console.error("Customer search failed:", error);
		}
	}, SEARCH_DEBOUNCE_MS);
}

function openCreateCustomer() {
	newCustomerName.value = customerSearch.value.trim();
	customerResults.value = [];
	showCreateCustomer.value = true;
}

async function onCustomerCreated(created) {
	if (!created?.name) return;
	if (props.posProfile) {
		try {
			await customerSearchStore.addCustomerToCache(created);
		} catch (error) {
			console.error("Could not cache new customer:", error);
		}
	}
	pickCustomer(created);
}

function pickCustomer(c) {
	customer.value = c;
	editingCustomer.value = false;
	customerResults.value = [];
	if (settle.value === "credit" && !canUseCredit.value) settle.value = "refund";
	else if (settle.value === "refund" && settingsStore.returnToCreditByDefault && canUseCredit.value) {
		settle.value = "credit";
	}
}

// Item search
async function searchItems(term) {
	const request = ++itemRequest;
	itemLoading.value = true;
	try {
		const list = await call("pos_next.api.items.get_items", {
			pos_profile: props.posProfile,
			search_term: term,
			start: 0,
			limit: 10,
			show_variants_as_items: 1,
		});
		if (request !== itemRequest) return null;
		// Templates are never sold, only their variants
		itemResults.value = (list || []).filter((it) => !it.has_variants);
		itemSearched.value = true;
		return itemResults.value;
	} catch (error) {
		console.error("Item search failed:", error);
		return null;
	} finally {
		if (request === itemRequest) itemLoading.value = false;
	}
}

function onItemInput() {
	clearTimeout(itemTimer);
	itemSearched.value = false;
	const term = itemSearch.value.trim();
	if (term.length < 2) {
		itemResults.value = [];
		return;
	}
	itemTimer = setTimeout(() => searchItems(term), SEARCH_DEBOUNCE_MS);
}

// Enter after a barcode scan: add the item straight away when exactly one matches
async function onItemEnter() {
	clearTimeout(itemTimer);
	const term = itemSearch.value.trim();
	if (!term) return;
	const list = await searchItems(term);
	if (list?.length === 1) addItem(list[0]);
}

function addItem(it) {
	const existing = rows.value.find((r) => r.item_code === it.item_code);
	if (existing) {
		existing.qty += 1;
	} else {
		rows.value.push({
			item_code: it.item_code,
			item_name: it.item_name,
			uom: it.uom || it.stock_uom,
			conversion_factor: it.conversion_factor || 1,
			warehouse: it.warehouse || shiftStore.profileWarehouse,
			price_list_rate: it.price_list_rate || it.rate || 0,
			rate: it.rate || 0,
			qty: 1,
		});
	}
	itemSearch.value = "";
	itemResults.value = [];
	itemSearched.value = false;
	nextTick(() => itemInput.value?.focus());
}

function changeQty(row, delta) {
	row.qty = Math.max(1, (Number.parseInt(row.qty) || 0) + delta);
}

function normalizeQty(row) {
	row.qty = Math.max(1, Number.parseInt(row.qty) || 1);
}

function normalizeRate(row) {
	row.rate = Math.max(0, roundCurrency(Number(row.rate) || 0));
}

function handleSubmit() {
	if (settle.value !== "exchange") {
		submitResource.submit();
		return;
	}
	// Nothing is saved yet: the clothes ride with the cart and are returned with the sale
	emit("exchange-started", {
		customer: customer.value,
		total: returnTotal.value,
		reason: reason.value.trim(),
		refund_mode: refundMode.value,
		items: rows.value.map((r) => ({
			item_code: r.item_code,
			item_name: r.item_name,
			qty: r.qty,
			rate: r.rate,
			price_list_rate: Math.max(r.price_list_rate, r.rate),
			warehouse: r.warehouse,
			uom: r.uom,
			conversion_factor: r.conversion_factor,
		})),
	});
	showDialog.value = false;
}

const submitResource = createResource({
	url: "pos_next.api.invoices.submit_invoice",
	makeParams() {
		const invoiceData = {
			doctype: "Sales Invoice",
			pos_profile: props.posProfile,
			posa_pos_opening_shift: props.posOpeningShift,
			customer: customer.value.name,
			is_return: 1,
			is_pos: 1,
			update_stock: 1,
			items: rows.value.map((r) => ({
				item_code: r.item_code,
				item_name: r.item_name,
				qty: -Math.abs(r.qty),
				rate: r.rate,
				price_list_rate: Math.max(r.price_list_rate, r.rate),
				warehouse: r.warehouse,
				uom: r.uom,
				conversion_factor: r.conversion_factor,
			})),
			add_to_customer_balance: addToCustomerCredit.value,
			// The server sets the single refund row to the exact return total (tax, rounding)
			payments: addToCustomerCredit.value
				? []
				: [{ mode_of_payment: refundMode.value, amount: -returnTotal.value }],
			remarks: __("Return without invoice: {0}", [reason.value.trim()]),
		};
		return { invoice: JSON.stringify(invoiceData), data: JSON.stringify({}) };
	},
	transform(data) {
		if (data?.exc) throw data;
		return data;
	},
	onSuccess(data) {
		emit("return-created", data);
		showSuccess(__("Return invoice {0} created successfully", [data.name]));
		showDialog.value = false;
	},
	onError(error) {
		let message = error?.messages?.[0] || error?.message || __("Failed to create return invoice");
		message = String(message).replace(/<[^>]*>/g, "");
		showError(message);
	},
});

watch(
	() => props.modelValue,
	(open) => {
		if (!open) return;
		resetForm();
		if (!paymentMethods.value.length) loadPaymentMethods();
		nextTick(() => itemInput.value?.focus());
	}
);
</script>
