// POS Next saves only the payment rows used on the bill, without the profile's "default" flag.
// ERPNext's desk then zeroes every non-default row on each recalculation (amend, edit) and, with
// no default row to take the total, the payments of the bill are lost. Leave such rows alone.
(() => {
	const proto = erpnext?.taxes_and_totals?.prototype;
	if (!proto || proto.__pos_next_payment_guard) return;
	const set_default_payment = proto.set_default_payment;
	proto.set_default_payment = function (...args) {
		const payments = this.frm?.doc?.payments || [];
		if (payments.length && !payments.some((p) => cint(p.default))) return;
		return set_default_payment.apply(this, args);
	};
	proto.__pos_next_payment_guard = true;
})();
