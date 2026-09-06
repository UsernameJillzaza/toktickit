# Lab 2 Test Plan and Results

## 1. Test Strategy

ครอบคลุมตาม §9.2: unit, API/integration, UI component, UI style, responsive, E2E ทุก AC ต้อง map
เข้าอย่างน้อย 1 แถวในตารางข้อ 2 — ดูสรุปที่ตารางข้อ 3 เทสต์เจาะ ownership (BR-06/BR-07) แยกออกมา
เป็นกลุ่มของตัวเองเพราะเป็น business rule ที่หนักสุดของ Lab 2 ไม่ปล่อยให้ปนไปกับ happy-path เทสต์
ทั่วไป

## 2. Planned Tests

### Development Requester context

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | AC-13, BR-05 | `GET /api/requesters` คืนเฉพาะ `isActive=true` | ไม่มี inactive requester ในผลลัพธ์ | server/tests/lab-02/requesters.api.test.ts | Pass |
| UI-01 | UI | FR-01 | Selector screen แสดง loading → รายชื่อ → error state ตามลำดับ | ทั้ง 3 state render ถูกต้อง | client/tests/lab-02/RequesterSelect.test.tsx | Pass |
| UI-02 | UI | BR-04 | เลือก requester แล้ว reload หน้า | ยังเห็นชื่อ requester เดิม ไม่ต้องเลือกใหม่ (localStorage) | client/tests/lab-02/RequesterSelect.test.tsx | Pass |
| E2E-01 | E2E | FR-01, FR-02 | เลือก requester → เห็นชื่อใน shell → กด Change Requester → กลับมาหน้า selector | flow ครบไม่มี error | client/tests/lab-02/AppShell.test.tsx ("FR-01/FR-02 stand-in") | Pass (stand-in)* |
| E2E-05 | E2E | AC-02 | ยังไม่เลือก requester (localStorage ว่าง) แล้วพยายามเข้า `/my-tickets` ตรง ๆ ทาง URL | ถูก redirect ไปหน้า Requester Selection ทันที ไม่เห็นเนื้อหา My Tickets แม้แวบเดียว | client/tests/lab-02/AppShell.test.tsx ("AC-02 / E2E-05 stand-in") | Pass (stand-in)* |

### Create Ticket

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-01 | Ticket Number generator คืนรูปแบบ `TKT-YYYY-NNNNNN` และไม่ซ้ำเมื่อเรียกซ้ำ | format ตรง regex, ค่าไม่ซ้ำ | server/tests/lab-02/ticket-number.unit.test.ts | Pass — เทสต์จริงรัน 10 รอบ ไม่ใช่ 100 (แก้ไว้ในหมายเหตุแล้ว) |
| API-02 | API | AC-01 | `POST /api/tickets` ข้อมูลถูกต้องครบ | `201`, คืน ticket พร้อม `ticketNumber` | server/tests/lab-02/tickets.api.test.ts | Pass |
| API-03 | API | AC-04, BR-08 | `POST /api/tickets` ไม่มี `summary` | `400`, ไม่มี ticket ถูกสร้างใน DB | server/tests/lab-02/tickets.api.test.ts | Pass |
| API-04 | API | BR-09 | `POST /api/tickets` `requestedPriority` เป็นค่าที่ไม่รู้จัก | `400` พร้อมข้อความ error ชัดเจน | server/tests/lab-02/tickets.api.test.ts | Pass |
| UI-03 | UI | BR-10 | กด Submit สองครั้งติดกันเร็ว ๆ | ปุ่มถูก disable ทันทีหลังกดครั้งแรก, ยิง request แค่ 1 ครั้ง | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| UI-04 | UI | AC-04 | submit โดย Summary ว่าง | error message โผล่ใต้ field Summary โดยตรง | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| UI-05 | UI | AC-12, BR-11 | API คืน error ระหว่าง submit | ฟอร์มยังมีค่าที่กรอกไว้ครบ, เห็น failure state | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| STYLE-01 | UI style | §8.3 | required field asterisk, read-only field styling | assertion เจอ CSS class ที่ถูกต้องตาม `ui-spec.md` | client/tests/lab-02/CreateTicket.test.tsx ("STYLE-01" describe block — ไม่ใช่ไฟล์แยก) | Pass |
| E2E-02 | E2E | AC-01 | กรอกฟอร์มครบ → submit → เห็น Ticket Number จริงจาก backend | เห็นเลขตั๋วรูปแบบถูกต้องบนหน้าจอ | client/tests/lab-02/CreateTicket.test.tsx ("E2E-02 stand-in") | Pass (stand-in)* |

### Attachments

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-05 | API | BR-12 | อัปโหลดไฟล์ JPG 2MB | `201`, attachment ผูกกับ ticket ถูกต้อง | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-06 | API | AC-05, BR-12 | อัปโหลดไฟล์เกิน 5MB พร้อมไฟล์อื่นที่ถูกต้อง | ไฟล์เกินขนาดถูกปฏิเสธ, ไฟล์ที่ถูกต้องยังแนบสำเร็จ | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-07 | API | AC-06, BR-12 | มี active attachment ครบ 5 แล้วอัปโหลดไฟล์ที่ 6 | `400`, ปฏิเสธไฟล์ที่ 6 | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-08 | API | AC-11, BR-15 | ดาวน์โหลด attachment ที่ `isRemoved=true` | `404` | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-09 | API | BR-14 | เรียก remove endpoint | แถวใน DB ยังอยู่, `isRemoved=true`, ไฟล์บน disk ยังอยู่ | server/tests/lab-02/attachments.api.test.ts | Pass |
| UI-06 | UI | AC-05 | เลือกไฟล์ผิดประเภท (เช่น `.exe`) | error message เฉพาะไฟล์นั้น | client/tests/lab-02/RequesterTicketDetail.test.tsx | Pass |
| UI-07 | UI | AC-11 | แสดง attachment ที่ removed แล้ว | metadata ยังโชว์, ปุ่ม download ถูก disable | client/tests/lab-02/RequesterTicketDetail.test.tsx | Pass |
| E2E-03 | E2E | FR-08, FR-09 | เพิ่ม attachment เข้า ticket เดิม → soft-remove พร้อมเหตุผล → พยายาม download | ถูกบล็อกตามคาด, metadata ยังอยู่ | client/tests/lab-02/RequesterTicketDetail.test.tsx ("Attachment upload happy path" + "Attachment removal flow") | Pass (stand-in)* |

### My Tickets

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-10 | API | AC-07, BR-06 | `GET /api/tickets` requester A vs B | แต่ละคนเห็นแค่ ticket ตัวเอง ไม่ปนกัน | server/tests/lab-02/my-tickets.api.test.ts | Pass |
| API-11 | API | AC-03, BR-07 | `GET /api/tickets/:id` ของ requester อื่น | `404` ไม่ใช่ `403` | server/tests/lab-02/ticket-detail.api.test.ts (แถวเดียวกับ API-15 — ทดสอบ scenario เดียวกันจริง ไม่มีเทสต์แยกใน my-tickets.api.test.ts ตามที่วางแผนไว้เดิม) | Pass |
| API-12 | API | BR-17 | request `pageSize=999` | ปัดเหลือ `pageSize=50` ไม่ error | server/tests/lab-02/my-tickets.api.test.ts | Pass |
| API-13 | API | BR-18 | สอง ticket สร้างเวลาเดียวกัน | ผลลัพธ์เรียงตาม `id desc` เป็น secondary sort คงที่ทุกครั้ง | server/tests/lab-02/my-tickets.api.test.ts | Pass |
| API-14 | API | FR-06 | ค้นหาด้วยคำที่อยู่ใน summary | เจอเฉพาะ ticket ที่ตรง | server/tests/lab-02/my-tickets.api.test.ts | Pass |
| UI-08 | UI | AC-09 | requester ที่ไม่เคยสร้าง ticket เลย | เห็น empty state | client/tests/lab-02/MyTickets.test.tsx | Pass |
| UI-09 | UI | AC-10 | ค้นหาคำที่ไม่ตรง ticket ไหนเลย | เห็น no-results state (ข้อความต่างจาก empty state) | client/tests/lab-02/MyTickets.test.tsx | Pass |
| UI-10 | UI | AC-08 | มี ticket มากกว่า pageSize | เห็น control ไปหน้าถัดไปและกดได้จริง | client/tests/lab-02/MyTickets.test.tsx | Pass |
| E2E-04 | E2E | AC-07 | requester A เห็น ticket ตัวเอง → สลับเป็น B | ticket ของ A หายไปจากจอทันที | client/tests/lab-02/MyTickets.test.tsx ("E2E-04 stand-in") | Pass (stand-in)* |

### Ticket Detail

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-15 | API | AC-03 | `GET /api/tickets/:id` ของ requester อื่น (ซ้ำกับ API-11 แต่เจาะ endpoint detail) | `404` | server/tests/lab-02/ticket-detail.api.test.ts | Pass |
| UI-11 | UI | §8.5 | หน้า Ticket Detail | ไม่มี input ที่แก้ไขได้, ไม่มี UI ของ comments/Actions Taken | client/tests/lab-02/RequesterTicketDetail.test.tsx | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Test(s) |
| --- | --- |
| AC-01 | API-02, UNIT-01, E2E-02 |
| AC-02 | E2E-05 |
| AC-03 | API-11, API-15 |
| AC-04 | API-03, UI-04 |
| AC-05 | API-06, UI-06 |
| AC-06 | API-07 |
| AC-07 | API-10, E2E-04 |
| AC-08 | UI-10 |
| AC-09 | UI-08 |
| AC-10 | UI-09 |
| AC-11 | API-08, UI-07, E2E-03 |
| AC-12 | UI-05 |
| AC-13 | API-01 |

ทุก Acceptance Criterion มีเทสต์คู่กันครบตามตารางข้างต้น ตรงตาม §9.2 ที่บอกว่า *"Every Acceptance
Criterion must map to at least one planned test"*

## 4. Responsive and Visual Checklist

Breakpoint ที่ต้องแคป: desktop ≥992px, tablet 768–991px, mobile <768px × หน้าจอ Create Ticket / My
Tickets / Ticket Detail (รวม 9 ภาพ) บันทึกไว้ที่ `artifacts/lab-02/screenshots/` — checklist
รายละเอียดอยู่ใน `ui-spec.md` ข้อ 12

## 5. Test Commands

```powershell
cd server
npm test

cd ..\client
npm test

npx playwright test
```

## 6. Final Results

Implement เสร็จครบทุก Issue (#13–#19) แล้ว รันเทสต์จริงบน `main` (2026-09-06):

```
server: 9/9 test files, 25/25 tests passing
client: 7/7 test files, 29/29 tests passing
```

ยืนยัน non-flaky ด้วยการรันวนลูป: server 10 รอบติด, client 5 รอบติด ไม่มี fail เลยสักครั้ง (เจอและแก้
ปัญหา test-isolation จริง 2 จุดระหว่างทำ Issue #17/#18 — ดูรายละเอียดใน commit message ของ
`fix: scope test assertions to avoid flaky cross-file DB pollution`)

**\*หมายเหตุเรื่องแถวที่ทำเครื่องหมาย "Pass (stand-in)":** ทุกแถว `E2E-*` ในตารางข้อ 2 ไม่ได้รันผ่าน
Playwright จริง — `npx playwright install chromium` ดาวน์โหลด browser binary ไม่ได้ใน sandbox ที่ใช้
ทำ Lab นี้ (เน็ตบล็อกเฉพาะโดเมนนั้น ลองแล้ว 2 host, ส่วน npm registry เข้าได้ปกติตลอด) ไฟล์
`e2e/lab-02/requester-ticket-flow.spec.ts` เขียนไว้ตามโครงที่ labsheet ต้องการแล้วแต่ยังไม่เคยรันจริง
สิ่งที่ "Pass" จริงในแถวเหล่านี้คือ **component-level test ที่จำลอง scenario เดียวกัน** (Vitest +
React Testing Library) ซึ่งเป็นการทดสอบจริงที่รันได้และผ่านจริง เพียงแต่ไม่ใช่ browser end-to-end
เต็มรูปแบบตามที่วางแผนไว้ตอนแรก — ถ้ามีเครื่องที่ install Playwright ได้ ควรรัน
`npx playwright test` เพิ่มเพื่อให้ได้หลักฐาน E2E ของจริงครบ

## 7. Known Limitations or Deferred Tests

- ยังไม่มีเทสต์ครอบคลุม concurrent ticket creation จริง (สองคนสร้างพร้อมกันเป๊ะ) — UNIT-01 เทสต์
  แค่ sequential 10 ครั้ง ไม่ใช่ race condition จริง ยอมรับเป็นข้อจำกัดของ Lab 2 เพราะ scope เดิม
  ไม่บังคับ concurrency test
- Playwright E2E ยังไม่เคยรันจริงสักครั้ง (ดูหมายเหตุในข้อ 6) — ใช้ component-level stand-in แทนทุกแถว
- ยังไม่มี unit test แยกสำหรับ `sanitizeFilename()` (path traversal) โดยตรง — ครอบคลุมทางอ้อมผ่าน
  attachment upload tests ที่ใช้ชื่อไฟล์ปกติเท่านั้น ไม่เคยทดสอบด้วยชื่อไฟล์ที่มี `../` จริง
