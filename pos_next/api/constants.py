# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

"""
Shared constants for POS Next API modules.

This module contains shared constants, field lists, and default values
used across multiple API modules to maintain DRY principles.

Note: Some settings are derived from POS Profile as single source of truth:
- allow_write_off_change: derived from POS Profile (write_off_account + write_off_limit > 0)
- disable_rounded_total: uses POS Profile value directly
"""

# Fields to fetch from POS Settings
# Used by both bootstrap.py and pos_profile.py
POS_SETTINGS_FIELDS = [
	"name",
	"enabled",
	"tax_inclusive",
	"allow_user_to_edit_additional_discount",
	"allow_user_to_edit_item_discount",
	"allow_user_to_edit_rate",
	"use_percentage_discount",
	"max_discount_allowed",
	"round_up_payable",
	"payable_rounding_step",
	"allow_credit_sale",
	"allow_customer_credit_payment",
	"allow_return",
	"allow_partial_payment",
	"use_exact_amount",
	"decimal_precision",
	"allow_negative_stock",
	"enable_sales_persons",
	"silent_print",
	"allow_print_draft_invoices",
	"allow_sales_order",
	"allow_select_sales_order",
	"create_only_sales_order",
	"enable_session_lock",
	"session_lock_timeout",
	"show_variants_as_items",
	"display_item_sku",
]

# Default POS Settings values
# Used when no POS Settings found or on error
DEFAULT_POS_SETTINGS = {
	"enabled": 0,
	"tax_inclusive": 0,
	"allow_user_to_edit_additional_discount": 0,
	"allow_user_to_edit_item_discount": 1,
	"allow_user_to_edit_rate": 0,
	"use_percentage_discount": 0,
	"max_discount_allowed": 0,
	"round_up_payable": 0,
	"payable_rounding_step": "10",
	"disable_rounded_total": 0,  # Derived from POS Profile
	"allow_credit_sale": 0,
	"allow_customer_credit_payment": 0,
	"allow_return": 0,
	"allow_write_off_change": 0,  # Derived from POS Profile
	"allow_partial_payment": 0,
	"use_exact_amount": 0,
	"decimal_precision": "2",
	"allow_negative_stock": 0,
	"enable_sales_persons": "Disabled",
	"silent_print": 0,
	"allow_print_draft_invoices": 0,
	"allow_sales_order": 0,
	"allow_select_sales_order": 0,
	"create_only_sales_order": 0,
	"enable_session_lock": 0,
	"session_lock_timeout": 5,
	"show_variants_as_items": 0,
	"display_item_sku": 0,
}


def get_pos_settings_values(filters, fields=None):
	"""Read POS Settings fields for one record, tolerating columns not created yet.

	A field added in code exists in the database only after ``bench migrate``. Asking
	for it before then fails the whole query ("Unknown column"), and callers used to
	fall back to DEFAULT_POS_SETTINGS for every field - e.g. tax_inclusive dropped
	to 0 and the POS added tax to tax-inclusive prices. Here only existing columns
	are read; a missing one takes its default and a warning is logged.

	Args:
		filters: filters or name of the POS Settings record
		fields: fields to read (default: POS_SETTINGS_FIELDS)

	Returns:
		frappe._dict with every requested field, or None when there is no record.
	"""
	import frappe

	fields = list(fields or POS_SETTINGS_FIELDS)
	present = [f for f in fields if f == "name" or frappe.db.has_column("POS Settings", f)]
	missing = [f for f in fields if f not in present]
	if missing:
		frappe.logger("pos_next").warning(
			"POS Settings columns missing (run bench migrate): %s", ", ".join(missing)
		)

	row = frappe.db.get_value("POS Settings", filters, present, as_dict=True) if present else None
	if not row:
		return None
	for field in missing:
		row[field] = DEFAULT_POS_SETTINGS.get(field)
	return row

