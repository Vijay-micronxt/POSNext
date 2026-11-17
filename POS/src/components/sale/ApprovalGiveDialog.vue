<template>
	<Dialog v-model="open" :options="{ title: __('Give on Approval'), size: 'md' }">
		<template #body-content>
			<!-- pointerdown.stop: the dialog overlay would otherwise keep these inputs from taking focus -->
			<div class="flex flex-col gap-3 text-start text-sm text-gray-700" @pointerdown.stop>
				<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
					{{
						__(
							"The customer takes these pieces home without paying. Their tags come off now. Later, bill the pieces they keep and take back the rest from Approvals."
						)
					}}
				</div>
				<div class="grid grid-cols-3 gap-2">
					<div class="col-span-3 rounded-lg border border-gray-200 px-3 py-2">
						<p class="text-xs text-gray-500">{{ __("Customer") }}</p>
						<p class="font-semibold text-gray-900 truncate">{{ customerLabel }}</p>
					</div>
					<div class="rounded-lg border border-gray-200 px-3 py-2">
						<p class="text-xs text-gray-500">{{ __("Pieces") }}</p>
						<p class="font-semibold text-gray-900">{{ pieces }}</p>
					</div>
					<div class="col-span-2 rounded-lg border border-gray-200 px-3 py-2">
						<p class="text-xs text-gray-500">{{ __("Value") }}</p>
						<p class="font-semibold text-gray-900">{{ formatCurrency(total) }}</p>
					</div>
				</div>
				<input
					v-if="!pending"
					v-model="note"
					type="text"
					class="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm"
					:placeholder="__('Note (optional), e.g. for the wedding, back by Sunday')"
				/>

				<div v-if="mode === 'pin' && pending" class="space-y-2 rounded-lg bg-blue-50 p-3">
					<p class="text-xs text-blue-800">
						{{
							__("PIN sent to {0} approver(s){1}. Valid till {2}. They can also approve from the notification; this screen moves on by itself.", [
								request.sent_to,
								request.whatsapp ? __(" by WhatsApp and notification") : __(" as a notification"),
								validTill,
							])
						}}
					</p>
					<input
						v-model="pin"
						type="text"
						inputmode="numeric"
						maxlength="6"
						autocomplete="one-time-code"
						class="w-full h-11 px-3 rounded-lg border border-gray-300 text-center text-lg tracking-[0.4em] font-semibold"
						:placeholder="__('6 digit PIN')"
						@keydown.enter="primary"
					/>
				</div>
				<button
					v-if="rfid.goodsApproval === 'pin_or_password' && !pending"
					type="button"
					class="text-xs text-blue-600 underline text-start"
					@click="useLogin = !useLogin"
				>
					{{ useLogin ? __("Use a PIN instead") : __("Approver is here: use their login instead") }}
				</button>
				<div v-if="mode === 'password'" class="space-y-2 rounded-lg bg-gray-50 p-3">
					<p class="text-xs font-medium text-gray-600">{{ __("Approver login") }}</p>
					<input
						v-model="manager"
						type="text"
						autocomplete="off"
						class="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm"
						:placeholder="__('Approver login (email)')"
					/>
					<input
						v-model="password"
						type="password"
						autocomplete="new-password"
						class="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm"
						:placeholder="__('Approver password')"
						@keydown.enter="primary"
					/>
				</div>
				<p v-if="mode === 'self'" class="text-xs text-gray-500">
					{{ __("You can approve this yourself.") }}
				</p>
				<p v-if="error" class="text-sm text-red-600">{{ error }}</p>
			</div>
		</template>
		<template #actions>
			<div class="flex gap-2 w-full">
				<Button class="flex-1" variant="subtle" @click="open = false">{{ __("Cancel") }}</Button>
				<Button class="flex-1" variant="solid" :loading="busy" @click="primary">{{ primaryLabel }}</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { usePosRfidStore } from "@/stores/posRfid";
import { DEFAULT_CURRENCY, formatCurrency as formatCurrencyUtil } from "@/utils/currency";
import { parseError } from "@/utils/errorHandler";
import { closePrintWindow, openPrintWindow } from "@/utils/printInvoice";
import { Button, Dialog } from "frappe-ui";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	customer: { type: [Object, String], default: null },
	items: { type: Array, default: () => [] },
	total: { type: Number, default: 0 },
	currency: { type: String, default: DEFAULT_CURRENCY },
});
const emit = defineEmits(["update:modelValue", "given"]);

const rfid = usePosRfidStore();
const open = computed({
	get: () => props.modelValue,
	set: (v) => emit("update:modelValue", v),
});

const note = ref("");
const pin = ref("");
const manager = ref("");
const password = ref("");
const useLogin = ref(false);
const busy = ref(false);
const error = ref("");
const request = ref(null);
let poll = null;

const customerName = computed(() => props.customer?.name || props.customer || "");
const customerLabel = computed(() => props.customer?.customer_name || customerName.value);
const pieces = computed(() => props.items.reduce((n, r) => n + (Number(r.qty) || 0), 0));
const pending = computed(() => request.value?.status === "Pending");
const validTill = computed(() => String(request.value?.expires_at || "").slice(11, 16));

const mode = computed(() => {
	const m = rfid.goodsApproval;
	if (m === "pin_or_password") return useLogin.value ? "password" : "pin";
	return m;
});

const primaryLabel = computed(() => {
	if (mode.value !== "pin") return __("Give on approval");
	if (pending.value) return __("Confirm PIN");
	return request.value ? __("Ask again") : __("Ask approver for PIN");
});

function formatCurrency(v) {
	return formatCurrencyUtil(v, props.currency);
}

function stopPoll() {
	clearInterval(poll);
	poll = null;
}

watch(open, (v) => {
	if (v) {
		note.value = "";
		pin.value = "";
		manager.value = "";
		password.value = "";
		useLogin.value = false;
		error.value = "";
		request.value = null;
	} else {
		stopPoll();
		password.value = "";
	}
});
onBeforeUnmount(stopPoll);

/** Request status from a PIN check or a poll: approved gives the goods, anything final asks again. */
async function applyStatus(res) {
	if (!request.value) return;
	request.value = { ...request.value, status: res.status };
	if (res.error) error.value = res.error;
	if (res.status === "Approved") {
		stopPoll();
		return give({ request: request.value.request });
	}
	if (res.status !== "Pending") {
		stopPoll();
		if (!res.error) error.value = __("This request is {0}. Ask again.", [__(res.status)]);
	}
}

async function askPin() {
	busy.value = true;
	error.value = "";
	try {
		const res = await rfid.requestGoodsApproval({
			customer: customerName.value,
			qty: pieces.value,
			amount: props.total,
			note: note.value.trim(),
		});
		if (!res.request) return give({}); // no approval needed after all
		request.value = res;
		pin.value = "";
		stopPoll();
		poll = setInterval(async () => {
			if (busy.value) return;
			try {
				await applyStatus(await rfid.goodsApprovalStatus(res.request));
			} catch {
				/* keep waiting; the PIN still works */
			}
		}, 3000);
	} catch (e) {
		error.value = parseError(e).message;
	} finally {
		busy.value = false;
	}
}

async function confirmPin() {
	const digits = pin.value.replace(/\D/g, "");
	if (digits.length !== 6) {
		error.value = __("Enter the 6 digit PIN.");
		return;
	}
	busy.value = true;
	error.value = "";
	try {
		const res = await rfid.confirmGoodsPin(request.value.request, digits);
		pin.value = "";
		busy.value = false;
		if (res.status !== "Approved") {
			closePrintWindow(printWindow);
			printWindow = null;
		}
		await applyStatus(res);
	} catch (e) {
		error.value = parseError(e).message;
	} finally {
		busy.value = false;
	}
}

// Opened inside the cashier's click: a print window opened after the server answers is blocked.
let printWindow = null;
function preparePrint() {
	if (!printWindow || printWindow.closed) printWindow = openPrintWindow();
}

async function give(approvalArgs) {
	busy.value = true;
	error.value = "";
	try {
		const res = await rfid.giveOnApproval({
			customer: customerName.value,
			items: props.items,
			note: note.value.trim(),
			...approvalArgs,
		});
		emit("given", res, printWindow);
		printWindow = null;
		open.value = false;
	} catch (e) {
		error.value = parseError(e).message;
		password.value = "";
		closePrintWindow(printWindow);
		printWindow = null;
	} finally {
		busy.value = false;
	}
}

function primary() {
	if (busy.value) return;
	if (mode.value === "self") {
		preparePrint();
		return give({});
	}
	if (mode.value === "password") {
		if (!manager.value.trim() || !password.value) {
			error.value = __("An approver has to approve this. Enter the approver's login and password.");
			return;
		}
		preparePrint();
		return give({ manager: manager.value.trim(), password: password.value });
	}
	if (pending.value) {
		preparePrint();
		return confirmPin();
	}
	return askPin();
}
</script>
