# Hotel Din.Ar Extensions (M1–M5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan milestone-by-milestone, stopping at the end of each milestone for partner approval. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix and extend the existing `hotel-app` PMS for Hotel Din.Ar (Madiun) across five shippable milestones (M1–M5): guest address register & check-in validation, 21-room & room-type tariff reconciliation, WIB stay price calculation with configurable surcharge rules, two-copy "BUKTI PEMBAYARAN" receipt with Indonesian terbilang, and editable operational settings.

**Architecture:** Preserve the existing Next.js 16 App Router + Prisma 5 (PostgreSQL/Supabase) + Tailwind v4 architecture without renaming or moving existing files. Pure domain logic (`guest-validation.ts`, `stay-pricing.ts`, `terbilang.ts`, `invoice-number.ts`) lives in `src/lib/` under strict TDD with Vitest; database changes in M2 are strictly additive (`CREATE TABLE` / nullable or defaulted `ALTER TABLE ADD COLUMN`) and gated on partner backup and approval before execution.

**Tech Stack:** Next.js 16.4.6 (`--webpack`), React 19.3, TypeScript 5, Prisma 5.22 (PostgreSQL), Tailwind CSS 4, Vitest 5.1, `pnpm@11.20.0`.

**Spec:** Partner requirements R1–R7 in conversation prompt (2026-11-28).

## Global Constraints

- Do not recreate the project, change the stack, replace libraries, rename or move files, or rewrite working code.
- Database changes must be additive and reversible (new nullable columns or new tables, safe defaults). Never drop, rename, or retype existing columns or data.
- **Migration Gate:** Do NOT run any migration against a database that holds real data — show the exact SQL migration first and wait for partner approval (partner backs up first).
- All user-facing text in Indonesian; code identifiers, comments, and commit messages in English.
- Currency formatted as `"Rp 180.000"` (`id-ID`), dates `dd/mm/yyyy`, 24-hour times, timezone `Asia/Jakarta` (WIB).
- Never log or print guest personal data (name, address, ID number, phone). No secrets in repo. Do not deploy.
- Work on feature branch `feat/hotel-dinar-extensions` with small commits; stop at the end of each milestone and report changed files, reasons, and real `lint`, `build`, and `test` outputs.

## Review Focus

1. **Multi-line or >200-char guest address at check-in or guest edit:** Pasting an address containing `\n` / `\r` or 201 characters must be rejected cleanly with an Indonesian validation message rather than breaking CSV exports or receipt layout.
2. **Legacy guest (`alamat = null`) checking in via Walk-In or Confirmed Reservation:** Must block check-in until a valid address is entered inline, then persist that address onto the `Guest` record so staff do not have to leave `/reservasi`.
3. **WIB timezone boundary around midnight / UTC offset (`UTC+7`):** Check-in at `2026-11-28T11:30+07:00` (`04:30Z`) must evaluate as `11:30` WIB (2 started hours before `13:00` WIB), never `04:30` UTC.
4. **Tariff changes after an invoice is issued:** Updating a room-type tariff or hotel setting later must never alter an already-issued invoice's rates, totals, terbilang, or header when re-printed.
5. **Terbilang edge scales (`1000` = `"Seribu rupiah"`, `11000` = `"Sebelas ribu rupiah"`, `1001000` = `"Satu juta seribu rupiah"`):** `1` thousand is `"Seribu"` at the top thousand group, whereas `1` million is `"Satu juta"`.

---

## Milestone M1 — R1 Guest Address (Ships Standalone, Zero DB Migration)

`Guest.alamat String?` already exists in `prisma/schema.prisma`. M1 requires zero schema changes.

### Task M1.1: Guest Address Validation & Formatting Utility (TDD)

**Files:**
- Create: `src/lib/guest-validation.ts`
- Test: `src/lib/__tests__/guest-validation.test.ts`

**Interfaces:**
- Produces:
  - `MAX_GUEST_ADDRESS_LENGTH = 200`
  - `validateGuestAddress(raw: unknown, options?: { required?: boolean }): { valid: true; value: string | null } | { valid: false; error: string }`
  - `formatGuestAddress(alamat: string | null | undefined): string`

- [ ] **Step 1: Write failing tests in `src/lib/__tests__/guest-validation.test.ts`** covering required empty/null rejection, optional empty -> `null`, trimming valid address up to 200 chars, rejecting 201 chars, rejecting `\n`/`\r` newlines, non-string rejection, and `formatGuestAddress` returning `"-"` for null/blank.
- [ ] **Step 2: Run `pnpm run test` and verify RED** (`Cannot find module '../guest-validation'`).
- [ ] **Step 3: Implement `src/lib/guest-validation.ts`** with Indonesian error messages.
- [ ] **Step 4: Run `pnpm run test` and verify GREEN.**
- [ ] **Step 5: Commit** `feat(tamu): add guest address validation and display formatter`.

### Task M1.2: Enforce Guest Address Validation in Guest & Check-In APIs

**Files:**
- Modify: `src/app/api/tamu/route.ts`
- Modify: `src/app/api/tamu/[id]/route.ts`
- Modify: `src/app/api/reservasi/route.ts`
- Modify: `src/app/api/reservasi/[id]/route.ts`

**Interfaces:**
- Consumes: `validateGuestAddress` from `src/lib/guest-validation.ts`
- Produces:
  - `GET /api/tamu?q=...` also searches `alamat`
  - `POST /api/tamu` & `PUT /api/tamu/[id]` validate single-line ≤200 chars (`400` on invalid)
  - `POST /api/reservasi` (when `walkIn: true`, requires valid `guestAlamat` or existing `guest.alamat`, updating `guest.alamat` in transaction if supplied; when `walkIn: false`, validates & updates `guest.alamat` if `guestAlamat` supplied)
  - `PUT /api/reservasi/[id]` (when `action === 'CHECK_IN'`, requires valid `guestAlamat` or existing `guest.alamat`, updating `guest.alamat` in transaction if supplied)
  - Redacts guest PII from `AuditLog.keterangan` strings touched in these routes and ensures zero `console` PII logging.

- [ ] **Step 1: Update `src/app/api/tamu/route.ts` and `src/app/api/tamu/[id]/route.ts`** to validate `alamat` via `validateGuestAddress` and include `alamat` in search filter.
- [ ] **Step 2: Update `src/app/api/reservasi/route.ts` and `src/app/api/reservasi/[id]/route.ts`** to require a valid address on `walkIn` and `CHECK_IN` and persist inline `guestAlamat` updates.
- [ ] **Step 3: Run `pnpm run test` to confirm no regressions.**
- [ ] **Step 4: Commit** `feat(api): validate guest address and require it on check-in`.

### Task M1.3: Guest Register List/Add/Edit/Detail/Export & Check-In / Print UI

**Files:**
- Modify: `src/app/(dashboard)/tamu/page.tsx`
- Modify: `src/app/(dashboard)/reservasi/page.tsx`
- Modify: `src/app/(dashboard)/folio/page.tsx`

**Interfaces:**
- Consumes: `formatGuestAddress`, `validateGuestAddress`, `MAX_GUEST_ADDRESS_LENGTH` from `src/lib/guest-validation.ts`

- [ ] **Step 1: Update `src/app/(dashboard)/tamu/page.tsx`** to add:
  - `"Alamat"` column in the guest table (`"-"` for null/empty).
  - Single-line `"Alamat"` field (`maxLength={200}`) in the Add Guest modal.
  - `"Edit"` button per guest row (and inside the Detail modal) opening the modal in edit mode (`PUT /api/tamu/[id]`).
  - `"Alamat"` display (`"-"` when null) in the Guest Detail/History modal.
  - `"Alamat"` column in `exportApoaCsv` (`"-"` when null).
- [ ] **Step 2: Update `src/app/(dashboard)/reservasi/page.tsx`** to:
  - Include `alamat` on `Guest` interface and show `formatGuestAddress` in the reservation table & tape-chart detail modal.
  - Add inline single-line `"Alamat Tamu"` input (`maxLength={200}`, required when `isWalkIn`, pre-filled from `selectedGuest?.alamat`) in Create/Walk-In modal.
  - Add required `"Alamat Tamu *"` input (`maxLength={200}`, pre-filled from `checkInTarget.guest?.alamat`) in Check-In confirmation modal.
- [ ] **Step 3: Update `src/app/(dashboard)/folio/page.tsx`** to show `"Alamat Tamu: ..."` (`"-"` when null) in the Folio header/print view.
- [ ] **Step 4: Run `pnpm run lint`, `pnpm run test`, and `pnpm run build`.**
- [ ] **Step 5: Commit** `feat(ui): add guest address across tamu register, exports, check-in, and folio print` and **STOP for partner review of M1 + M2 migration approval**.

---

## Milestone M2 — R2 Rooms, R3 Room-Type Tariffs, R7 Stay Columns & Reconciliation (Requires Migration Approval)

> **STOP GATE BEFORE RUNNING MIGRATION:** Present the exact SQL below to the human partner and wait for backup + explicit approval before running against Supabase/PostgreSQL.

### Proposed Additive SQL Migration (`prisma/migrations/20261128000000_hotel_dinar_m2/migration.sql`)

```sql
-- 1. Additive columns on Property (R4 open-rule defaults & R6 settings)
ALTER TABLE "Property"
  ADD COLUMN IF NOT EXISTS "rekeningTransfer" TEXT,
  ADD COLUMN IF NOT EXISTS "namaPenandatangan" TEXT,
  ADD COLUMN IF NOT EXISTS "over2RateMode" TEXT NOT NULL DEFAULT 'REPLACEMENT',
  ADD COLUMN IF NOT EXISTS "maxGuestsPerRoom" INTEGER,
  ADD COLUMN IF NOT EXISTS "earlyCheckInFeePerHour" DOUBLE PRECISION NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS "lateCheckOutMode" TEXT NOT NULL DEFAULT 'FLAT_PCT',
  ADD COLUMN IF NOT EXISTS "lateCheckOutPct" DOUBLE PRECISION NOT NULL DEFAULT 10;

-- 2. Room-type level tariff table with effective-from date (R3)
CREATE TABLE IF NOT EXISTS "RoomTypeTariff" (
  "id" TEXT NOT NULL,
  "roomTypeId" TEXT NOT NULL,
  "tarifDasar" DOUBLE PRECISION NOT NULL,
  "tarifLebih2Tamu" DOUBLE PRECISION NOT NULL,
  "berlakuSejak" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktif" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomTypeTariff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoomTypeTariff_roomTypeId_fkey"
    FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RoomTypeTariff_roomTypeId_berlakuSejak_idx"
  ON "RoomTypeTariff"("roomTypeId", "berlakuSejak" DESC);

-- 3. Additive stay columns on Reservation (R4, R7)
ALTER TABLE "Reservation"
  ADD COLUMN IF NOT EXISTS "jumlahTamu" INTEGER,
  ADD COLUMN IF NOT EXISTS "checkInAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkOutAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metodePembayaran" TEXT,
  ADD COLUMN IF NOT EXISTS "penyesuaianManual" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "catatanPenyesuaian" TEXT,
  ADD COLUMN IF NOT EXISTS "rateSnapshotJson" TEXT;

-- 4. Immutable Invoice & sequential numbering table (R3, R5)
CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" TEXT NOT NULL,
  "nomorInvoice" TEXT NOT NULL,
  "periodeUrutan" TEXT NOT NULL,
  "nomorUrut" INTEGER NOT NULL,
  "tanggalTerbit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservationId" TEXT NOT NULL,
  "folioId" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_nomorInvoice_key" UNIQUE ("nomorInvoice"),
  CONSTRAINT "Invoice_periodeUrutan_nomorUrut_key" UNIQUE ("periodeUrutan", "nomorUrut"),
  CONSTRAINT "Invoice_reservationId_key" UNIQUE ("reservationId"),
  CONSTRAINT "Invoice_folioId_key" UNIQUE ("folioId"),
  CONSTRAINT "Invoice_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Invoice_folioId_fkey"
    FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
```

### Tasks in M2 (executed only after partner go-ahead):
- **Task M2.1:** Add the additive models/fields to `prisma/schema.prisma`, save `migration.sql`, and apply only after partner confirmation.
- **Task M2.2:** Create idempotent reconciliation helper `src/lib/dinar-master-data.ts` + update `prisma/seed.ts` (and `POST /api/kamar` reconcile action if needed) to upsert:
  - RoomTypes & facilities:
    - `VIP`: `["AC", "TV", "Spring Bed", "Kamar Mandi Dalam"]`, tariff `180000` (≤2) / `220000` (>2)
    - `Standar`: `["TV", "Kipas Angin", "Kasur Busa", "Kamar Mandi Dalam"]`, tariff `100000` (≤2) / `150000` (>2)
    - `Ekonomi`: `["Kipas Angin", "Kasur Busa", "Kamar Mandi Dalam"]`, tariff `80000` (≤2) / `110000` (>2)
  - 21 Rooms reconciled by `nomor` (TEXT, no duplicates, no deletions):
    - Ekonomi: `'01'`..`'10'`
    - Standar: `'11'`, `'12A'`, `'12'`, `'14'`, `'15'`, `'16'`, `'17'` (no `'13'`)
    - VIP: `'18'`, `'19'`, `'20'`, `'21'`
  - Keep `RatePlan` intact and synced (`UMUM` plan per type); default `TaxConfig` `0%` PBJT / `0%` SC on fresh seed; `Property.jamCheckIn` default `'13:00'`, `jamCheckOut` `'12:00'`.
- **Task M2.3:** Expose `RoomTypeTariff` history (`berlakuSejak`, `tarifDasar`, `tarifLebih2Tamu`) in `/api/tarif` and `/tarif/page.tsx` while preserving existing `RatePlan` UI.

---

## Milestone M3 — R4 Stay Price Calculation (TDD) & Check-In / Check-Out Wiring

- **Task M3.1 (TDD):** Implement pure `calculateStayPrice(input: StayPriceInput): StayPriceResult` in `src/lib/stay-pricing.ts` + `src/lib/__tests__/stay-pricing.test.ts`:
  - Inputs: `roomType`, `baseRate`, `over2Rate`, `guestCount`, `checkInAt`, `checkOutAt` (interpreted in `Asia/Jakarta` WIB), `rules` (`standardCheckInTime = "13:00"`, `standardCheckOutTime = "12:00"`, `over2RateMode = "REPLACEMENT" | "SURCHARGE"`, `maxGuestsPerRoom = null`, `earlyCheckInFeePerHour = 10000`, `lateCheckOutMode = "FLAT_PCT" | "HOURLY_PCT"`, `lateCheckOutPct = 10`), and optional `manualAdjustment` (`{ amount: number; note: string }`, off by default, throws/errors if `amount !== 0` without non-empty `note`).
  - Verifies all 5 expected results:
    1. VIP, 2 guests, 1 night, in 13:00, out 12:00 = `180000`
    2. Standar, 3 guests, 2 nights, in 13:00, out 12:00 = `300000`
    3. Ekonomi, 2 guests, 1 night, in 11:30, out 12:00 = `100000`
    4. Standar, 2 guests, 1 night, in 13:00, out 14:00 = `110000`
    5. VIP, 3 guests, 1 night, in 13:00, out 13:00 = `242000`
- **Task M3.2:** Wire `calculateStayPrice` + effective-from `RoomTypeTariff` lookup + `jumlahTamu`, WIB `checkInAt`/`checkOutAt` datetime inputs, `metodePembayaran` (`TUNAI` / `TRANSFER_BRI`), manual adjustment + note, and `rateSnapshotJson` into `/api/reservasi`, `/api/reservasi/[id]`, and `/reservasi/page.tsx` (check-in and check-out modals).

---

## Milestone M4 — R5 Invoice ("BUKTI PEMBAYARAN"), Terbilang (TDD), Printing & R6 Settings

- **Task M4.1 (TDD):** Implement `terbilangRupiah(amount: number): string` in `src/lib/terbilang.ts` + `src/lib/__tests__/terbilang.test.ts` verifying all 6 required cases:
  - `80000` → `"Delapan puluh ribu rupiah"`
  - `110000` → `"Seratus sepuluh ribu rupiah"`
  - `100000` → `"Seratus ribu rupiah"`
  - `1000` → `"Seribu rupiah"`
  - `242000` → `"Dua ratus empat puluh dua ribu rupiah"`
  - `1000000` → `"Satu juta rupiah"`
- **Task M4.2 (TDD):** Implement sequential invoice number formatter & period parser in `src/lib/invoice-number.ts` + `src/lib/__tests__/invoice-number.test.ts` (format `BP/YYYYMM/0001`).
- **Task M4.3:** Extend R6 Settings in `/api/properti` and `/properti/page.tsx` for editable hotel name, address, phone, transfer bank account text (`rekeningTransfer`), check-in/out times, open-rule surcharge parameters, max guests per room, and invoice signer name (`namaPenandatangan`).
- **Task M4.4:** Build idempotent Invoice endpoint (`GET/POST /api/folio/[id]/invoice`) storing immutable `snapshotJson`, plus `"BUKTI PEMBAYARAN"` view/component in exact paper-receipt order, 2-copy print stylesheet (`Lembar Tamu` & `Lembar Arsip`) in `globals.css`, `print:hidden` chrome in `DashboardShell.tsx`, and PDF print/save support without mutating stored data on re-print.

---

## Milestone M5 — Cleanup, Docs & Indonesian Staff Change List

- **Task M5.1:** Update `README.md`, create `CHANGELOG.md`, and create `PERUBAHAN-UNTUK-STAF.md` (short Indonesian guide for Hotel Din.Ar staff).
- **Task M5.2:** Full verification suite (`pnpm run lint`, `pnpm run test`, `pnpm run build`), audit diff scope & PII rules, and final branch review.
