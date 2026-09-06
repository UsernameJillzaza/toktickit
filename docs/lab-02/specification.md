# Lab 2 Sprint Engineering Specification

## 1. Sprint Goal

ส่งมอบประสบการณ์ใช้งานฝั่ง Requester ที่ครบวงจรสำหรับสร้างและติดตามตั๋วซ่อม IT: เลือกตัวตน
Development Requester ชั่วคราว → สร้าง Ticket พร้อมแนบไฟล์ → ค้นหา/กรอง/เรียง/แบ่งหน้า ticket
ของตัวเองใน My Tickets → เปิดดูรายละเอียดและจัดการไฟล์แนบ โดยไม่มี Requester คนใดเห็นข้อมูลของอีกคน

## 2. Stakeholder Request Interpretation

ฝ่าย IT อยากได้หน้าจอฝั่งผู้ใช้จริง ไม่ใช่แค่ demo — Requester ต้องกรอกปัญหา เลือกหมวดหมู่/ระบบที่
เกี่ยวข้อง ระบุความสำคัญ แนบหลักฐาน แล้วส่งตั๋ว จากนั้นต้องหาตั๋วของตัวเองเจอ ดูรายละเอียดได้ และ
จัดการไฟล์แนบได้ ระบบต้อง generate เลขตั๋วทางการ เก็บข้อมูลปลอดภัย และ**กันไม่ให้ Requester คนหนึ่ง
เห็นตั๋วของอีกคน**เด็ดขาด เนื่องจากยังไม่มีระบบ login จริง (จะมาใน Lab 3) จึงต้องมีหน้าจอจำลอง
"เลือกตัวตน" ไว้ก่อนเพื่อทดสอบพฤติกรรมแบบ multi-user

## 3. Scope

### Included

- Development Requester Selection screen (testing mechanism, ไม่ใช่ authentication)
- Create Ticket (ครบทุก field ตาม §4.4 ของ labsheet)
- My Tickets: ค้นหา, กรอง, เรียง, แบ่งหน้า
- Requester Ticket Detail (read-only)
- Attachment lifecycle: upload, download, soft-remove
- Zen Green theme + reusable component conventions
- Ownership enforcement ระหว่าง Requester ทุกจุดที่คืนข้อมูล Ticket/Attachment

### Excluded

- Authentication จริง (login/logout/password/session/token/role-based authorization)
- IT Staff workflow ทั้งหมด (dashboard, queue, claim/reassign, IT Priority)
- Public Comments, Internal Notes, Actions Taken
- Ticket status ใด ๆ นอกจาก `NEW` (resolve/close/reopen/cancel)
- Administration ของ user/role/reference data

## 4. Functional Requirements

- **FR-01** ระบบต้องแสดงหน้า Development Requester Selection ก่อนเข้าใช้งานหน้าจออื่นทั้งหมด
- **FR-02** ระบบต้องให้ Requester สลับตัวตนได้ทุกเมื่อผ่านปุ่ม Change Requester
- **FR-03** ระบบต้องให้ Requester สร้าง Ticket ใหม่พร้อมแนบไฟล์ได้
- **FR-04** ระบบต้อง generate Ticket Number ที่ไม่ซ้ำกันทันทีที่บันทึกสำเร็จ
- **FR-05** ระบบต้องแสดงรายการ Ticket เฉพาะของ Requester ที่เลือกอยู่ใน My Tickets
- **FR-06** ระบบต้องรองรับการค้นหา (search), กรอง (filter), เรียง (sort), และแบ่งหน้า
  (pagination) ใน My Tickets
- **FR-07** ระบบต้องให้ Requester เปิดดู Ticket Detail ของตัวเองแบบ read-only
- **FR-08** ระบบต้องให้ Requester เพิ่มไฟล์แนบเข้า Ticket ที่มีอยู่แล้วได้ ภายใต้ข้อจำกัดใน §4.5
- **FR-09** ระบบต้องให้ Requester ลบไฟล์แนบของตัวเองแบบ soft-removal พร้อมเหตุผล
- **FR-10** ระบบต้องปฏิเสธการเข้าถึง Ticket หรือ Attachment ที่ไม่ใช่ของ Requester ที่เลือกอยู่ ทั้ง
  ฝั่ง UI และฝั่ง API

## 5. Business Rules

- **BR-01** Ticket Number สร้างโดย backend รูปแบบ `TKT-<ปี ค.ศ. 4 หลัก>-<เลขรัน 6 หลัก>` เช่น
  `TKT-2026-000001` เรียงต่อเนื่องในแต่ละปี ต้อง unique ทั้งระบบ
- **BR-02** Ticket ใหม่เริ่มต้นด้วย `currentStatus = NEW` เสมอ เปลี่ยนสถานะอื่นอยู่นอกขอบเขต Lab 2
- **BR-03** Development Requester selector เป็นกลไกทดสอบเท่านั้น ไม่ใช่ authentication — ไม่มี
  password, session token, หรือการเข้ารหัสใด ๆ ผูกกับการเลือกนี้
- **BR-04** ตัวตน Requester ที่เลือกไว้เก็บใน `localStorage` ฝั่ง client รอดจากการ refresh หน้า
  จนกว่าจะกด Change Requester หรือเคลียร์ browser storage เอง
- **BR-05** Requester ที่ `isActive = false` ต้องไม่ปรากฏใน selector dropdown แม้จะยังมี Ticket
  เก่าอยู่ในระบบก็ตาม
- **BR-06** ทุก endpoint ที่คืนข้อมูล Ticket หรือ Attachment ต้องกรองด้วย `requesterId` ของ Requester
  ที่เลือกอยู่เสมอ — endpoint ที่ไม่กรองถือว่าละเมิด BR นี้
- **BR-07** พยายามเข้าถึง Ticket หรือ Attachment ที่ requesterId ไม่ตรงกับ Requester ปัจจุบัน
  ต้องได้ response `404 Not Found` (ไม่ใช่ `403`) เพื่อไม่ยืนยันว่า resource มีอยู่จริงกับ Requester
  ที่ไม่ใช่เจ้าของ
- **BR-08** Ticket Summary และ Description ต้องไม่ว่างเปล่าหลัง trim ช่องว่างหัวท้าย ความยาว
  Summary จำกัดที่ 10–150 ตัวอักษร, Description จำกัดที่ 10–2000 ตัวอักษร (ป้องกันทั้งข้อมูลว่างและ
  ข้อมูลเกินจำเป็น)
- **BR-09** `requestedPriority` ยอมรับค่าเพียง `LOW`, `MEDIUM`, `HIGH` เท่านั้น ค่าอื่นถือว่า invalid
- **BR-10** การ submit ซ้ำ (double submit) ต้องไม่สร้าง Ticket ซ้ำสองใบ — ปุ่ม Submit ต้อง disable
  ทันทีที่กดจนกว่า request จะจบ (สำเร็จหรือ error)
- **BR-11** ถ้า Create Ticket ล้มเหลว (validation หรือ API error) ค่าที่กรอกไว้ในฟอร์มต้องยังอยู่
  ครบ ห้ามเคลียร์ฟอร์มทิ้ง
- **BR-12** ไฟล์แนบอนุญาตเฉพาะ JPG/JPEG/PNG/WEBP/PDF ขนาดไม่เกิน 5 MB ต่อไฟล์ Ticket หนึ่งใบมี
  active attachment ได้ไม่เกิน 5 ไฟล์พร้อมกัน (fixed ตาม §4.5)
- **BR-13** ไฟล์แนบเก็บลง `server/uploads/<ticketId>/` ด้วยชื่อไฟล์ที่ sanitize แล้ว (ตัดอักขระ
  อันตราย เติม timestamp กันชื่อชนกัน) ส่วน path ที่แท้จริงเก็บใน DB เท่านั้น ไม่ส่ง path ดิบออกไป
  ให้ client
- **BR-14** ลบไฟล์แนบ = soft-removal เท่านั้น (`isRemoved = true`, `removedAt`, `removalReason`)
  ห้ามลบไฟล์จริงออกจาก disk และห้าม `DELETE` แถวออกจาก DB
- **BR-15** ไฟล์แนบที่ `isRemoved = true` ต้อง metadata ยังโชว์อยู่ในหน้า Ticket Detail แต่ปุ่ม
  download/preview ต้อง disable และถ้ายิง request ตรงมาที่ endpoint download ต้องได้ `404`
- **BR-16** ถ้า Ticket สร้างสำเร็จแต่ attachment อย่างน้อยหนึ่งไฟล์ upload ไม่สำเร็จ (เช่น ประเภทไฟล์
  ผิดหรือเกินขนาด) Ticket ยังคงถูกบันทึกไว้ ไม่ rollback แต่ต้องแจ้ง Requester ชัดเจนว่าไฟล์ไหนไม่ถูก
  แนบและเพราะอะไร (ไม่ใช้ distributed transaction ข้าม request สอง endpoint)
- **BR-17** My Tickets list default `page=1`, `pageSize=10`, จำกัด `pageSize` สูงสุดที่ 50 —
  request ที่ขอ `pageSize` เกิน 50 ให้ปัดเหลือ 50 แทนที่จะ error
- **BR-18** ผลลัพธ์ My Tickets เรียงตาม `createdAt desc` เป็นค่าเริ่มต้น และใช้ `id desc` เป็น
  secondary sort เพื่อกัน pagination เพี้ยนตอนมี Ticket สร้างเวลาเดียวกัน
- **BR-19** เมื่อ Requester ยังไม่เคยสร้าง Ticket เลย ต้องแสดง empty state ("ยังไม่มีตั๋ว") ต่างจาก
  no-results state ("ค้นหาแล้วไม่พบ") ที่เกิดตอนมี Ticket แต่ filter ไม่ match

## 6. UI Specification Summary

รายละเอียดเต็มอยู่ใน `ui-spec.md` — สรุปตรงนี้แค่โครง:

- Application shell แสดงชื่อ Requester ปัจจุบัน + ปุ่ม Change Requester ตลอดเวลาหลังเลือกแล้ว
- Create Ticket: field ตาม §4.4, สถานะ initial/loading/validation/submitting/success/failure
  ครบ 6 สถานะ
- My Tickets: ตาราง (desktop) / การ์ด (mobile), search bar, filter chips, sort dropdown,
  pagination control, empty/no-results แยกกันชัดเจน
- Ticket Detail: read-only field group + attachment section แยก active/removed ชัดเจน
- ทุกหน้าใช้ Zen Green token ตาม §7 ของ labsheet เป๊ะ

## 7. Data Changes

Model ใหม่/แก้ไข (Prisma) — ราย field เต็มอยู่ใน schema จริง สรุปที่นี่:

| Model | Field สำคัญ | หมายเหตุ |
| --- | --- | --- |
| `DevRequester` | `id, name, email (unique), isActive, createdAt` | ใหม่ |
| `RelatedSystem` | `id, name (unique), createdAt` | ใหม่ |
| `Category` | (มีจาก Lab 1) | ใช้ต่อ ไม่แก้ |
| `Ticket` | `id, ticketNumber (unique), requesterId (FK), categoryId (FK), relatedSystemId (FK), summary, description, requestedPriority, currentStatus, createdAt` | ใหม่ |
| `Attachment` | `id, ticketId (FK), filename, storagePath, mimeType, sizeBytes, isRemoved, removedAt, removalReason, createdAt` | ใหม่ |

Index ที่ต้องมี: `Ticket.requesterId` (ใช้กรองทุก query), `Ticket.ticketNumber` (unique, ใช้ค้นหา),
`Attachment.ticketId`

## 8. API Contract

รายละเอียดเต็มอยู่ใน `api-spec.md` — สรุป endpoint:

```
GET  /api/categories
GET  /api/related-systems
GET  /api/requesters                              → เฉพาะ isActive = true
POST /api/tickets
GET  /api/tickets?requesterId=&search=&category=&sort=&page=&pageSize=
GET  /api/tickets/:id?requesterId=
POST /api/tickets/:id/attachments?requesterId=
GET  /api/attachments/:id?requesterId=
GET  /api/attachments/:id/download?requesterId=
POST /api/attachments/:id/remove   { requesterId, reason }
```

ทุก endpoint ที่มี `requesterId` แนบมาต้องเช็ค ownership ตาม BR-06/BR-07 ก่อนคืนข้อมูลเสมอ

## 9. Acceptance Criteria

- **AC-01** Given ข้อมูล Ticket ครบและถูกต้อง, when Requester submit ฟอร์ม, then บันทึก Ticket
  หนึ่งใบและแสดง Ticket Number ที่ backend generate
- **AC-02** Given ยังไม่ได้เลือก Development Requester, when พยายามเปิด My Tickets, then ระบบพาไปที่
  หน้า Requester Selection
- **AC-03** Given Requester B ถูกเลือกอยู่, when ยิง request ขอ Ticket ของ Requester A, then ไม่คืน
  ข้อมูล Ticket นั้น (ได้ `404`)
- **AC-04** Given Requester กรอก Summary ว่างเปล่า, when submit, then เห็น field-level error ที่
  Summary และไม่มี request ยิงไปที่ API
- **AC-05** Given Requester เลือกไฟล์แนบเกิน 5 MB, when พยายามแนบ, then เห็น error message
  เฉพาะไฟล์นั้นและไฟล์อื่นที่ถูกต้องยังแนบได้ตามปกติ
- **AC-06** Given มี active attachment ครบ 5 ไฟล์แล้ว, when พยายามแนบไฟล์ที่ 6, then ระบบปฏิเสธและ
  แจ้งเหตุผล
- **AC-07** Given Requester A มี Ticket และเลือก Requester B, when เปิด My Tickets, then ไม่เห็น
  Ticket ของ A เลยแม้แต่ใบเดียว
- **AC-08** Given มี Ticket มากกว่า `pageSize`, when เปิด My Tickets หน้าแรก, then เห็นจำนวน Ticket
  เท่ากับ `pageSize` และมี control ไปหน้าถัดไป
- **AC-09** Given Requester ยังไม่เคยสร้าง Ticket, when เปิด My Tickets, then เห็น empty state ไม่ใช่
  no-results state
- **AC-10** Given ค้นหาด้วยคำที่ไม่ตรง Ticket ไหนเลย, when กด search, then เห็น no-results state
  ไม่ใช่ empty state
- **AC-11** Given Attachment ถูก soft-remove แล้ว, when พยายาม download ตรง endpoint, then ได้
  `404` และปุ่ม download ใน UI ถูก disable
- **AC-12** Given backend ล่มระหว่างสร้าง Ticket, when submit, then เห็น error state ที่ปลอดภัย และ
  ค่าที่กรอกไว้ในฟอร์มยังอยู่ครบ (ตาม BR-11)
- **AC-13** Given Development Requester ที่ `isActive = false`, when เปิดหน้า Selection, then ไม่
  เห็นชื่อ Requester นั้นใน dropdown

## 10. Definition of Done

- [ ] FR-01–FR-10 ถูก implement ครบและสาธิตได้จริง
- [ ] BR ทุกข้อไม่มีข้อยกเว้นในโค้ดจริง (เช็คจาก code review ไม่ใช่แค่เชื่อ AI agent บอก)
- [ ] AC-01–AC-13 ผ่านการเทสต์อัตโนมัติทุกข้อ พร้อม test file path จริงใน `tests.md`
- [ ] เทสต์ unit/API/UI/responsive/E2E ทั้งหมดเขียวบน branch `main`
- [ ] ownership check (BR-06/07) มีเทสต์เจาะจงแยกออกมาต่างหาก ไม่ใช่แค่ทดสอบ happy path
- [ ] Zen Green UI ตรงตาม `ui-spec.md` ทั้ง desktop/tablet/mobile
- [ ] peer review ผ่านการ approve จริงทุก PR ก่อน merge เข้า `lab2-staging`
- [ ] README อัปเดตให้รันโปรเจกต์ตามสภาพปัจจุบันได้จริง

## 11. Assumptions and Decisions

- **D-01** Ticket Number = `TKT-<ปี 4 หลัก>-<running 6 หลัก>` รันต่อเนื่องทั้งปี ไม่รีเซ็ตรายเดือน
  (ตัดสินใจร่วมกับผู้ใช้ 2026-08-19)
- **D-02** เก็บ selected Requester ใน `localStorage` ไม่ใช้ cookie/session เพราะไม่มี backend
  session จริงใน Lab 2 (ตัดสินใจร่วมกับผู้ใช้ 2026-08-19)
- **D-03** My Tickets: default `pageSize=10`, max `pageSize=50` (ตัดสินใจร่วมกับผู้ใช้ 2026-08-19)
- **D-04** ไฟล์แนบเก็บลง `server/uploads/` บน local disk ของ server ไม่ใช้ cloud storage หรือ
  base64-in-DB เพราะเป็นสภาพแวดล้อม dev/lab (ตัดสินใจร่วมกับผู้ใช้ 2026-08-19)
- **D-05** ownership failure ตอบ `404` ไม่ใช่ `403` เพื่อไม่ leak ว่า resource มีอยู่จริง (ยืนยัน
  ร่วมกับผู้ใช้ 2026-09-06)
