# POS Next: user manual

This manual explains how a store runs its counters on POS Next: setting it up, opening a shift,
selling, taking payment, returns, drafts, offline sales and closing the shift. It is written for
cashiers, store managers and the people who set up a site. It describes this fork
([Vijay-micronxt/POSNext](https://github.com/Vijay-micronxt/POSNext), branch `develop`), which
adds RFID counter mode, per-item GST and a few fixes (see [FORK_CHANGES.md](../FORK_CHANGES.md)).

RFID stores also need the [RFID Retail user manual](https://github.com/Vijay-micronxt/RFID_Operations/blob/main/docs/USER_MANUAL.md)
for tagging, stations and stock counts. Section 12 below covers what changes at an RFID counter.

**Contents**

1. [What POS Next is](#1-what-pos-next-is)
2. [Setup (once per site)](#2-setup-once-per-site)
3. [Opening POS Next and a shift](#3-opening-pos-next-and-a-shift)
4. [The sale screen](#4-the-sale-screen)
5. [Adding items](#5-adding-items)
6. [The cart: quantity, price, discount, customer](#6-the-cart-quantity-price-discount-customer)
7. [Offers and coupons](#7-offers-and-coupons)
8. [Payment](#8-payment)
9. [Drafts, invoice history, reprint](#9-drafts-invoice-history-reprint)
10. [Returns](#10-returns)
11. [Offline selling](#11-offline-selling)
12. [RFID counter mode](#12-rfid-counter-mode)
13. [Closing the shift](#13-closing-the-shift)
14. [Manager tools (left menu)](#14-manager-tools-left-menu)
15. [POS Settings reference](#15-pos-settings-reference)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What POS Next is

- A full-screen point of sale for ERPNext, opened at **`https://<your-site>/pos`**. It runs in
  the browser on a PC, tablet or phone and can be installed as an app (PWA).
- Every sale is a normal ERPNext **Sales Invoice** (with *Is POS* ticked), so stock, accounts,
  GST and reports all work as in ERPNext.
- Work happens inside a **shift**: a POS Opening Shift when the counter opens and a POS Closing
  Shift when it closes, with the cash counted.
- Items, prices and customers are cached in the browser, so search is instant and the counter
  can keep selling when the internet drops (section 11).

## 2. Setup (once per site)

Done by a manager or implementer in the ERPNext desk.

1. **Install** (developer):
   ```bash
   bench get-app https://github.com/Vijay-micronxt/POSNext --branch develop
   bench --site <site> install-app pos_next
   bench --site <site> migrate
   ```
   Building the POS frontend needs Node 22.
2. **POS Profile** (one per counter, or per group of counters):
   - Company, **Warehouse** (stock is sold from here), **Customer** (the walk-in customer used
     when none is picked), Price List, Currency.
   - **Payment Methods**: every Mode of Payment the counter accepts (Cash, UPI, Card...). Each
     needs an account for the company. Mark one as default.
   - **Applicable for Users**: the cashiers who may open this profile. A user only sees the
     profiles listed for them.
   - Taxes and Charges template, Write Off account and cost center, print format.
3. **POS Settings**: one record per POS Profile. It is created with defaults the first time the
   profile is used, and can be changed from the POS itself (section 14) or in the desk
   (*POS Settings* list). Every setting is listed in section 15.
4. **Roles**:
   - **POSNext Cashier**: sells at the counter.
   - **Nexus POS Manager**: also sees **Switch To Desk** in the POS menu.
   - Cashiers on serial-tracked or GST sites also need read/create on *Serial and Batch Bundle*
     and *GST Return Log*. Check with a test sale.
5. **India GST sites (India Compliance)**: tick **Tax Inclusive** in POS Settings when shelf
   prices include GST. Without it India Compliance can refuse the invoice with *CGST, SGST amount
   mismatch*.
6. **Items**: each item needs a selling price in the profile's price list. Optional: barcodes,
   images, Item Tax Template (then each line is taxed at its own rate, section 6), variants,
   UOMs, batch or serial tracking.

## 3. Opening POS Next and a shift

1. Go to `/pos` and log in with your ERPNext user.
2. If no shift is open, the screen says *Welcome to POS Next - Please open a shift to start
   making sales*. Press **Open Shift**.
3. **Open POS Shift** dialog:
   - **Select POS Profile** (only the profiles your user is listed on).
   - **Opening Balance (Optional)**: the cash (and other methods) in the drawer at the start.
   - Press **Open Shift**.
4. If you already have an open shift, **Existing Shift Found** shows its profile and opening
   time. **Resume Shift** continues it. **Close & Open New** closes it (section 13) and opens a
   fresh one.
5. The header shows **Shift Open:** with a running timer.

Signing out with a shift still open asks **Your Shift is Still Open!** with **Close Shift & Sign
Out** or **Skip & Sign Out**. Skipping keeps the shift open for next time.

## 4. The sale screen

| Area | What it holds |
|---|---|
| Header | Shift timer, online/offline status with pending count, cache status (items cached, last sync), Silent Print status, **Refresh** (reload items and customers), user menu (language, logout). |
| Left menu | Manager tools: Promotions, Products (stock lookup), Invoice Management, Settings (section 14). |
| Item area | Search box, barcode scanner switch, Auto-Add switch, grid or list view, sort, item group / brand filter, paging. |
| Cart | Customer, Invoice / Order switch, cart lines, Offers and Coupon buttons, totals, **Checkout** and **Hold**. |
| RFID tray | Only on an RFID counter, above the cart (section 12). |

On a phone the item area and the cart are two views: use **View cart** / **View items**.

When the cart is empty it shows quick actions: **View Shift**, **Draft Invoices**, **Invoice
History**, **Return Invoice**, **Close Shift**, **Create Customer**. The same actions are in the
menu, with **Offline Invoices**, **Lock Screen** and (for managers) **Switch To Desk**.

## 5. Adding items

- **Click / tap** an item card or row. Stock is shown on each item with a colour badge.
- **Search** by item code, name, item group, or scan a barcode into the search box. Results
  come from the local cache, so they are instant. *Check availability in other warehouses*
  appears when nothing is found.
- **Barcode scanner**: the scanner button turns scanning on or off. With **Auto-Add ON**, a
  scanned or typed code followed by Enter goes straight into the cart. With Auto-Add off, the
  scan only searches.
- **Variants**: a template item opens **Select Item Variant** (pick size, colour...). With
  *Show Variants as Items* on, variants show directly in the grid.
- **Units**: an item with more than one UOM opens **Select Unit of Measure** (e.g. Piece or
  Box, with the conversion shown).
- **Batch and serial items** open **Select Batch Numbers** / **Select Serial Numbers**. Search,
  tick, **Confirm**. A serial already in the cart is refused.
- **Stock**: an item without enough stock is refused (*Insufficient Stock*) unless negative
  stock is allowed in POS Settings and in ERPNext Stock Settings.
- **Prices** come from the profile's price list. Only Item Prices valid today are used (expired
  or future-dated prices are ignored; the newest valid one wins).
- **SKU**: with *Display Item SKU* on, the item's SKU (`custom_sku`) shows in the list.

## 6. The cart: quantity, price, discount, customer

- **Quantity**: use **+** / **-** on the line, or type it when *Use QTY Input* is on. Lines
  added by a weighed or priced barcode lock their quantity and UOM.
- **Edit a line**: tap it to open **Edit Item Details**:
  - Quantity, UOM, warehouse, serial numbers.
  - **Rate**, only if *Allow User To Edit Rate* is on. Locked when an offer is applied. A rate
    cut larger than *Max Discount* is refused.
  - **Item Discount** as percentage or amount (if *Allow Item Discount* is on), up to *Max
    Discount Percentage Allowed*.
  - **Tax Details**: HSN/SAC, the Item Tax Template (or *POS Profile default*), CGST/SGST/IGST
    split, taxable value and tax, with an inclusive/exclusive badge.
  - **Update Item** saves the line.
- **Remove** a line with its cross. **Clear** empties the cart after a confirmation.
- **Sort** the cart by name, quantity or amount.
- **Tax per line**: each line is taxed at its own Item Tax Template rate, exactly as ERPNext
  will calculate the saved invoice. Items without a template use the profile's taxes.
- **Totals**: Total Quantity, Subtotal, Discount, Tax, Grand Total.
- **Customer**: type in *Search or add customer...* (name, mobile or email; typos are
  forgiven), or pick from **Frequent Customers**. **Create New Customer** asks for name and
  mobile (required), email, date of birth, anniversary, customer group and territory. The pencil
  edits the customer; the cross goes back to the walk-in customer. With *Show Customer Balance*
  on, the customer's outstanding / credit balance shows.
- **Invoice / Order**: with *Allow Create Sales Order* on, switch the cart to **Order** to make a
  Sales Order instead of an invoice (a delivery date is asked at payment).

## 7. Offers and coupons

- **Offers** come from ERPNext **Pricing Rules** and **Promotional Schemes** (discount %, fixed
  discount, free item, minimum quantity or amount, item / group / brand / whole cart).
  Eligible offers apply by themselves. **Offers** in the cart shows every offer, which are
  applied, and what is still needed (*Add {amount} more to unlock*). Free items show as **FREE**.
- **Coupon**: press **Coupon**, type the code (not case sensitive), **Apply**. The discount
  shows; **Remove** takes it off. Gift cards of the selected customer are listed under *My Gift
  Cards*. With *Auto Fetch Coupon Gifts* on, eligible coupons apply by themselves.
- Discounts are worked out on the subtotal **before tax**.
- Managers create offers and coupons from the POS too (section 14).

## 8. Payment

Press **Checkout**. The **Complete Payment** dialog shows the invoice summary and the amounts.

1. **Pick a payment method** (Cash, UPI, Card...). The full remaining amount goes on it, or use
   the **quick amount** buttons, **Custom**, or the on-screen numpad. Keyboard: digits,
   Backspace, Delete / Escape to clear, Enter to confirm.
2. **Split payment**: add a second method for the rest. *Remaining* counts down to zero.
3. **Cash** may be more than the bill: the **Change Due** shows. A very large change asks to
   confirm. Non-cash methods cannot exceed the bill; with *Use Exact Amount for Non-Cash* on
   they must equal it exactly.
4. **Write Off**: small leftover change can be written off (if allowed).
5. **Additional Discount** on the whole bill (if *Allow Additional Discount* is on), within the
   maximum discount.
6. **Sales Person**: picked here when *Sales Persons Selection* is Single or Multiple (with a
   split in %).
7. **Loyalty / wallet**: with the loyalty program on, points and wallet balance can pay part of
   the bill. See [Wallet-Loyalty-User-Guide.md](Wallet-Loyalty-User-Guide.md).
8. **Partial payment** (if allowed): pay less than the total; the invoice stays partly unpaid and
   is settled later from Invoice Management.
9. **On Account / credit sale** (if allowed): the customer pays later.
10. Press **Pay**.

After **Invoice Created Successfully** you can **Print Invoice** or **Close**. With *Silent
Print* on, the bill goes straight to the printer through QZ Tray.

If the invoice fails on the server, the error is shown and the cart is kept, so nothing is lost.
Fix the cause and pay again.

## 9. Drafts, invoice history, reprint

- **Hold** saves the cart as a **draft** (e.g. the customer went to get one more item). The
  drafts badge shows how many are waiting. **Draft Invoices** lists them: open one to load it
  back into the cart, print it (if *Allow Print Draft Invoices* is on), delete one, or **Clear
  All**.
- **Invoice History**: search by invoice number or customer. Per invoice: **View Details**
  (lines with SKU, taxes, payments), **Print**, **Create Return**.
- **Print last invoice** is available when *Allow Print Last Invoice* is on.

## 10. Returns

Needs *Allow Return* on.

1. Press **Return Invoice** (or **Create Return** from Invoice History).
2. Search the original invoice by number, customer or mobile, and pick it.
3. **Select Items to Return**: tick the lines and set the **Return Qty** (up to what was sold
   less anything already returned). **Select All** / **Clear All** help.
4. Refund:
   - Paid invoice: choose the **Refund Payment Methods** and amounts. The total must equal the
     refund.
   - Credit sale: **Add to Customer Credit Balance**.
   - Partly paid invoice: the screen splits cash refund and credit adjustment.
5. Optional **Return Reason**, then **Create Return**. A credit note (return Sales Invoice) is
   made and stock comes back.

Rules: with *Return Validity Days* set, an invoice older than that shows **Return Period
Expired** (ask a manager). *Allow Return Without Invoice* lets a return be made with no original
invoice. A return needs an open shift.

## 11. Offline selling

- When the connection drops, the header shows **Offline**. Selling goes on from the cache: items,
  prices, customers, offers and payments work.
- Invoices made offline are saved in the browser and listed under **Offline Invoices** with the
  pending count in the header. They are sent by themselves when the connection is back, or press
  **Sync All**. Each invoice is sent once only (no duplicates).
- An offline invoice can be edited, reprinted or (with *Allow Delete Offline Invoice*) deleted
  before it syncs. Not while a sync is running.
- **Do not clear the browser data** on a counter with pending offline invoices.
- **Clear Cache** (header) reloads all items and customers; only possible online.
- RFID counters cannot check out offline (section 12).

## 12. RFID counter mode

Only on a POS Profile with **RFID Counter** ticked, on a site with `rfid_retail` installed and
RFID enabled, for a cashier who holds the RFID Billing station. Every other profile works as
above.

- The **RFID tray** box sits above the cart: *Place garments on the tray or scan a tag*. The
  tray reader types each tag code and Enter. **Read** sends what was typed or pasted.
- Each read piece goes into the normal cart with its serial number (serial items) or as one
  more unit (other items).
- **Sets** (e.g. suit = jacket + trouser) missing a piece stay in the tray panel with each piece
  marked ✓ or ✕. **Checkout is blocked** (*A set on the tray is incomplete...*) until the
  missing pieces are read or the set is removed.
- **Tag unreadable - scanning printed labels**: tick it and scan the printed sticker instead
  (only when label fallback is allowed; logged for the manager).
- **Picking a tagged item by hand** (click or item barcode):
  - all pieces in stock carry a tag: refused, *Put it on the RFID tray instead*;
  - tagged and untagged pieces in stock: **Sell without reading the RFID tag?** with **Scan the
    tag** or **Piece has no tag - add**. The cart never holds more hand-picked pieces than there
    are untagged pieces.
- **Reload is safe**: the open tray basket is kept on the server and comes back.
- **Online only**: *RFID counter needs a connection to complete the sale*.
- On submit the server checks every piece again, so a rule cannot be skipped from the screen.
  After the sale the tags are freed for reuse (or kept for the detach station, per RFID
  Settings).
- Red lines under the tray box explain a refused read (unknown tag, already sold, wrong
  warehouse, on another counter...). The RFID manual lists them with what to do.

## 13. Closing the shift

1. Press **Close Shift** (menu or empty-cart actions).
2. **Close POS Shift** shows the shift: duration, **Gross Sales** (invoices), **Returns**, **Net
   Sales**, **Tax Collected**, and the list of invoices.
3. **Payment Reconciliation**: for each payment method, count what is in hand and type the
   **Actual Amount**. The screen compares with the expected amount (opening + sales - refunds)
   and shows **Balanced**, **Over** or **Short** per method and in total. With *Hide Expected
   Amount* on, the cashier does not see the expected figure (blind count).
4. Press **Close Shift**. A POS Closing Shift is submitted in ERPNext.
5. **Print EOD Report** prints the end-of-day summary. If it did not print, use the reprint
   button.

Close every shift at the end of the day. An open shift from yesterday must be closed (or
resumed) before selling again.

## 14. Manager tools (left menu)

- **Promotions**: list, create, edit, enable/disable or delete **Promotional Schemes** and
  simple **Pricing Rules** (name, validity, apply on items / item groups / brands / whole cart,
  discount % or amount or free item, minimum and maximum quantity or amount). Rules made in the
  back office open read-only. The **Coupons** tab does the same for **POS Coupons** (promotional
  or gift card; code auto-generated if blank; customer, minimum cart amount, maximum discount,
  validity, maximum uses, one use per customer). A used coupon cannot be deleted. Needs create
  permission on those doctypes.
- **Products** (**Stock Lookup**): search any item and see its stock in every warehouse,
  including variants and reserved quantity.
- **Invoice Management**: tabs for all invoices, **Partially Paid**, **Unpaid**, **Overdue**,
  **Drafts** and **Returns**. **Add Payment** settles an outstanding invoice; the payment history
  shows under it.
- **Settings**: change this profile's POS Settings from the counter. **Save Changes** applies
  them at once (the cart is recalculated when tax or discount settings change). Also:
  active warehouse, background stock sync interval, and Silent Print setup (QZ Tray status,
  printer, certificate).
- **Lock Screen** (menu) locks the POS; the user's password unlocks it. With *Enable Session
  Lock* on, it locks itself after the set minutes without use.
- **Switch To Desk**: only for Nexus POS Manager.

## 15. POS Settings reference

All settings belong to one POS Profile.

**General**

| Setting | What it does |
|---|---|
| Allow Additional Discount | Discount on the whole bill at payment |
| Allow Item Discount | Discount on a line in Edit Item Details |
| Allow User To Edit Rate | Change a line's rate (not when an offer applies) |
| Use Percentage Discount | Show discounts as % |
| Max Discount Percentage Allowed | Upper limit for any discount |
| Allow Credit Sale | Sell on account |
| Allow Customer Credit Payment | Use the customer's credit balance to pay |
| Allow Return | Returns at the counter |
| Allow Partial Payment | Leave part of the bill unpaid |
| Use Exact Amount for Non-Cash | Card / UPI must equal the amount exactly |
| Sales Persons Selection | Disabled, Single, or Multiple with % split |

**Display**: Default Card View, Display Item Code, Display Item SKU, Show Customer Balance, Hide
Expected Amount (blind closing), Display Discount % / Amount, Show Variants as Items.

**Operations**: Allow Create Sales Order, Allow Select Sales Order, Create Only Sales Order,
Allow Return Without Invoice, Return Validity Days (0 = no limit), Allow Free Batch Return, Allow
Print Draft Invoices.

**Pricing**: Decimal Precision, **Tax Inclusive** (shelf prices include tax; needed on India GST
sites).

**Customer**: Allow Customer Purchase Order, Allow Duplicate Customer Names, Auto Fetch Coupon
Gifts.

**Printing**: Allow Print Last Invoice, Enable Silent Print (QZ Tray, no print dialog).

**Delivery**: Use Delivery Charges, Auto Set Delivery Charges.

**Advanced**: Use Limit Search / Search Limit Number, Allow Submissions in Background Job, Allow
Delete Offline Invoice, Allow Change Posting Date.

**Miscellaneous**: Use QTY Input, Allow Negative Stock (also needs ERPNext Stock Settings).

**Security**: Enable Session Lock, Session Lock Timeout (minutes).

**Wallet & Loyalty**: Enable Loyalty Program, Loyalty Program, Wallet Account, Auto Create
Wallet, Convert Loyalty Points to Wallet.

**Localization**: Allowed Languages for the language switcher.

**Barcode tab**: Barcode Rules for weighed / priced barcodes.

## 16. Troubleshooting

| Problem | Check |
|---|---|
| No POS Profile to pick when opening a shift | Add the user to the profile's *Applicable for Users*. |
| Item not found by search or barcode | Press **Refresh** (or Clear Cache). Item disabled, not a sales item, or no price in the price list? |
| Wrong price shown | Look for an expired or future Item Price; only today's valid price is used. |
| A 5% item shows 18% tax | Give the item its Item Tax Template. |
| *CGST, SGST amount mismatch* on submit | Tick Tax Inclusive in POS Settings. |
| *Insufficient Stock* | Stock in the profile's warehouse is short. Use **Products** to see other warehouses. |
| Payment button greyed out | Remaining amount must be zero (or partial payment allowed). Non-cash may need the exact amount. |
| Invoices stuck in Offline Invoices | Back online? Press **Sync All**. A failed one shows its error; fix and sync again. |
| *EOD report did not print* | Silent Print on but QZ Tray not running: start QZ Tray or turn Silent Print off, then reprint. |
| Settings change not visible | Save Changes in Settings, then reload the POS. |
| RFID tray missing | See the RFID manual, troubleshooting. |
