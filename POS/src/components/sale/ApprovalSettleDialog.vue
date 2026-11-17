<template>
	<Dialog v-model="open" :options="{ title: note ? __('Approval {0}', [note.name]) : __('Approvals'), size: '3xl' }">
		<template #body-content>
			<!-- pointerdown.stop: the dialog overlay would otherwise keep these inputs from taking focus -->
			<div class="flex flex-col gap-3 text-start text-sm text-gray-700" @pointerdown.stop>
				<!-- List of open Approval Notes -->
				<template v-if="!note">
					<input
						v-model="search"
						type="text"
						autocomplete="off"
						class="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm"
						:placeholder="__('Search by customer, mobile or note number...')"
						@input="onSearch"
					/>
					<p v-if="loading" class="text-center text-gray-500 py-6">{{ __("Loading...") }}</p>
					<p v-else-if="!notes.length" class="text-center text-gray-500 py-6">
						{{ __("No goods out on approval.") }}
					</p>
					<div v-else class="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
						<button
							v-for="n in notes"
							:key="n.name"
							type="button"
							class="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-blue-50"
							@click="openNote(n.name)"
						>
							<div class="min-w-0">
								<p class="font-semibold text-gray-900 truncate">{{ n.customer_name || n.customer }}</p>
								<p class="text-xs text-gray-500 truncate">
									{{ n.name }} · {{ n.posting_date }}<span v-if="n.mobile"> · {{ n.mobile }}</span>
								</p>
							</div>
							<div class="text-end flex-shrink-0">
								<p class="font-semibold text-gray-900">{{ formatCurrency(n.pending_value) }}</p>
								<p class="text-xs font-bold text-gray-900">{{ __("Qty: {0}", [qtyText(n.pending_qty)]) }}</p>
							</div>
						</button>
					</div>
				</template>

				<!-- One note: what the customer keeps, what comes back -->
				<template v-else>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="font-semibold text-gray-900 truncate">{{ note.customer_name || note.customer }}</p>
							<p class="text-xs text-gray-500">{{ note.name }} · {{ note.posting_date }}</p>
						</div>
						<div class="flex gap-2 flex-shrink-0">
							<Button size="sm" variant="subtle" @click="setAll('sell')">{{ __("Sell all") }}</Button>
							<Button size="sm" variant="subtle" @click="setAll('ret')">{{ __("Return all") }}</Button>
						</div>
					</div>
					<div class="max-h-[45vh] overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
						<div v-for="r in openRows" :key="r.dn_detail" class="px-3 py-2.5 flex flex-wrap items-center gap-3">
							<div class="min-w-0 flex-1">
								<p class="font-medium text-gray-900 truncate">
									{{ r.item_name }}
									<span class="ms-2 font-bold text-gray-900">{{ __("Qty: {0}", [qtyText(r.pending)]) }}</span>
								</p>
								<p class="text-xs text-gray-500 truncate">{{ r.item_code }} · {{ formatCurrency(r.price) }}</p>
							</div>
							<div class="flex items-center gap-4">
								<div class="text-center">
									<p class="text-[11px] font-semibold text-green-700 mb-1">{{ __("Sell") }}</p>
									<div class="flex items-center gap-1">
										<button type="button" class="step" @click="setQty(r, 'sell', r.sell - 1)">−</button>
										<input
											:value="r.sell"
											type="number"
											min="0"
											:max="r.pending"
											class="qty"
											@change="setQty(r, 'sell', $event.target.value, $event.target)"
										/>
										<button type="button" class="step" @click="setQty(r, 'sell', r.sell + 1)">+</button>
									</div>
								</div>
								<div class="text-center">
									<p class="text-[11px] font-semibold text-red-700 mb-1">{{ __("Return") }}</p>
									<div class="flex items-center gap-1">
										<button type="button" class="step" @click="setQty(r, 'ret', r.ret - 1)">−</button>
										<input
											:value="r.ret"
											type="number"
											min="0"
											:max="r.pending"
											class="qty"
											@change="setQty(r, 'ret', $event.target.value, $event.target)"
										/>
										<button type="button" class="step" @click="setQty(r, 'ret', r.ret + 1)">+</button>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div v-if="soldQty > 0" class="rounded-lg border border-gray-200 p-3 space-y-2">
						<div class="flex justify-between">
							<span>{{ __("Price of sold pieces ({0})", [qtyText(soldQty)]) }}</span>
							<span class="font-semibold">{{ formatCurrency(soldValue) }}</span>
						</div>
						<div class="flex items-center justify-between gap-3">
							<label class="font-medium">{{ __("Discount %") }}</label>
							<input
								:value="discountPct"
								type="number"
								min="0"
								max="100"
								step="0.01"
								class="w-40 h-9 px-3 rounded-lg border border-gray-300 text-end font-semibold"
								@input="onDiscountPct($event.target.value, $event.target)"
							/>
						</div>
						<div class="flex items-center justify-between gap-3">
							<label class="font-medium">{{ __("Pay") }}</label>
							<input
								:value="pay"
								type="number"
								min="0"
								step="0.01"
								class="w-40 h-9 px-3 rounded-lg border border-gray-300 text-end font-semibold"
								@input="onPay($event.target.value, $event.target)"
							/>
						</div>
						<div v-if="discount > 0" class="flex justify-between text-green-700">
							<span>{{ __("Discount") }}</span>
							<span class="font-semibold">{{ formatCurrency(discount) }}</span>
						</div>
						<div v-if="pay > 0" class="flex items-center justify-between gap-3">
							<label class="font-medium">{{ __("Paid by") }}</label>
							<select v-model="mode" class="w-40 h-9 px-2 rounded-lg border border-gray-300 text-sm">
								<option v-for="m in modes" :key="m.mode_of_payment" :value="m.mode_of_payment">
									{{ __(m.mode_of_payment) }}
								</option>
							</select>
						</div>
					</div>
					<p v-if="returnQty > 0" class="text-xs text-gray-600">
						{{ __("{0} piece(s) come back into stock without a tag. Tag them again at the Tag garments station.", [qtyText(returnQty)]) }}
					</p>
				</template>
				<p v-if="error" class="text-sm text-red-600">{{ error }}</p>
			</div>
		</template>
		<template #actions>
			<div v-if="note" class="flex gap-2 w-full">
				<Button variant="subtle" @click="note = null; load()">{{ __("Back") }}</Button>
				<Button variant="subtle" @click="printNote">{{ __("Print note") }}</Button>
				<Button class="flex-1" variant="solid" :loading="busy" :disabled="!soldQty && !returnQty" @click="settle">
					{{ settleLabel }}
				</Button>
			</div>
			<div v-else class="flex w-full">
				<Button class="flex-1" variant="subtle" @click="open = false">{{ __("Close") }}</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { useToast } from "@/composables/useToast";
import { DEFAULT_CURRENCY, formatCurrency as formatCurrencyUtil, roundCurrency } from "@/utils/currency";
import { parseError } from "@/utils/errorHandler";
import { closePrintWindow, openPrintWindow } from "@/utils/printInvoice";
import { Button, Dialog, call } from "frappe-ui";
import { computed, ref, watch } from "vue";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	posProfile: { type: String, default: "" },
	posOpeningShift: { type: String, default: "" },
	currency: { type: String, default: DEFAULT_CURRENCY },
});
const emit = defineEmits(["update:modelValue", "settled", "print"]);
const { showSuccess } = useToast();

const open = computed({
	get: () => props.modelValue,
	set: (v) => emit("update:modelValue", v),
});

const search = ref("");
const notes = ref([]);
const loading = ref(false);
const note = ref(null);
const rows = ref([]);
const pay = ref(0);
const discountPct = ref(0);
const modes = ref([]);
const mode = ref("");
const busy = ref(false);
const error = ref("");
let searchTimer = null;

const openRows = computed(() => rows.value.filter((r) => r.pending > 0));
const soldQty = computed(() => openRows.value.reduce((n, r) => n + r.sell, 0));
const returnQty = computed(() => openRows.value.reduce((n, r) => n + r.ret, 0));
const soldValue = computed(() => roundCurrency(openRows.value.reduce((n, r) => n + r.price * r.sell, 0)));
const discount = computed(() => Math.max(roundCurrency(soldValue.value - (Number(pay.value) || 0)), 0));
const settleLabel = computed(() => {
	if (soldQty.value && returnQty.value) return __("Sell + Return");
	if (soldQty.value) return __("Sell");
	return __("Return");
});

function formatCurrency(v) {
	return formatCurrencyUtil(v || 0, props.currency);
}
function qtyText(v) {
	const n = Number(v) || 0;
	return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

watch(open, (v) => {
	if (v) {
		search.value = "";
		note.value = null;
		error.value = "";
		load();
		loadModes();
	}
});

// the discount % stays when the sold pieces change; Pay follows it
watch(soldValue, () => onDiscountPct(discountPct.value));

async function load() {
	loading.value = true;
	error.value = "";
	try {
		notes.value =
			(await call("rfid_retail.api.on_approval.open_notes", {
				pos_profile: props.posProfile,
				search: search.value.trim() || null,
			})) || [];
	} catch (e) {
		error.value = parseError(e).message;
	} finally {
		loading.value = false;
	}
}

async function loadModes() {
	try {
		modes.value = (await call("pos_next.api.pos_profile.get_payment_methods", { pos_profile: props.posProfile })) || [];
		mode.value = (modes.value.find((m) => m.default) || modes.value[0])?.mode_of_payment || "";
	} catch {
		modes.value = [];
	}
}

function onSearch() {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(load, 300);
}

async function openNote(name) {
	error.value = "";
	try {
		const d = await call("rfid_retail.api.on_approval.note_detail", { delivery_note: name });
		note.value = d;
		// everything is sold unless the cashier returns it
		rows.value = d.rows.map((r) => ({ ...r, sell: r.pending, ret: 0 }));
		// by default the kept pieces are free (100% discount); the cashier lowers it when paid
		onDiscountPct(100);
	} catch (e) {
		error.value = parseError(e).message;
	}
}

/** Sell and Return of a row always add up to its quantity: changing one moves the other. */
/** Puts the clamped value back into the box: when the value did not change, Vue would leave the typed one. */
function showIn(input, value) {
	if (input && String(input.value) !== String(value)) input.value = value;
}

function setQty(r, side, value, input = null) {
	const v = Math.min(Math.max(Math.floor(Number(value) || 0), 0), r.pending);
	showIn(input, v);
	if (side === "sell") {
		r.sell = v;
		r.ret = r.pending - v;
	} else {
		r.ret = v;
		r.sell = r.pending - v;
	}
}

function setAll(side) {
	for (const r of openRows.value) setQty(r, side, r.pending);
}

function onDiscountPct(value, input = null) {
	const pct = Math.min(Math.max(Number(value) || 0, 0), 100);
	discountPct.value = Math.round(pct * 100) / 100;
	if (input && (Number(value) > 100 || Number(value) < 0)) showIn(input, discountPct.value);
	pay.value = roundCurrency((soldValue.value * (100 - pct)) / 100);
}

function onPay(value, input = null) {
	const v = Math.min(Math.max(Number(value) || 0, 0), soldValue.value);
	pay.value = roundCurrency(v);
	if (input && (Number(value) > soldValue.value || Number(value) < 0)) showIn(input, pay.value);
	discountPct.value = soldValue.value
		? Math.round(((soldValue.value - v) / soldValue.value) * 10000) / 100
		: 0;
}

async function settle() {
	if (busy.value) return;
	const amount = soldQty.value ? roundCurrency(Number(pay.value) || 0) : 0;
	if (amount < 0) {
		error.value = __("The amount received cannot be negative.");
		return;
	}
	if (amount > soldValue.value + 0.005) {
		error.value = __("Pay is more than the price of the sold pieces.");
		return;
	}
	busy.value = true;
	error.value = "";
	// the bill prints into a window opened inside this click (opened later, the browser blocks it)
	let printWindow = soldQty.value ? openPrintWindow() : null;
	try {
		const res = await call("rfid_retail.api.on_approval.settle", {
			delivery_note: note.value.name,
			rows: openRows.value
				.filter((r) => r.sell || r.ret)
				.map((r) => ({ dn_detail: r.dn_detail, keep: r.sell, back: r.ret })),
			amount_received: amount,
			mode_of_payment: amount > 0 ? mode.value || null : null,
			pos_profile: props.posProfile,
			pos_opening_shift: props.posOpeningShift || null,
		});
		const parts = [];
		if (res.sales_invoice) parts.push(__("bill {0} for {1}", [res.sales_invoice, formatCurrency(res.grand_total)]));
		if (res.return_note) parts.push(__("{0} piece(s) back ({1})", [qtyText(res.returned_qty), res.return_note]));
		showSuccess(__("Approval {0} settled: {1}", [res.delivery_note, parts.join(", ")]));
		emit("settled", res, printWindow);
		printWindow = null;
		note.value = null;
		await load();
	} catch (e) {
		error.value = parseError(e).message;
		closePrintWindow(printWindow);
	} finally {
		busy.value = false;
	}
}

function printNote() {
	emit("print", { doctype: "Delivery Note", name: note.value.name, format: note.value.print_format });
}
</script>

<style scoped>
.step {
	width: 2rem;
	height: 2rem;
	border-radius: 0.5rem;
	border: 1px solid rgb(209 213 219);
	font-weight: 700;
	font-size: 1rem;
	line-height: 1;
}
.qty {
	width: 3rem;
	height: 2rem;
	border-radius: 0.5rem;
	border: 1px solid rgb(209 213 219);
	text-align: center;
	font-weight: 700;
	-moz-appearance: textfield;
}
.qty::-webkit-outer-spin-button,
.qty::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}
.step:active {
	background: rgb(243 244 246);
}
</style>
