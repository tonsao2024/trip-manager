# v46 — หน้าค่าใช้จ่ายจัดใหม่ + แผนที่หนี้ซูมได้จากในหน้า

> **เอกสารนี้คือผลงานรอบ v46 (18 พ.ย. 2026)** — แก้ตามคำขอของเจ้าของโปรเจกต์ 2 ข้อ
> **(1) “หน้าค่าใช้จ่ายมันไม่สวยและไม่เป็นระเบียบ”** (ส่งภาพหน้าจอ iPhone + iPad มา)
> **(2) “แผนที่หนี้ อยากกดย่อ/ขยาย/พอดีจอได้จากหน้าแผนที่เลย ไม่ต้องเด้งไปหน้าขยาย”**
>
> - หน้าค่าใช้จ่าย: [`src/js/app.js`](../src/js/app.js) (`renderExpenses` / `renderSummary` /
>   `expenseCardHtml` / `renderGroupAverages`) + [`src/css/flat.css`](../src/css/flat.css) § v46
> - แผนที่หนี้: `bindDebtMapZoom()` ใน [`src/js/app.js`](../src/js/app.js) +
>   [`src/css/dimension.css`](../src/css/dimension.css) (`.debt-map-viewport`, `.debt-map-zoombar`)
> - เทสต์: `266 unit tests` ผ่าน, `npm run test:smoke` ผ่านทุกเช็กใหม่
>   (เหลือเฉพาะข้อ PNG ที่ jsdom rasterize ไม่ได้ — ล้มเหมือนกันบน base commit)

---

## 1. ปัญหาที่เห็นในภาพ (18 พ.ย. 2026)

| สิ่งที่เห็น | สาเหตุในโค้ดเดิม |
| --- | --- |
| ยอดเงินหลักถูกบีบเล็กมากบนมือถือ และยอดคู่สกุลเงินขาดกลางตัวเลข (`฿167,7 / 23.09`) | สรุปยอดเป็น `.kpi-strip` 5 การ์ดในแถวเดียว; การ์ดถูกบังคับ `overflow: hidden` + ฟอนต์เล็กลงเมื่อที่แคบ |
| ตัวกรองเป็น 4 แถวชิปที่แนวซ้ายไม่ตรงกัน ดูรก | แต่ละแถวมีความสูงชิป/ป้ายชื่อ/padding ต่างกัน (30px, 36px, segmented) และไม่มีลำดับชั้น |
| การ์ดรายจ่ายแต่ละใบหน้าตาไม่เหมือนกัน — ยอดเงินบางใบทะลุขึ้นไปอยู่ใต้ชื่อ บางใบชิดขวา | ทุกอย่างอยู่ใน flex เดียวที่ `flex-wrap` เอง ตำแหน่งยอดจึงขึ้นกับความยาวชื่อ |
| แถวข้อเท็จจริง (กลุ่ม/วันที่/คนจ่าย/บัตร) ไหลเป็นก้อนข้อความยาว | ไม่มีแถวข้อมูลที่ความสูง/จังหวะคงที่ |
| ชื่อวันในหัวกลุ่มถูกตัดด้วย `…` | `refresh.css` บังคับ `white-space: nowrap; text-overflow: ellipsis` |
| ยอดรวมซ้ำสองที่ (การ์ดสรุป + แถบรวมล่างลิสต์) | ข้อมูลเดียวกันถูกวาดสองที่ |
| แผนที่หนี้ต้องกด “ขยายดูเต็มจอ” ก่อนจึงจะซูมได้ และค่าเริ่มต้นไม่ใช่พอดีจอ | `.debt-map-svg { min-width: 540px }` บังคับให้มือถือสโครล; zoom อยู่ใน modal เท่านั้น |

## 2. หน้าค่าใช้จ่าย — โครงใหม่ (บนลงล่าง)

```
ยอดรวมทั้งทริป        <- พระเอกของหน้า (#exp-sum-total) + แคปชันขอบเขต (#exp-sum-scope)
  เฉลี่ย/กลุ่ม        <- #exp-sum-avg · #exp-sum-avg-sub
[ จ่ายจริง ][ ประมาณการ ][ จำนวนรายการ ]        <- 3 การ์ด ไม่ใช่ 5
เฉลี่ยรายกลุ่ม (ถ้ามี) + หมายเหตุ (#exp-group-note)
---------------------------------------------
ตัวกรอง:  สถานะ
          กลุ่มค่าใช้จ่าย
          วิธีจ่าย / บัตร            <- พับบนมือถือ
          มุมมอง / เครื่องมือ        <- พับบนมือถือ (ปุ่ม “ตัวเลือกเพิ่มเติม” เดียว)
---------------------------------------------
ยอดรวม (ตามตัวกรองนี้) · N รายการ · N วัน      <- #expense-list-caption
[ การ์ดรายจ่าย ... ]                          <- 3 โซนตายตัวทุกใบ
[ เฉลี่ยรายวัน ][ โหลดเพิ่ม ]                  <- #expense-list-footer / #load-more
```

**กติกาความซื่อสัตย์ของตัวเลข** — ยอดพระเอกและค่าเฉลี่ย *เปลี่ยนตามตัวกรอง* และแคปชันบอกว่า
“ทุกรายการในทริป” หรือ “ตามตัวกรอง: …” (`.is-filtered`). ส่วนการ์ด “จ่ายจริง/ประมาณการ” **หมายถึงทั้งทริปเสมอ**
และเปลี่ยนป้ายเป็น `ทั้งทริป · จ่ายจริง` ทันทีที่กรองอยู่ — ยอดที่กรองแล้วต้องไม่มีทางอ่านผิดว่าเป็นยอดทั้งทริป.

**การ์ดรายจ่าย (3 โซน)**

| โซน | เนื้อหา | คลาส |
| --- | --- | --- |
| 1 | ไอคอน · ชื่อ (+ป้ายสถานะ) · **ยอดเงินชิดขวาเสมอ** | `.expense-head`, `.exp-card-copy`, `.expense-title`, `.exp-card-status`, `.expense-amount` |
| 2 | แถวข้อเท็จจริงบรรทัดเดียว: กลุ่ม · วันที่ · คนจ่าย · จำนวนคน · วิธีจ่าย · บัตร | `.expense-facts`, `.exp-fact`, `.exp-fact--cat` |
| 3 | รายละเอียด · ใบเสร็จ · คอมเมนต์ · ผู้แก้ล่าสุด + ปุ่มแก้/ลบ | `.expense-extras`, `.expense-desc`, `.expense-edited`, `.expense-actions` |

แถวข้อเท็จจริงเลื่อนแนวนอนได้แทนการตัดบรรทัด — **ไม่มีข้อมูลไหนหาย** แต่ความสูงการ์ดคงที่ทุกใบ.

## 3. แผนที่หนี้ — ซูม/ย้าย/พอดีจอ บนการ์ดเอง

- `#debt-map-expand` และ modal `debt-zoom-*` **ถูกถอดออกทั้งหมด** (ไม่มีการเด้งออกจากหน้า)
- `.debt-map-viewport` (เลื่อน/ลากได้) ครอบ `.debt-map-stage > svg` — ขนาด SVG ถูกกำหนดจากตัวควบคุม
- แถบเครื่องมือ `.debt-map-zoombar`: `[data-debt-zoom="out|in|fit"]` + `[data-debt-zoom-level]`
- **ค่าเริ่มต้น = พอดีจอ** ทุกอุปกรณ์ (`aria-pressed="true"` ที่ปุ่มพอดีจอ), ช่วงซูม 0.6x–2.6x ของขนาดพอดีจอ
- ซูมด้วย บีบนิ้ว / `Ctrl`+ล้อ / `+ - 0` บนคีย์บอร์ด; ซูมแล้วจุดที่กำลังดูอยู่ไม่กระโดด
- หมุนจอหรือเปลี่ยนขนาดหน้าต่าง: ถ้ายังไม่ได้ซูมเองจะกลับมาพอดีจออัตโนมัติ
- ปุ่ม >=40px (44px บนมือถือ); `touch-action: pan-x pan-y` เพื่อไม่ให้ดักการเลื่อนหน้า
- `#export-debt-map-png` ยังอยู่ และ export/print ได้ **ภาพเต็มแผน** เสมอ ไม่สนใจระดับซูมบนจอ
  (`.export-capture` / `@media print` รีเซ็ต viewport)

## 4. กติกา CSS ที่ลบออก (สำคัญ)

`dimension.css` โหลด *หลัง* `flat.css` จึงต้องลบของเก่าที่ทับกัน ไม่ใช่เขียนทับเพิ่ม:

| ไฟล์ | ที่ลบ | เพราะ |
| --- | --- | --- |
| `material.css` | บล็อก `@media (max-width: 767px)` ของ `.kpi-strip` / `.expense-*` | มันคือสาเหตุที่การ์ดหน้าตาไม่เหมือนกันในแต่ละความกว้าง |
| `refresh.css` | `.debt-map-frame` + `min-width: 540px` ของ `.debt-map-svg` | บังคับให้มือถือสโครล และทำให้ “พอดีจอ” เป็นไปไม่ได้ |
| `refresh.css` | `.expense-day-head` แบบ grid + `nowrap/ellipsis` | ตัดชื่อวัน |
| `refresh.css` | `.expenses-compact ... .meta-line` | อ้างคลาสที่ไม่มีแล้ว (โหมดกระทัดรัดไม่ทำงาน) |
| `dimension.css` | `.expense-more-filters` / `.expense-extra-controls` / `.debt-zoom-modal` | ย้ายไป `flat.css` § v46 (scoped `#expenses-view`) หรือถูกถอดไปกับ modal |

## 5. เทสต์ที่ผูกกับของใหม่

- `tests/smoke/run.mjs`
  - `debt map: expand / shrink / fit are on the map card itself`
  - `debt map: fit-to-screen is the default state` / `zooming in releases the fit state` / `fit returns the drawing to the card width`
  - `debt map: the full-screen “ขยายดูเต็มจอ” step is gone` / `nothing opens over the page any more`
  - `paging: the running total counts every matching row, not just the page`
- `tests/unit/debt-map.test.js`
  - `testDebtMapZoomLivesOnTheCard` (แทน `testDebtMapFitFrameAndExpandAreWired`)
  - `testDesktopDebtMapFitsCardWithoutHorizontalScrolling` (ไม่มี `min-width` ของ SVG อีกแล้ว)
- ยังคงผ่าน: `266 unit tests`, เช็กเดิมของหน้าค่าใช้จ่าย (`#exp-sum-avg`, `#cat-filters [aria-pressed]`,
  `#expense-more-filters[aria-expanded]`, `.expense-day-head/-num/-title/-total`, `.expense-form .form-submit-row`)
