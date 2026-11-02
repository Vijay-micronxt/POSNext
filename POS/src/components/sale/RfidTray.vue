<!--
  RfidTray.vue - RFID counter panel (optional module)

  Shown above the cart only when the counter runs in RFID mode (see stores/posRfid.js).
  The tray reader (or a keyboard-wedge bridge) types EPCs into the input; Enter reads them.
  Complete units go straight into the cart (with their serial number when the item has
  one; otherwise as one more unit of the item). Incomplete sets stay
  here with their missing pieces and block payment until fixed or removed.
-->
<template>
	<div class="border-b border-gray-200 bg-white px-3 py-2">
		<div class="flex items-center gap-2">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
				<FeatherIcon name="radio" class="h-4 w-4" />
			</div>
			<input
				ref="inputRef"
				v-model="reads"
				type="text"
				class="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
				:placeholder="offline ? __('RFID needs a connection') : __('Place garments on the tray or scan a tag')"
				:disabled="offline"
				@keydown.enter.prevent="readTray"
				@paste="onPaste"
			/>
			<button
				class="h-9 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white disabled:opacity-50"
				:disabled="offline || !reads.trim()"
				@click="readTray"
			>
				{{ rfid.busy ? __("Reading…") : __("Read") }}
			</button>
		</div>

		<label v-if="rfid.config.allow_label_fallback" class="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
			<input v-model="labelMode" type="checkbox" class="h-3.5 w-3.5" />
			{{ __("Tag unreadable - scanning printed labels") }}
		</label>

		<div v-for="line in rfid.incomplete" :key="rfid.keyOf(line)" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<div class="truncate text-sm font-medium text-gray-900">{{ line.item_name }}</div>
					<div class="text-xs text-amber-700">{{ __("Set incomplete - read the missing pieces") }}</div>
				</div>
				<button class="shrink-0 text-xs font-medium text-gray-500 hover:text-red-600" @click="rfid.removeUnit(rfid.keyOf(line))">
					{{ __("Remove") }}
				</button>
			</div>
			<div class="mt-1.5 flex flex-wrap gap-1">
				<span
					v-for="p in line.pieces"
					:key="p.component"
					:class="[
						'rounded-full px-2 py-0.5 text-xs font-medium',
						p.verified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
					]"
				>
					{{ p.verified ? "✓" : "✕" }} {{ p.role }}
				</span>
			</div>
		</div>

		<div v-for="(e, i) in rfid.events" :key="i" class="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
			{{ e.message }}
		</div>

		<!-- Cart quantity went down: which piece went back? -->
		<Dialog
			:model-value="!!removal"
			:options="{ title: __('Which piece is taken off the bill?'), size: 'sm' }"
			@update:model-value="(open) => !open && closeRemoval()"
		>
			<template #body-content>
				<div v-if="removal" class="space-y-3 py-2 text-sm text-gray-700" @pointerdown.stop>
					<p>
						{{ __("{0}: {1} piece(s) to take off. Pick each one.", [removal.name, removal.left]) }}
					</p>
					<button
						v-if="removal.noTag > 0"
						type="button"
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-left hover:bg-gray-50"
						@click="removePiece('notag')"
					>
						{{ __("Piece without a tag") }} <span class="text-gray-500">({{ removal.noTag }})</span>
					</button>
					<button
						v-if="removal.unread > 0"
						type="button"
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-left hover:bg-gray-50"
						@click="removePiece('unread')"
					>
						{{ __("Piece whose tag would not read (approved)") }} <span class="text-gray-500">({{ removal.unread }})</span>
					</button>
					<div v-if="removal.tags.length" class="space-y-1.5">
						<div class="font-medium">{{ __("Piece read on the tray - read its tag, or pick it:") }}</div>
						<input
							v-model="removalScan"
							type="text"
							class="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
							:placeholder="__('Read the tag of the piece going back')"
							@keydown.enter.prevent="removalScanned"
						/>
						<div class="flex flex-wrap gap-1">
							<button
								v-for="t in removal.tags"
								:key="t"
								type="button"
								class="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs text-indigo-700 hover:bg-indigo-100"
								@click="removePiece('tag', t)"
							>
								{{ t }}
							</button>
						</div>
					</div>
					<p class="text-xs text-gray-500">
						{{ __("Closing without picking takes off pieces without a tag first, then approved ones, then the last tags read.") }}
					</p>
				</div>
			</template>
		</Dialog>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Dialog, FeatherIcon } from "frappe-ui";
import { useToast } from "@/composables/useToast";
import { useItemSearchStore } from "@/stores/itemSearch";
import { usePOSCartStore } from "@/stores/posCart";
import { usePosRfidStore } from "@/stores/posRfid";
import { usePOSShiftStore } from "@/stores/posShift";
import { usePOSSyncStore } from "@/stores/posSync";

const rfid = usePosRfidStore();
const cartStore = usePOSCartStore();
const shiftStore = usePOSShiftStore();
const itemStore = useItemSearchStore();
const syncStore = usePOSSyncStore();
const { showError } = useToast();

const reads = ref("");
const labelMode = ref(false);
const inputRef = ref(null);
const itemCache = new Map();
const offline = computed(() => syncStore.isOffline);

function splitCodes(text) {
	return text
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function onPaste(event) {
	// A pasted batch (one EPC per line) is read immediately.
	const text = event.clipboardData?.getData("text") || "";
	if (splitCodes(text).length > 1) {
		event.preventDefault();
		reads.value = text;
		readTray();
	}
}

// The reader keeps typing while a read is on its way to the server, so the input stays
// enabled (a disabled input drops the first characters of the next tag) and reads queue up.
const queue = [];
let draining = false;

async function readTray() {
	const codes = splitCodes(reads.value);
	if (!codes.length) return;
	reads.value = "";
	queue.push({ codes, source: labelMode.value ? "Barcode" : "RFID" });
	if (draining) return;
	draining = true;
	try {
		while (queue.length) {
			// Everything queued with the same source goes to the server in one call.
			const { source } = queue[0];
			const batch = [];
			while (queue.length && queue[0].source === source) batch.push(...queue.shift().codes);
			try {
				await rfid.scan(batch, source);
				await schedulePush();
			} catch (error) {
				showError(error?.messages?.[0] || error?.message || __("RFID read failed"));
			}
		}
	} finally {
		draining = false;
	}
	await nextTick();
	inputRef.value?.focus();
}

async function itemDetails(itemCode) {
	if (!itemCache.has(itemCode)) {
		itemCache.set(itemCode, await itemStore.searchByBarcode(itemCode));
	}
	return itemCache.get(itemCode);
}

// Pushes run one after another so a unit is never added twice while item details load.
let pushChain = Promise.resolve();
function schedulePush() {
	pushChain = pushChain.then(pushCompleteUnits).catch(() => {});
	return pushChain;
}

/** Complete units on the tray -> cart lines (with their serial number when the item has one). */
async function pushCompleteUnits() {
	for (const line of rfid.pendingForCart()) {
		const details = await itemDetails(line.item_code);
		const unit = line.serial_no
			? { ...details, serial_no: line.serial_no, has_serial_no: 1, quantity: 1 }
			: { ...details, quantity: 1 };
		try {
			cartStore.addItem(unit, 1, false, shiftStore.currentProfile);
			rfid.markInCart(rfid.keyOf(line));
		} catch (error) {
			showError(error.message);
		}
	}
}

// Keep the basket in step with the cart: a unit removed from the cart leaves the tray too.
const cartSerials = computed(() => {
	const all = new Set();
	for (const item of cartStore.invoiceItems) {
		for (const s of (item.serial_no || "").split("\n"))
			if (s.trim()) all.add(s.trim());
	}
	return all;
});
watch(cartSerials, (now) => {
	// Only units this tray put into the cart; incomplete sets live in the panel, not the cart.
	for (const line of rfid.lines) {
		if (line.serial_no && rfid.inCart.has(line.serial_no) && !now.has(line.serial_no))
			rfid.removeUnit(line.serial_no).catch(() => {});
	}
});

// Items without serial numbers: a cart line can hold pieces read on the tray (each its own tag),
// pieces approved as "tag will not read" and pieces without a tag. When its quantity goes down the
// cashier says which piece went back (and for a tagged one, which tag), so the tray and the approvals
// stay true. The whole line removed: all its tags and approvals go.
const cartQty = computed(() => {
	const qty = {};
	for (const item of cartStore.invoiceItems) {
		if (!(item.serial_no || "").trim())
			qty[item.item_code] = (qty[item.item_code] || 0) + Number(item.quantity || item.qty || 0);
	}
	return qty;
});
const removal = ref(null); // { itemCode, name, left, tags, unread, noTag }
const removalScan = ref("");
const removalQueue = [];

watch(cartQty, (now, before = {}) => {
	for (const itemCode of Object.keys(before)) {
		const was = Math.floor(before[itemCode] || 0);
		const is = Math.floor(now[itemCode] || 0);
		if (is >= was) continue;
		const tags = rfid.itemTagsInCart(itemCode);
		const unread = Math.min(rfid.unread[itemCode] || 0, Math.max(was - tags.length, 0));
		const noTag = Math.max(was - tags.length - unread, 0);
		if (is <= 0) {
			for (const key of tags) rfid.removeUnit(key).catch(() => {});
			if (unread) rfid.dropUnread(itemCode).catch(() => {});
			continue;
		}
		const gone = was - is;
		const kinds = [tags.length, unread, noTag].filter((n) => n > 0).length;
		if (kinds <= 1 && !(tags.length > gone)) {
			// one kind only, and nothing to choose: settle at once
			settleRemoval({ itemCode, tags, unread, noTag }, gone);
			continue;
		}
		const line = cartStore.invoiceItems.find((i) => i.item_code === itemCode);
		removalQueue.push({ itemCode, name: line?.item_name || itemCode, left: gone, tags: [...tags], unread, noTag });
	}
	if (!removal.value && removalQueue.length) removal.value = removalQueue.shift();
});

// A basket opened or reloaded with approvals for pieces that are not in the cart (cart cleared, page
// reloaded): drop them once, so they never let a later hand-picked piece in without a question.
let reconciled = null;
watch(
	() => rfid.basket,
	async (name) => {
		if (!name || reconciled === name) return;
		reconciled = name;
		await nextTick();
		const qty = cartQty.value;
		for (const [itemCode, approved] of Object.entries(rfid.unread || {})) {
			const handPicked = Math.max(Math.floor(qty[itemCode] || 0) - rfid.itemTagsInCart(itemCode).length, 0);
			if (approved > handPicked) rfid.dropUnread(itemCode, approved - handPicked).catch(() => {});
		}
	},
	{ immediate: true },
);

/** No answer (dialog closed): pieces without a tag go first, then approvals, then the last tags read. */
function settleRemoval(state, count) {
	let left = count;
	const fromNoTag = Math.min(left, state.noTag);
	left -= fromNoTag;
	const fromUnread = Math.min(left, state.unread);
	left -= fromUnread;
	if (fromUnread) rfid.dropUnread(state.itemCode, fromUnread).catch(() => {});
	for (const key of state.tags.slice(state.tags.length - left)) rfid.removeUnit(key).catch(() => {});
}

function nextRemoval() {
	removalScan.value = "";
	removal.value = removalQueue.length ? removalQueue.shift() : null;
}

function removePiece(kind, tag = null) {
	const r = removal.value;
	if (!r) return;
	if (kind === "tag") {
		if (!r.tags.includes(tag)) return showError(__("Tag {0} is not on this bill for {1}.", [tag, r.name]));
		rfid.removeUnit(tag).catch(() => {});
		r.tags = r.tags.filter((t) => t !== tag);
	} else if (kind === "unread") {
		rfid.dropUnread(r.itemCode, 1).catch(() => {});
		r.unread -= 1;
	} else r.noTag -= 1;
	r.left -= 1;
	if (r.left <= 0) nextRemoval();
}

function removalScanned() {
	for (const code of splitCodes(removalScan.value.toUpperCase())) if (removal.value) removePiece("tag", code);
	removalScan.value = "";
}

function closeRemoval() {
	const r = removal.value;
	if (r && r.left > 0) settleRemoval(r, r.left);
	nextRemoval();
}

// The invoice carries the basket so the server can verify every unit was read.
watch(
	() => rfid.basket,
	() => {
		cartStore.invoiceExtras = rfid.invoiceExtras();
	},
	{ immediate: true },
);

// Covers a basket resumed after a reload: its complete units appear once it loads.
watch(() => rfid.lines, schedulePush, { immediate: true });

onMounted(() => inputRef.value?.focus());
</script>
