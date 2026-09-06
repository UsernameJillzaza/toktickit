# Lab 2 Zen Green UI Specification

## 1. Color Tokens

| Token | Hex | ใช้ตรงไหน |
| --- | --- | --- |
| Primary green | `#006B3C` | app header, ปุ่มหลัก (Submit, Continue), emphasis ที่สำคัญที่สุด |
| Secondary green | `#0B7A46` | active tab, focus ring, link, hover state |
| Pale green | `#EAF6EF` | selected row, success banner, section emphasis แบบเบา |
| Page background | `#F5F7F6` | พื้นหลังทั้งหน้า (ไม่ใช่ card) |
| Surface / card | White + `border: 1px solid #E2E8E5` + `box-shadow` เบา ๆ | card, panel, modal |
| Text | charcoal-green เข้ม (`#1F2E28`) ไม่ใช่ดำล้วน | ข้อความทั่วไป |
| Editable field | พื้นขาว + border สีเทากลาง (`#CBD5D1`) | input ที่แก้ไขได้ |
| Read-only field | พื้นเทา-เขียวอ่อนหรือ ivory อุ่น (`#F0EFE8`) | Ticket Number, Ticket Date, Requester |
| Error | แดงเข้ม (`#B3261E`) ทั้งข้อความและ border | validation message + error border |
| Warning | เหลืองอำพัน (`#B45309`) เฉพาะ callout/badge | ห้ามใช้เป็นของตกแต่งทั่วไป |
| Success | เขียว + ข้อความอ่านออกได้ ไม่พึ่งสีอย่างเดียว | ต้องมีไอคอน/ข้อความประกอบเสมอ (accessibility) |

## 2. Typography and Spacing

- Heading: font-weight 600, ขนาดลดหลั่น `h1 24px / h2 20px / h3 16px`
- Body: 14px, line-height 1.5
- Label เหนือ control เสมอ, ไม่ใช่ inline หรือ placeholder-only (placeholder ห้ามใช้แทน label)
- Spacing scale: 4 / 8 / 16 / 24 / 32px — ใช้ multiple ของ 8 เท่านั้น ห้ามใช้เลขเบ็ดเตล็ด

## 3. Field States

| State | ลักษณะ |
| --- | --- |
| Editable | border เทากลาง, พื้นขาว, focus → border เปลี่ยนเป็น secondary green + ring บาง ๆ |
| Read-only | พื้น ivory/gray-green, cursor `not-allowed`, ไม่มี focus ring |
| Invalid | border แดง + ข้อความ error ใต้ field ทันที (ไม่ใช่ tooltip, ไม่ใช่ alert บนสุดของฟอร์มเท่านั้น) |
| Disabled | opacity ลด + cursor `not-allowed` + ไม่ตอบสนอง keyboard/mouse |
| Focused | outline ชัดเจนสำหรับ keyboard user (ตาม §8.3 — ห้ามเอา focus outline ออกเพื่อความสวยงาม) |

Required field: asterisk สีแดงต่อท้าย label — **asterisk ไม่ทดแทนข้อความ validation** ต้องมีทั้งคู่
พร้อมกันเสมอ (ตาม §8.3)

## 4. Button Hierarchy

| ระดับ | สไตล์ | ตัวอย่างการใช้ |
| --- | --- | --- |
| Primary | พื้น primary green, ตัวอักษรขาว | Submit Ticket, Continue |
| Secondary | ขอบ secondary green, พื้นโปร่งใส | Cancel, Back to My Tickets |
| Tertiary | ข้อความล้วน ไม่มีพื้น/ขอบ | Change Requester (ลิงก์เล็ก ๆ ใน header) |
| Destructive | แดง | Remove Attachment |
| Disabled | ทุกระดับ opacity ลด + `not-allowed` | ปุ่มระหว่าง busy state |
| Busy | spinner เล็ก ๆ ข้างข้อความปุ่ม + disable ปุ่มระหว่างรอ response | Submit ตอนกำลังส่ง |

## 5. Screen States (Create Ticket)

ครบ 6 สถานะตาม §14 Part 6:

1. **Initial** — ฟอร์มว่าง, Ticket Number แสดง placeholder "จะถูกสร้างหลังบันทึก"
2. **Loading** — ตอนโหลด reference data (category/related system/requester) ครั้งแรก
3. **Validation failure** — error message ใต้ field ที่ผิด, ฟอร์มไม่ถูกเคลียร์
4. **Submitting** — ปุ่ม Submit เข้า busy state, ฟอร์มทั้งหมด disable ชั่วคราว
5. **Success** — แสดง Ticket Number จริงจาก backend + ปุ่มไปหน้า My Tickets หรือสร้างใบใหม่
6. **API failure** — banner error สีแดงเหนือฟอร์ม, ค่าที่กรอกไว้ยังอยู่ครบ (BR-11), ปุ่ม Submit
   กลับมากดได้อีกครั้ง

## 6. Application Shell / Navigation

- โลโก้/ชื่อ "TokTickIT" มุมซ้ายบน, ลิงก์ My Tickets / Create Ticket, แสดงชื่อ Requester ปัจจุบัน +
  ปุ่ม Change Requester มุมขวาบนเสมอ (หลังเลือก requester แล้ว)
- active page indication ด้วย underline หรือพื้น pale green ใต้ลิงก์ที่ active
- mobile: ยุบเป็น hamburger menu ที่ <768px

## 7. My Tickets — List/Card Behavior

- **Desktop (≥992px):** ตาราง คอลัมน์ Ticket Number, Summary, Category, Requested Priority (badge),
  Current Status (badge), Last Updated
- **Tablet/Mobile (<992px):** การ์ดแนวตั้ง แต่ละใบโชว์ field เดียวกันแต่ stack กัน
- Search box + filter chip (category, priority) + sort dropdown อยู่แถวเดียวกันบน desktop, stack
  กันบน mobile
- Pagination control ด้านล่าง: ปุ่ม prev/next + เลขหน้า current/total
- **Empty state** (ยังไม่เคยสร้าง ticket): ข้อความ + ปุ่ม "สร้าง Ticket แรกของคุณ"
- **No-results state** (filter ไม่ตรง): ข้อความต่างจาก empty ชัดเจน + ปุ่ม "ล้างตัวกรอง"

## 8. Ticket Detail — Read-only Layout

- Field group บนสุด: Ticket Number, Ticket Date, Current Status badge — อ่านอย่างเดียว พื้น
  read-only token
- Field group กลาง: Category, Related System, Requested Priority (badge), Summary, Description
- Attachment section แยกชัดจาก field ด้านบน (เส้นคั่นหรือ card แยก): แสดง active attachment (ดาวน์โหลดได้)
  และ removed attachment (metadata จาง ๆ, ปุ่มดาวน์โหลด disabled พร้อม tooltip "ไฟล์นี้ถูกลบแล้ว")
- **ห้ามมี** input ที่แก้ไขได้, ห้ามมี UI ของ Public Comments / Internal Notes / Actions Taken

## 9. Attachment States

| State | UI |
| --- | --- |
| Active | ชื่อไฟล์ + ขนาด + ปุ่ม Download + ปุ่ม Remove |
| Uploading | progress indicator เล็ก ๆ ข้างชื่อไฟล์ |
| Invalid (ประเภท/ขนาดผิด) | error message เฉพาะไฟล์นั้น สีแดง ไม่กระทบไฟล์อื่นที่แนบสำเร็จแล้ว |
| Removed | ชื่อไฟล์จาง + label "Removed" + ปุ่ม Download disabled |
| Unavailable (โหลด metadata ไม่สำเร็จ) | placeholder "ไม่สามารถโหลดข้อมูลไฟล์แนบได้" |

## 10. Responsive Rules

| Viewport | กติกา |
| --- | --- |
| Desktop ≥992px | multi-column, content max-width กึ่งกลางจอ |
| Tablet 768–991px | two-column ที่ทำได้จริง, Summary/Description ได้ความกว้างพอ |
| Mobile <768px | stack แนวตั้งทั้งหมด, ปุ่มขนาด touch-friendly (สูงอย่างน้อย 44px), ห้าม horizontal scroll |

ทุก breakpoint ต้องไม่มี: label ถูกตัด, message ซ้อนทับ, ปุ่มถูกซ่อนโดยไม่ตั้งใจ, ชื่อไฟล์แนบอ่านไม่ออก

## 11. Accessibility

- ทุก icon-only control ต้องมี `aria-label` + tooltip
- Focus indicator ต้องเห็นชัดสำหรับ keyboard navigation ทุก control
- ข้อมูลที่สื่อด้วยสี (badge, error) ต้องมีข้อความ/ไอคอนกำกับด้วยเสมอ ไม่พึ่งสีอย่างเดียว
  (color-blind accessibility)
- Badge สี Requested Priority / IT Priority / Current Status ต้องใช้ชุดสีเดียวกันทุกหน้าจอที่โผล่

## 12. Visual Inspection Checklist (ใช้ตอน Phase 8)

ทำ Phase 8 จริงแล้ว (2026-09-06) — เช็คด้วยตาในเบราว์เซอร์จริงที่ desktop/tablet/mobile ทั้ง 3
หน้าจอ (Create Ticket, My Tickets, Ticket Detail):

- [x] สี token ตรงกับตารางข้อ 1 เป๊ะ ไม่มีสีหลุด — **เจอจริงว่าไม่ตรง** ตอนแรก (โค้ดใช้สี Bootstrap
      เดิม `#198754` ไม่ใช่ `#006B3C`, link เป็นสีฟ้า default ไม่ใช่ secondary green) แก้แล้วใน
      `client/src/index.css` โดย override CSS variable ของ Bootstrap ตรง ๆ
- [x] editable vs read-only field แยกออกจากกันชัดด้วยตา — Ticket Number (read-only) พื้นเทาอ่อน
      ต่างจาก field อื่นชัดเจน
- [x] validation message อยู่ใต้ field ที่เกี่ยวข้องเสมอ ไม่ใช่แค่ banner บนสุด — เช็คแล้วบน Create
      Ticket ตอน submit ว่างครบ 5 field ข้อความ error อยู่ใต้แต่ละ field จริง
- [x] button hierarchy ใช้ถูกระดับ (ไม่มี destructive action ใช้สี primary) — Remove attachment ใช้
      `btn-outline-danger`, Submit/Continue ใช้ primary green
- [x] ไม่มี label ถูกตัด/ซ้อนทับ/horizontal scroll ที่ breakpoint ไหนเลย — **เจอบั๊กจริง 2 จุด** ตอน
      เช็ค mobile (375px): (1) nav bar ทับกันจนอ่านไม่ออก ไม่มี hamburger menu ทั้งที่ spec ข้อ 6
      บอกไว้ว่าต้องมี — แก้แล้วด้วย responsive collapse ใน `App.tsx`; (2) My Tickets ตารางล้นขวา
      ต้อง scroll แนวนอนถึงจะเห็นคอลัมน์ Status — แก้แล้วด้วยการ์ดสำหรับจอ <768px ใน `MyTickets.tsx`
- [x] badge สีสม่ำเสมอทุกหน้าจอ (My Tickets list, Ticket Detail) — Priority (`bg-secondary`) และ
      Status (`bg-success`) ใช้ class เดียวกันทั้งสองหน้าจอ
- [x] empty state ≠ no-results state ในทุกจุดที่ใช้ทั้งคู่ — ข้อความและปุ่ม Clear filters ต่างกัน
      จริง ทดสอบอัตโนมัติ (UI-08/UI-09) ยืนยันด้วยว่าอีกข้อความไม่โผล่มาปนกัน

**หมายเหตุ:** ยังไม่มี Playwright screenshot จริง 9 ภาพใน `artifacts/lab-02/screenshots/` —
เครื่องมือ E2E ติดตั้ง browser binary ไม่ได้ใน sandbox ของ session ที่ทำ (เน็ตบล็อกโดเมนดาวน์โหลด)
ต้องรัน `npx playwright test` บนเครื่องที่มีเน็ตปกติ ดูรายละเอียดที่
`artifacts/lab-02/screenshots/README.md`

## 13. Screenshot Paths (สำหรับ Phase 8 / §12 ของ labsheet)

```
artifacts/lab-02/screenshots/
├── create-ticket/{desktop,tablet,mobile}.png
├── my-tickets/{desktop,tablet,mobile}.png
└── ticket-detail/{desktop,tablet,mobile}.png
```
