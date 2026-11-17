<template>
	<Dialog v-model="open" :options="{ title: note ? __('Settle {0}', [note.name]) : __('Goods on Approval'), size: '3xl' }">
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
								<p class="text-xs text-amber-700">{{ __("{0} piece(s) out", [qtyText(n.pending_qty)]) }}</p>
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
							<Button size="sm" variant="subtle" @click="setAll('keep')">{{ __("Keeps all") }}</Button>
							<Button size="sm" variant="subtle" @click="setAll('back')">{{ __("All back") }}</Button>
						</div>
					</div>
					<div class="max-h-[45vh] overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
						<div v-for="r in openRows" :key="r.dn_detail" class="px-3 py-2.5 flex flex-wrap items-center gap-3">
							<div class="min-w-0 flex-1">
								<p class="font-medium text-gray-900 truncate">{{ r.item_name }}</p>
								<p class="text-xs text-gray-500 truncate">
									{{ r.item_code }} · {{ formatCurrency(r.price) }} · {{ __("{0} out", [qtyText(r.pending)]) }}
								</p>
							</div>
							<div class="flex items-center gap-4">
								<div class="text-center">
									<p class="text-[11px] font-semibold text-green-700 mb-1">{{ __("Keeps") }}</p>
									<div class="flex items-center gap-1">
										<button type="button" class="step" @click="bump(r, 'keep', -1)">−</button>
										<span class="w-7 text-center font-semibold">{{ qtyText(r.keep) }}</span>
										<button type="button" class="step" @click="bump(r, 'keep', 1)">+</button>
									</div>
								</div>
								<div class="text-center">
									<p class="text-[11px] font-semibold text-red-700 mb-1">{{ __("Back") }}</p>
									<div class="flex items-center gap-1">
										<button type="button" class="step" @click="bump(r, 'back', -1)">−</button>
										<span class="w-7 text-center font-semibold">{{ qtyText(r.back) }}</span>
										<button type="button" class="step" @click="bump(r, 'back', 1)">+</button>
									</div>
								</div>
							</div>
						</div>
					</div>
					<p v-if="stillOut > 0" class="text-xs text-amber-700">
						{{ __("{0} piece(s) not marked stay out with the customer on this note.", [qtyText(stillOut)]) }}
					</p>

					<div v-if="keptQty > 0" class="rounded-lg border border-gray-200 p-3 space-y-2">
						<div class="flex justify-between">
							<span>{{ __("Price of kept pieces ({0})", [qtyText(keptQty)]) }}</span>
							<span class="font-semibold">{{ formatCurrency(keptValue) }}</span>
						</div>
						<div class="flex items-center justify-between gap-3">
							<label class="font-medium">{{ __("Amount received") }}</label>
							<input
								v-model.number="received"
								type="number"
								min="0"
								step="0.01"
								class="w-40 h-9 px-3 rounded-lg border border-gray-300 text-end font-semibold"
								@input="receivedEdited = true"
							/>
						</div>
						<div class="flex gap-2 justify-end">
							<Button size="sm" variant="subtle" @click="setReceived(keptValue)">{{ __("Full price") }}</Button>
							<Button size="sm" variant="subtle" @click="setReceived(0)">{{ __("Free (100% discount)") }}</Button>
						</div>
						<div v-if="discount > 0" class="flex justify-between text-green-700">
							<span>{{ __("Given as discount") }}</span>
							<span class="font-semibold">{{ formatCurrency(discount) }}</span>
						</div>
						<div v-if="received > 0" class="flex items-center justify-between gap-3">
							<label class="font-medium">{{ __("Paid by") }}</label>
							<select v-model="mode" class="w-40 h-9 px-2 rounded-lg border border-gray-300 text-sm">
								<option v-for="m in modes" :key="m.mode_of_payment" :value="m.mode_of_payment">
									{{ __(m.mode_of_payment) }}
								</option>
							</select>
						</div>
					</div>
					<p v-if="backQty > 0" class="text-xs text-gray-600">
						{{ __("{0} piece(s) come back into stock without a tag. Tag them again at the Tag garments station.", [qtyText(backQty)]) }}
					</p>
				</template>
				<p v-if="error" class="text-sm text-red-600">{{ error }}</p>
			</div>
		</template>
		<template #actions>
			<div v-if="note" class="flex gap-2 w-full">
				<Button variant="subtle" @click="note = null; load()">{{ __("Back") }}</Button>
				<Button variant="subtle" @click="printNote">{{ __("Print note") }}</Button>
				<Button class="flex-1" variant="solid" :loading="busy" :disabled="!keptQty && !backQty" @click="settle">
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
const received = ref(0);
const receivedEdited = ref(false);
const modes = ref([]);
const mode = ref("");
const busy = ref(false);
const error = ref("");
let searchTimer = null;

const openRows = computed(() => rows.value.filter((r) => r.pending > 0));
const keptQty = computed(() => openRows.value.reduce((n, r) => n + r.keep, 0));
const backQty = computed(() => openRows.value.reduce((n, r) => n + r.back, 0));
const stillOut = computed(() => openRows.value.reduce((n, r) => n + r.pending - r.keep - r.back, 0));
const keptValue = computed(() => roundCurrency(openRows.value.reduce((n, r) => n + r.price * r.keep, 0)));
const discount = computed(() => Math.max(roundCurrency(keptValue.value - (Number(received.value) || 0)), 0));
const settleLabel = computed(() => {
	if (keptQty.value && backQty.value) return __("Bill kept + take back");
	if (keptQty.value) return __("Bill kept pieces");
	return __("Take back");
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

// the received amount follows the kept pieces until the cashier types one
watch(keptValue, (v) => {
	if (!receivedEdited.value) received.value = v;
});

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
		rows.value = d.rows.map((r) => ({ ...r, keep: 0, back: 0 }));
		receivedEdited.value = false;
		received.value = 0;
	} catch (e) {
		error.value = parseError(e).message;
	}
}

function bump(r, side, step) {
	const other = side === "keep" ? "back" : "keep";
	const next = r[side] + step;
	if (next < 0 || next + r[other] > r.pending) return;
	r[side] = next;
}

function setAll(side) {
	const other = side === "keep" ? "back" : "keep";
	for (const r of openRows.value) {
		r[side] = r.pending;
		r[other] = 0;
	}
}

function setReceived(v) {
	received.value = roundCurrency(v);
	receivedEdited.value = true;
}

async function settle() {
	if (busy.value) return;
	const amount = keptQty.value ? roundCurrency(Number(received.value) || 0) : 0;
	if (amount < 0) {
		error.value = __("The amount received cannot be negative.");
		return;
	}
	if (amount > keptValue.value + 0.005) {
		error.value = __("Received is more than the price of the kept pieces.");
		return;
	}
	busy.value = true;
	error.value = "";
	// the bill prints into a window opened inside this click (opened later, the browser blocks it)
	let printWindow = keptQty.value ? openPrintWindow() : null;
	try {
		const res = await call("rfid_retail.api.on_approval.settle", {
			delivery_note: note.value.name,
			rows: openRows.value
				.filter((r) => r.keep || r.back)
				.map((r) => ({ dn_detail: r.dn_detail, keep: r.keep, back: r.back })),
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
.step:active {
	background: rgb(243 244 246);
}
</style>
