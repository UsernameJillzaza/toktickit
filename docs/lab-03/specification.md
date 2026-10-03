# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

แทนที่ Development Requester selector ชั่วคราวของ Lab 2 ด้วยระบบ login จริง (email + password, บังคับเปลี่ยนรหัสผ่านครั้งแรก) และ role-based authorization ฝั่ง server สำหรับ 3 role — Requester, IT Staff, Administrator — พร้อมส่งมอบ workflow ฝั่ง IT Staff ชุดแรก (Ticket Queue, Ticket Detail, ownership, IT Priority, status transition, Public Comments, Internal Notes) และหน้า User Management แบบเรียบง่ายสำหรับ Administrator โดยทุกฟังก์ชันของ Requester จาก Lab 2 ยังทำงานได้เหมือนเดิมด้วยตัวตนที่ login จริง

## 2. Stakeholder Request Interpretation

ฝ่าย IT บอกว่าตัวเลือก Requester ชั่วคราวหมดหน้าที่แล้ว ระบบต้องมีผู้ใช้จริง: ทุกคนเข้าด้วย email + password, ใครได้รหัสผ่านเริ่มต้นต้องเปลี่ยนก่อนเข้าใช้งาน, แต่ละคนเห็นเฉพาะเมนูและการกระทำที่ role ของตัวเองทำได้ Requester ใช้งานแบบ Lab 2 ต่อแต่ "เจ้าของตั๋ว" มาจากบัญชีที่ login ไม่ใช่ค่าที่ client ส่งมา IT Staff ต้องมีคิวงานที่หางานเจอ เปิดดูรายละเอียด รับงาน/โอนงาน ตั้ง IT Priority คุยกับ Requester ผ่าน Public Comment จด Internal Note ส่วนตัว และเลื่อนสถานะตาม workflow ที่อนุญาต Requester บอกได้แค่ว่า "ปัญหาน่าจะหายแล้ว" แต่คนปิดงานจริงคือ IT Staff Administrator ต้องจัดการบัญชีผู้ใช้ได้แบบพื้นฐาน และที่สำคัญที่สุด **การซ่อนปุ่มไม่ใช่การกันสิทธิ์** — ทุก API ต้องเช็ค role และ ownership ที่ backend เสมอ

## 3. Scope

### Included

- Login / Logout / current user / บังคับเปลี่ยนรหัสผ่านครั้งแรก / เปลี่ยนรหัสผ่านเอง
- Session ฝั่ง server (Postgres) + httpOnly cookie, hashing ด้วย scrypt
- Role-based navigation และ server-side authorization ทุก endpoint (ตาราง Section 5.1)
- Migration `DevRequester` → `User` โดย Ticket เดิมยังเป็นของเจ้าของเดิม
- Requester regression: Create Ticket, My Tickets, Ticket Detail, Attachments ใช้ตัวตนจาก session; ลบ selector + Change Requester
- Requester: Public Comments บน Ticket ตัวเอง + ปุ่ม "Problem Appears Resolved"
- IT Staff: Ticket Queue (search / filter / sort / pagination), Ticket Detail, claim / assign / reassign / unassign, IT Priority, status transition, Public Comments, Internal Notes, ดู/ดาวน์โหลด attachment ของทุก Ticket
- Administrator: User Management (list, search ชื่อ/email, filter role, create, edit, activate/deactivate, ตั้ง initial password ใหม่) พร้อม safety rule
- Idempotent seed: Requester / IT Staff / Administrator, Ticket ตัวอย่างหลายสถานะ, Comment และ Note ตัวอย่าง
- Zen Green UI ต่อยอดจาก Lab 2: badge สำหรับ status / priority / role, หน้าจอใหม่ responsive ทั้ง 3 ขนาด
- E2E (Playwright) สำหรับ login, IT Staff flow, User Management

### Excluded

ตาม labsheet §4.2: email invitation / password-reset email / MFA / social login / SSO, self-registration, Actions Taken, SLA / escalation / notification, dashboard / KPI, multi-tenant, การ deploy, หลาย role ต่อ user, ลบ user / bulk / import-export / account history, profile ขยาย (แผนก, รูป), ส่งรหัสผ่านทาง email, account unlocking / approval workflow, และ pagination / multi-sort / multi-filter ในรายการ user นอกจากนี้ Lab 3 ไม่มี: แก้ไขหรือลบ Comment/Note, Requester ขอ reopen เอง, การ upload attachment โดย IT Staff, และ rate-limit / lockout ของ login (ดู D-12)

## 4. Functional Requirements

**Authentication**

- **FR-01** ผู้ใช้ login ด้วย email + password; สำเร็จแล้ว backend สร้าง session และคืนตัวตน (id, name, email, role, mustChangePassword)
- **FR-02** ผู้ใช้ logout ได้ทุกเมื่อ; session ถูกทำลายที่ backend และ cookie ถูกลบ
- **FR-03** Application shell แสดงชื่อและ role ของผู้ใช้ปัจจุบัน ดึงจาก `GET /api/auth/me`
- **FR-04** ผู้ใช้ที่ `mustChangePassword = true` ถูกพาไปหน้า Change Password และใช้หน้าจอ/API อื่นไม่ได้จนกว่าจะตั้งรหัสใหม่สำเร็จ
- **FR-05** ผู้ใช้ทุก role เปลี่ยนรหัสผ่านของตัวเองได้จากเมนู Change Password

**Authorization**

- **FR-06** เมนูนำทางแสดงตาม role: Requester = My Tickets, Create Ticket · IT Staff = Ticket Queue · Administrator = Ticket Queue, User Management
- **FR-07** ทุก endpoint ที่ป้องกันไว้ตรวจ authentication และ authorization ที่ backend ตาม Section 5.1; เปิด URL หน้าที่ไม่มีสิทธิ์ตรง ๆ แล้วเห็นหน้า Forbidden

**Requester (regression + ส่วนเพิ่ม)**

- **FR-08** ฟังก์ชัน Requester ทั้งหมดของ Lab 2 (Create Ticket, My Tickets, Ticket Detail, Attachments) ใช้ตัวตนจาก session; selector, Change Requester, `GET /api/requesters` ถูกลบ
- **FR-09** Requester อ่านและโพสต์ Public Comment บน Ticket ของตัวเอง
- **FR-10** Requester กด "Problem Appears Resolved" บน Ticket ของตัวเองได้ตามเงื่อนไข BR-25

**IT Staff**

- **FR-11** Ticket Queue: รายการ Ticket ของทุก Requester พร้อม search, filter (status, owner, IT Priority, category), sort, pagination
- **FR-12** IT Staff Ticket Detail: ข้อมูล Ticket, Requester, owner, IT Priority, status, attachments, Public Comments, Internal Notes
- **FR-13** Claim (รับงานเอง), assign / reassign ให้ IT Staff หรือ Administrator ที่ active, และ unassign
- **FR-14** ตั้ง IT Priority
- **FR-15** เปลี่ยน status ตาม transition matrix (Section 5.2)
- **FR-16** โพสต์ Public Comment
- **FR-17** สร้างและอ่าน Internal Note (IT Staff / Administrator เท่านั้น)
- **FR-18** ดู metadata และดาวน์โหลด active attachment ของทุก Ticket

**Administrator**

- **FR-19** รายการ user แสดง Name, Email, Role, Status, ปุ่ม Edit; search ชื่อหรือ email; filter role (ไม่บังคับ)
- **FR-20** สร้าง user: name, email, 1 role, activation state, initial password
- **FR-21** แก้ไข name, email, role, activation state
- **FR-22** ตั้ง initial password ใหม่ให้ user ซึ่งต้องเปลี่ยนตอน login ครั้งถัดไป

**Migration**

- **FR-23** ย้ายข้อมูล `DevRequester` ของ Lab 2 เข้า `User` โดย Ticket และ Attachment เดิมยังถูกต้องครบ

## 5. Business Rules

**Authentication & password**

- **BR-01** เฉพาะ user ที่ `isActive = true` และ credential ถูกต้องเท่านั้นที่ authenticate ได้
- **BR-02** user ที่ `mustChangePassword = true` เข้าหน้าจอปกติไม่ได้จนกว่าจะบันทึกรหัสใหม่ที่ถูกต้อง — ทุก API ยกเว้น `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/logout` ตอบ `403` code `PASSWORD_CHANGE_REQUIRED`
- **BR-03** ตัวตนที่ authenticate แล้ว ไม่ใช่ `requesterId` ที่ client ส่งมา เป็นตัวกำหนด ownership ของการกระทำฝั่ง Requester — ค่า `requesterId` ใด ๆ ใน query/body ถูกเพิกเฉย
- **BR-04** Public Comments มองเห็นได้โดย Requester เจ้าของ Ticket, IT Staff, Administrator; Internal Notes มองเห็นได้เฉพาะ IT Staff และ Administrator
- **BR-05** Requester บอกได้ว่าปัญหาน่าจะหายแล้ว แต่ตั้ง status เป็น Resolved หรือ Closed เองไม่ได้
- **BR-06** Email คือ login identifier: trim + lowercase ก่อนเก็บและก่อนเทียบ, unique ทั้งระบบ (ไม่สนตัวพิมพ์เล็ก/ใหญ่), ยาวไม่เกิน 254 ตัวอักษร
- **BR-07** login ล้มเหลวเพราะไม่มี email นี้ หรือรหัสผิด หรือบัญชียังไม่เคยได้รับรหัสผ่าน ตอบ `401` ข้อความเดียวกัน "Invalid email or password." เสมอ; บัญชี inactive ที่รหัส**ถูก** ตอบ `403` "This account is inactive. Contact an administrator." (เปิดเผยสถานะ inactive เฉพาะคนที่รู้รหัสแล้วเท่านั้น)
- **BR-08** ไม่มี account lockout ใน Lab 3 (labsheet ตัด account unlocking ออก) แต่ทุกความพยายามที่ล้มเหลวต้องคำนวณ scrypt เต็มรอบ แม้ email จะไม่มีอยู่ เพื่อไม่ให้เวลาตอบกลับบอกได้ว่า email มีจริงไหม
- **BR-09** รหัสผ่านเก็บเป็น scrypt hash + salt สุ่มต่อ user เท่านั้น ไม่เก็บ ไม่ log ไม่ส่งกลับ plaintext หรือ hash ใน response ใด ๆ
- **BR-10** Password policy: 8–72 ตัวอักษร, มีตัวอักษรอย่างน้อย 1 และตัวเลขอย่างน้อย 1, ต้องไม่เท่ากับ email; รหัสใหม่ตอนเปลี่ยนต้องไม่ซ้ำรหัสปัจจุบัน
- **BR-11** Session: token สุ่ม 32 byte ใน cookie `tt_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` เมื่อ production); DB เก็บเฉพาะ SHA-256 ของ token; หมดอายุแบบ absolute 8 ชั่วโมง; session หมดอายุ = ไม่ได้ authenticate
- **BR-12** Logout ลบแถว session และเคลียร์ cookie; cookie เก่าที่ถูกใช้ซ้ำได้ `401`
- **BR-13** ทุก request อ่าน user สดจาก DB: การ deactivate หรือเปลี่ยน role มีผลตั้งแต่ request ถัดไป; การ deactivate ลบ session ทั้งหมดของ user นั้นด้วย

**Roles & authorization**

- **BR-14** user หนึ่งคนมี role เดียว: `REQUESTER`, `IT_STAFF`, `ADMIN`
- **BR-15** ตาราง authorization (Section 5.1) บังคับที่ backend ทุก endpoint; การซ่อน/disable ปุ่มฝั่ง UI เป็นแค่ feedback ไม่ใช่การป้องกัน
- **BR-16** ไม่ได้ login → `401`; login แล้วแต่ role ไม่มีสิทธิ์ → `403` (เช็ค role **ก่อน** ค้นหา resource จึงไม่บอกว่า resource มีอยู่จริงไหม); Requester ขอ Ticket / Attachment / Comment ของคนอื่น → `404` เหมือน not found (คง D-05 ของ Lab 2)
- **BR-17** Administrator มีสิทธิ์ทำงานกับ Ticket เท่ากับ IT Staff (ตาม product overview ของ Lab 1 §1.1) แต่เมนูแยก Ticket Queue กับ User Management ชัดเจน; IT Staff ไม่มีสิทธิ์ใด ๆ ใน User Management

**Ticket ownership, priority, status**

- **BR-18** Ticket มี owner ได้ 0 หรือ 1 คน; owner ต้องเป็น user ที่ active และ role `IT_STAFF` หรือ `ADMIN`; Ticket ใหม่ยังไม่มี owner
- **BR-19** Claim = assign ให้ตัวเอง; assign / reassign ให้ IT Staff หรือ Administrator ที่ active คนใดก็ได้; unassign ได้ ยกเว้นตอน status ต้องการ owner (BR-23) → `409`
- **BR-20** Ticket ที่เป็น `CLOSED` หรือ `CANCELLED` (terminal) เปลี่ยน owner / IT Priority / status ไม่ได้อีก → `409`
- **BR-21** Requested Priority คงค่าที่ Requester ส่งมาตลอดไป; IT Priority เริ่มต้นเท่ากับ Requested Priority ตอนสร้าง Ticket (และ backfill ตอน migration); เปลี่ยนได้เฉพาะ IT Staff / Administrator; ค่าที่ใช้ได้ `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` โดย `CRITICAL` ใช้ได้เฉพาะ IT Priority (Requester เลือกได้แค่ 3 ค่าแรกเหมือน Lab 2)
- **BR-22** Status มี 8 ค่า: `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`; เปลี่ยนได้เฉพาะตาม matrix ใน Section 5.2 — นอก matrix หรือเปลี่ยนเป็นค่าเดิม → `409` code `INVALID_TRANSITION`
- **BR-23** status `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED` ต้องมี owner — เข้าสู่ status เหล่านี้โดยไม่มี owner หรือ unassign ระหว่างอยู่ใน status เหล่านี้ → `409` code `OWNER_REQUIRED`
- **BR-24** UI ต้องขอการยืนยันอย่างชัดเจนก่อนเปลี่ยนเป็น `RESOLVED`, `CLOSED`, `CANCELLED`
- **BR-25** Requester กด "Problem Appears Resolved" ได้เฉพาะ Ticket ของตัวเองที่ status เป็น `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`; ระบบบันทึก `requesterResolvedAt` โดย **ไม่เปลี่ยน status**; กดซ้ำขณะยังมีค่าอยู่ → `409`; IT Staff เห็น badge "Requester reports resolved"; ค่านี้ถูกล้างเมื่อ status เปลี่ยนเป็น `REOPENED`
- **BR-26** `Ticket.updatedAt` ถูกอัปเดตเมื่อเปลี่ยน owner / IT Priority / status, เมื่อ Requester กด resolved indication, และเมื่อมี Public Comment หรือ Internal Note ใหม่ — ใช้เป็น "Last Updated" ในคิว

**Public Comments & Internal Notes**

- **BR-27** Comment และ Note เป็น append-only — ไม่มี endpoint แก้ไขหรือลบ
- **BR-28** เนื้อหา trim ก่อนเก็บ ยาว 1–2000 ตัวอักษร; ว่างหรือมีแต่ช่องว่าง → `400`
- **BR-29** ผู้เขียนและเวลาสร้างกำหนดโดย backend จาก session; client ส่ง author มาไม่ได้
- **BR-30** แสดงเนื้อหาเป็น plain text เท่านั้น (React escape + `white-space: pre-wrap`); ห้ามตีความเป็น HTML หรือ Markdown, ห้าม `dangerouslySetInnerHTML`
- **BR-31** Public Comment ใหม่บน Ticket `CLOSED` / `CANCELLED` → `409`; Internal Note เพิ่มได้ทุก status
- **BR-32** Public Comment และ Internal Note อยู่คนละตาราง; endpoint ฝั่ง Requester ไม่ query ตาราง Internal Note เลย

**Administrator**

- **BR-33** สร้าง user ต้องมี name (trim, 2–100 ตัวอักษร), email ตาม BR-06, role 1 ค่า, `isActive`, initial password ตาม BR-10; user ที่สร้างใหม่มี `mustChangePassword = true` เสมอ
- **BR-34** แก้ไขได้เฉพาะ name, email, role, `isActive`; email ซ้ำกับคนอื่น → `409` code `DUPLICATE_EMAIL`
- **BR-35** ตั้ง initial password ใหม่ → `mustChangePassword = true` และลบ session ทั้งหมดของ user นั้น
- **BR-36** Administrator deactivate บัญชีตัวเองหรือเปลี่ยน role ตัวเองไม่ได้ → `409` code `SELF_MODIFICATION`
- **BR-37** ระบบต้องมี Administrator ที่ active อย่างน้อย 1 คนเสมอ: การเปลี่ยนใดที่จะทำให้ไม่เหลือ Administrator active → `409` code `LAST_ADMIN` — ตรวจภายใน transaction ที่ lock แถว Administrator ที่ active (`SELECT … FOR UPDATE`) เพราะทางเดียวที่จะหลุดถึงศูนย์ได้ผ่าน API คือ admin สองคน deactivate / demote กันและกันพร้อมกัน (การแก้ตัวเองถูก BR-36 กันไว้แล้ว)
- **BR-38** ไม่ลบ user; ใช้ deactivate แทน; IT Staff ที่ถูก deactivate ยังแสดงเป็น owner เดิมของ Ticket ได้ แต่ assign งานใหม่ให้ไม่ได้

**Migration & seed**

- **BR-39** แถว `DevRequester` ของ Lab 2 กลายเป็น `User` role `REQUESTER` (id, name, email, isActive เดิม) — `Ticket.requesterId` ไม่เปลี่ยนเลย
- **BR-40** user ที่ migrate มายังไม่มี password hash; seed กำหนด initial password สำหรับ local dev (ระบุใน README) และ `mustChangePassword = true`; ก่อน seed รัน user เหล่านี้ login ไม่ได้ (ตาม BR-07)
- **BR-41** seed idempotent — รันซ้ำไม่สร้างข้อมูลซ้ำ และไม่รีเซ็ตรหัสผ่านที่ user เปลี่ยนไปแล้ว; credential ที่ seed เป็นของ local dev เท่านั้น ไม่ใช่รหัสผ่านจริงของใคร
- **BR-42** ลบ Development Requester selector, `GET /api/requesters`, และ client เคลียร์ localStorage key `toktickit.selectedRequester` ที่อาจค้างจาก Lab 2

**Queue**

- **BR-43** ค่าเริ่มต้นของคิว: `status=active` (ไม่รวม `CLOSED`, `CANCELLED`), sort `createdAt:desc` + `id desc` เป็น secondary, `page=1`, `pageSize=10`, `pageSize` เกิน 50 ปัดเหลือ 50; ค่า `page` / `sort` / `status` / `priority` / `owner` ที่ไม่รู้จัก → `400`
- **BR-44** search ในคิวค้นจาก Ticket Number, Summary, ชื่อ Requester, email Requester (contains, ไม่สนตัวพิมพ์)

**Regression**

- **BR-45** Business rule ของ Lab 2 BR-01, BR-02, BR-06–BR-19 ยังมีผลทั้งหมด (ownership จาก BR-06/BR-07 ของ Lab 2 ตอนนี้อิง session แทน `requesterId`); BR-03, BR-04, BR-05 ของ Lab 2 (เรื่อง selector) ถูกแทนที่ด้วย authentication

### 5.1 Authorization Matrix

| Operation | ไม่ login | REQUESTER | IT_STAFF | ADMIN |
| --- | --- | --- | --- | --- |
| `GET /api/health`, `/api/categories`, `/api/related-systems` | ✅ | ✅ | ✅ | ✅ |
| Login | ✅ | ✅ | ✅ | ✅ |
| Logout, `me`, change password | 401 | ✅ | ✅ | ✅ |
| Create Ticket / My Tickets / own Ticket Detail | 401 | ✅ (เฉพาะของตัวเอง) | 403 | 403 |
| Upload / soft-remove attachment | 401 | ✅ (เฉพาะของตัวเอง) | 403 | 403 |
| Attachment metadata / download | 401 | ✅ (เฉพาะของตัวเอง, อื่น 404) | ✅ ทุก Ticket | ✅ ทุก Ticket |
| Public Comments อ่าน / โพสต์ | 401 | ✅ (เฉพาะของตัวเอง, อื่น 404) | ✅ ทุก Ticket | ✅ ทุก Ticket |
| Problem Appears Resolved | 401 | ✅ (เฉพาะของตัวเอง) | 403 | 403 |
| Queue, staff Ticket Detail, assignee list | 401 | 403 | ✅ | ✅ |
| Owner / IT Priority / status | 401 | 403 | ✅ | ✅ |
| Internal Notes อ่าน / เขียน | 401 | 403 | ✅ | ✅ |
| User Management (ทุก endpoint `/api/admin/*`) | 401 | 403 | 403 | ✅ |

user ที่ `mustChangePassword = true` ได้ `403 PASSWORD_CHANGE_REQUIRED` จากทุกแถวที่มีเครื่องหมาย ✅ ยกเว้นแถว Login และ Logout/me/change password (BR-02)

### 5.2 Status Transition Matrix (IT Staff / Administrator)

| จาก \ ไป | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NEW | ✅ | ✅* | — | — | — | — | ✅ |
| OPEN | — | ✅* | ✅* | ✅* | — | — | ✅ |
| IN_PROGRESS | — | — | ✅* | ✅* | — | — | ✅ |
| WAITING_FOR_REQUESTER | — | ✅* | — | ✅* | — | — | ✅ |
| RESOLVED | — | — | — | — | ✅ | ✅ | — |
| REOPENED | — | ✅* | ✅* | ✅* | — | — | ✅ |
| CLOSED | — | — | — | — | — | — | — |
| CANCELLED | — | — | — | — | — | — | — |

`*` = ต้องมี owner (BR-23) · `CLOSED` และ `CANCELLED` เป็น terminal (BR-20) · Requester ไม่มีสิทธิ์เปลี่ยน status เลย ทำได้แค่ resolved indication (BR-05, BR-25)

## 6. UI Specification Summary

รายละเอียดเต็มอยู่ใน `ui-spec.md` — สรุปโครง:

- **Login**: email, password, ปุ่ม Sign in (busy state), error แบบปลอดภัย; ล้มเหลวแล้วคง email ไว้แต่ล้างช่อง password
- **Change Password**: current, new, confirm; แสดง policy ตลอดเวลา; error ใต้ field; สำเร็จแล้วเข้าแอปตาม role
- **Application shell**: ชื่อผู้ใช้ + role badge, เมนูตาม role, Change Password, Logout; mobile ยุบเป็น hamburger แบบ Lab 2
- **Forbidden / Not Found** screen ใช้ร่วมกันทุกหน้า
- **Requester Ticket Detail** (ต่อยอด Lab 2): เพิ่มส่วน Public Comments และปุ่ม Problem Appears Resolved
- **IT Staff Ticket Queue**: desktop ตาราง 7 คอลัมน์, mobile เป็นการ์ด, แถบ filter, sort, pagination, quick filter "My tickets" / "Unassigned"
- **IT Staff Ticket Detail**: ฝั่งซ้ายข้อมูล Ticket (read-only) + attachments + Public Comments; ฝั่งขวา operations panel (owner, IT Priority, status); Internal Notes อยู่ใน panel พื้นสีอำพันอ่อน มีป้าย "Internal — not visible to requester" แยกขาดจาก Public Comments
- **User Management**: ตาราง Name / Email / Role / Status / Edit, search, role filter, ฟอร์ม Create / Edit, การ์ด Set initial password
- Badge มาตรฐานสำหรับ status, Requested Priority, IT Priority, role — มีข้อความเสมอ ไม่พึ่งสีอย่างเดียว

## 7. Data Changes

| Model | Field สำคัญ | หมายเหตุ |
| --- | --- | --- |
| `User` | `id, name, email (unique), role (Role), passwordHash?, mustChangePassword, isActive, createdAt, updatedAt` | rename จาก `DevRequester` (id เดิมทั้งหมด) |
| `Session` | `id (SHA-256 ของ token), userId (FK), createdAt, expiresAt` | ใหม่ |
| `Ticket` | เพิ่ม `ownerId? (FK User), itPriority (Priority), requesterResolvedAt?, updatedAt`; `requestedPriority` → enum `Priority`; `currentStatus` → enum `TicketStatus` | แก้ไข, ข้อมูลเดิมคงอยู่ |
| `PublicComment` | `id, ticketId (FK), authorId (FK User), body, createdAt` | ใหม่ |
| `InternalNote` | `id, ticketId (FK), authorId (FK User), body, createdAt` | ใหม่ |
| `Category`, `RelatedSystem`, `Attachment` | (ไม่เปลี่ยน) | ใช้ต่อ |

Enum: `Role { REQUESTER, IT_STAFF, ADMIN }`, `TicketStatus { NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED, CANCELLED }`, `Priority { LOW, MEDIUM, HIGH, CRITICAL }`

Index: `User.role`, `Session.userId`, `Ticket.ownerId`, `Ticket.currentStatus`, `Ticket.updatedAt`, `PublicComment(ticketId, createdAt)`, `InternalNote(ticketId, createdAt)` — ทุกตัวรองรับ filter/sort ที่คิวและหน้า detail ใช้จริง

**Migration strategy** (3 migration, SQL แก้มือหลัง `prisma migrate dev --create-only` เพื่อไม่ให้ Prisma เลือก drop+add column ที่ทำข้อมูลหาย):

1. `add_user_auth` — `ALTER TABLE "DevRequester" RENAME TO "User"`, rename constraint/index ให้ตรงชื่อที่ Prisma คาด, เพิ่ม `role` (default `REQUESTER`), `passwordHash` (NULL), `mustChangePassword` (default true), `updatedAt`; lowercase email เดิม; สร้าง `Session`
2. `add_ticket_workflow` — สร้าง enum, แปลง `requestedPriority` / `currentStatus` ด้วย `USING ...::"Priority"` / `::"TicketStatus"`, เพิ่ม `itPriority` (backfill = requestedPriority), `updatedAt` (backfill = createdAt), `ownerId`, `requesterResolvedAt`, index
3. `add_comments_notes` — สร้าง `PublicComment`, `InternalNote`

ทั้ง 3 ไม่ลบหรือเขียนทับแถวเดิม — `Ticket.requesterId` ชี้แถวเดิมเพราะ rename ตารางไม่เปลี่ยน primary key

**Seed** (idempotent): Requester active 5 คน (4 จาก Lab 2 + 1 ใหม่ที่ต้องเปลี่ยนรหัส) + inactive 1, IT Staff active 3 + inactive 1, Administrator active 2; Ticket ตัวอย่าง ≥ 20 ใบกระจาย Requester / status / priority / มี-ไม่มี owner; Public Comment และ Internal Note ตัวอย่างที่ไม่มีข้อมูลอ่อนไหว

## 8. API Contract

รายละเอียดเต็มอยู่ใน `api-spec.md` — สรุป:

```
POST /api/auth/login                     { email, password }
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/change-password           { currentPassword, newPassword }

POST /api/tickets                        (REQUESTER, ตัวตนจาก session)
GET  /api/tickets                        (REQUESTER, My Tickets)
GET  /api/tickets/:id                    (REQUESTER, เฉพาะของตัวเอง)
POST /api/tickets/:id/attachments        (REQUESTER)
GET  /api/attachments/:id                (REQUESTER เจ้าของ / IT_STAFF / ADMIN)
GET  /api/attachments/:id/download       (REQUESTER เจ้าของ / IT_STAFF / ADMIN)
POST /api/attachments/:id/remove         (REQUESTER)
GET  /api/tickets/:id/comments           (REQUESTER เจ้าของ / IT_STAFF / ADMIN)
POST /api/tickets/:id/comments           (REQUESTER เจ้าของ / IT_STAFF / ADMIN)
POST /api/tickets/:id/resolved-indication (REQUESTER)

GET  /api/staff/tickets                  (queue)
GET  /api/staff/tickets/:id
GET  /api/staff/assignees
PUT  /api/staff/tickets/:id/owner        { ownerId | null }
PUT  /api/staff/tickets/:id/it-priority  { itPriority }
PUT  /api/staff/tickets/:id/status       { status }
GET  /api/staff/tickets/:id/notes
POST /api/staff/tickets/:id/notes        { body }

GET  /api/admin/users?search=&role=
POST /api/admin/users
PATCH /api/admin/users/:id
POST /api/admin/users/:id/initial-password
```

Error shape ทุก endpoint: `{ "error": "<ข้อความที่ปลอดภัย>", "code"?: "<CODE>", "field"?: "<field>" }` — ไม่มี stack trace, ไม่มี SQL, ไม่มีข้อมูลของ user อื่น

## 9. Acceptance Criteria

**Authentication**

- **AC-01** Given user active ที่ credential ถูกต้อง, when login, then backend สร้าง session (cookie `tt_session` แบบ HttpOnly) และคืน id, name, email, role ที่อนุญาต โดยไม่มี password hash
- **AC-02** Given user ที่ต้องเปลี่ยน initial password, when login สำเร็จ, then หน้าจอปกติและ API ปกติใช้ไม่ได้ (`403 PASSWORD_CHANGE_REQUIRED`) จนกว่าจะบันทึกรหัสใหม่ที่ถูกต้อง
- **AC-03** Given Requester ที่ login แล้ว, when client ส่ง `requesterId` ของคนอื่นมา, then backend ใช้ตัวตนจาก session และไม่คืนข้อมูลของ Requester คนอื่น
- **AC-04** Given บัญชี Requester, when เรียก endpoint ของ Internal Note, then ถูกปฏิเสธ (`403`) โดยไม่มีเนื้อหา note ใน response
- **AC-05** Given email ที่ไม่มีอยู่ หรือรหัสผ่านผิด, when login, then ได้ `401` ข้อความเดียวกัน และไม่มี cookie session
- **AC-06** Given บัญชี inactive ที่รหัสถูก, when login, then ได้ `403` ข้อความ inactive และไม่มี session
- **AC-07** Given ผู้ใช้ logout แล้ว, when ใช้ cookie เดิมเรียก API หรือเปิดหน้าที่ป้องกันไว้, then API ได้ `401` และ UI พาไปหน้า Login
- **AC-08** Given รหัสใหม่ผิด policy (สั้นไป, ไม่มีตัวเลข, ซ้ำรหัสเดิม, ช่อง confirm ไม่ตรง), when บันทึก, then เห็น error ใต้ field ที่เกี่ยวข้องและรหัสผ่านไม่ถูกเปลี่ยน
- **AC-09** Given ไม่ได้ login, when เรียก endpoint ที่ป้องกันไว้ใด ๆ, then ได้ `401`; เปิดหน้าที่ป้องกันไว้แล้วถูกพาไปหน้า Login
- **AC-10** Given แต่ละ role, when login, then เมนูแสดงเฉพาะปลายทางที่อนุญาต (Section 6); เปิด URL หน้าที่ไม่มีสิทธิ์ตรง ๆ เห็นหน้า Forbidden และ API ที่เกี่ยวข้องตอบ `403`

**Migration & Requester regression**

- **AC-11** Given ฐานข้อมูล Lab 2, when รัน migration + seed, then Ticket ทุกใบยังเป็นของ Requester คนเดิม (id/email เดิม ตอนนี้เป็น `User` role `REQUESTER`) และ Requester ที่ migrate มาต้องเปลี่ยน initial password ตอน login ครั้งแรก
- **AC-12** Given Requester ที่ login แล้ว, when สร้าง Ticket, ใช้ My Tickets (search / sort / pagination), เปิด Ticket Detail, upload / download / soft-remove attachment, then ทุกอย่างทำงานเหมือน Lab 2 และไม่มี selector หรือ Change Requester ให้เห็น
- **AC-13** Given Requester A, when ขอ Ticket / Attachment / Comments ของ Requester B, then ได้ `404`

**IT Staff Queue**

- **AC-14** Given IT Staff, when เปิด Ticket Queue, then เห็น Ticket ของทุก Requester พร้อม Ticket Number, Summary, Requester, IT Priority, Status, Owner, Last Updated และค่าเริ่มต้นไม่แสดง Closed / Cancelled
- **AC-15** Given คิวที่มีข้อมูล, when ใช้ search, filter (status, owner, IT Priority, category), sort, pagination, then ได้ชุดข้อมูลและ metadata (`page`, `pageSize`, `total`) ถูกต้อง; พารามิเตอร์ไม่ถูกต้อง → `400`
- **AC-16** Given คิว, when ไม่มี Ticket เลย / filter ไม่เจอ / API ล้ม, then เห็น empty, no-results, failure state ที่ต่างกันชัดเจน

**IT Staff Ticket operations**

- **AC-17** Given Ticket ที่ยังไม่มี owner, when IT Staff กด Claim, then owner เป็นตัวเอง; reassign ให้ IT Staff ที่ active คนอื่นได้; assign ให้ user inactive หรือ Requester → `400`
- **AC-18** Given IT Staff, when ตั้ง IT Priority, then ค่าถูกบันทึกและ Requested Priority ไม่เปลี่ยน; Requester เรียก endpoint นี้ได้ `403`
- **AC-19** Given transition ที่อนุญาต, when IT Staff เปลี่ยน status, then สำเร็จ; transition ที่ไม่อยู่ใน matrix หรือเข้า `IN_PROGRESS` โดยไม่มี owner → `409` และ status ไม่เปลี่ยน
- **AC-20** Given IT Staff เลือก Resolved, Closed หรือ Cancelled, when กดบันทึก, then UI ขอยืนยันก่อนยิง API; ยกเลิกแล้วไม่มี request ใด ๆ
- **AC-21** Given Ticket ที่ `CLOSED` หรือ `CANCELLED`, when พยายามเปลี่ยน owner / IT Priority / status, then ได้ `409` และ UI ปิดการแก้ไขส่วนนี้

**Comments, Notes, resolved indication**

- **AC-22** Given Requester เจ้าของ Ticket, when โพสต์ Public Comment, then ทั้ง Requester และ IT Staff เห็นพร้อมชื่อผู้เขียน role และเวลา
- **AC-23** Given IT Staff, when เขียน Internal Note, then IT Staff / Administrator เห็น; ไม่ปรากฏใน API หรือหน้าจอใด ๆ ของ Requester
- **AC-24** Given เนื้อหาว่าง มีแต่ช่องว่าง หรือยาวเกิน 2000, when โพสต์ Comment หรือ Note, then ได้ `400` พร้อม error ที่ field และไม่มีอะไรถูกบันทึก
- **AC-25** Given Comment ที่มี HTML / `<script>`, when แสดงผล, then เห็นเป็นข้อความตรงตัว ไม่ถูก render เป็น HTML
- **AC-26** Given Requester เจ้าของ Ticket ที่ status เข้าเงื่อนไข, when กด Problem Appears Resolved, then status ไม่เปลี่ยน แต่ IT Staff เห็น indicator; Requester เรียก status endpoint ได้ `403`
- **AC-27** Given Ticket `CLOSED` หรือ `CANCELLED`, when โพสต์ Public Comment ใหม่, then ได้ `409`

**Administrator**

- **AC-28** Given Administrator, when เปิด User Management, then เห็นรายการ Name, Email, Role, Status, Edit; ค้นด้วยชื่อหรือ email ได้; filter role ได้
- **AC-29** Given Administrator สร้าง user พร้อม role 1 ค่าและ initial password, when user ใหม่ login, then ต้องเปลี่ยนรหัสผ่านก่อนเข้าแอป
- **AC-30** Given email ซ้ำ (ไม่สนตัวพิมพ์) หรือ name / email / role / password ไม่ถูกต้อง, when บันทึก, then ได้ `409` (ซ้ำ) หรือ `400` (ไม่ถูกต้อง) และไม่มีอะไรถูกบันทึก
- **AC-31** Given Administrator แก้ name / email / role / active, when บันทึก, then มีผลตั้งแต่ request ถัดไปของ user นั้น; user ที่ถูก deactivate ใช้ session เดิมไม่ได้อีก
- **AC-32** Given Administrator ตั้ง initial password ใหม่, when user คนนั้นใช้ session เดิม, then ได้ `401`; login ครั้งถัดไปถูกบังคับเปลี่ยนรหัส
- **AC-33** Given Administrator, when deactivate ตัวเองหรือเปลี่ยน role ตัวเอง, then ได้ `409` และ UI แสดงเหตุผล
- **AC-34** Given มี Administrator active อยู่ 2 คน, when ทั้งสองส่ง request deactivate อีกฝ่ายพร้อมกัน, then สำเร็จได้แค่ request เดียว อีก request ได้ `409 LAST_ADMIN` และระบบยังเหลือ Administrator active อย่างน้อย 1 คน
- **AC-35** Given ผู้ใช้ที่ไม่ใช่ Administrator, when เรียก `/api/admin/*` หรือเปิดหน้า User Management, then API ได้ `403` และ UI เห็นหน้า Forbidden

**UI & quality**

- **AC-36** Given หน้าจอหลักทุกหน้าของ Lab 3, when เปิดที่ desktop / tablet / mobile, then ใช้งานได้ ไม่มี horizontal page scroll; คิวเป็นการ์ดบน mobile; Public Comment กับ Internal Note แยกกันทางสายตาชัดเจน
- **AC-37** Given ผู้ใช้ keyboard, when ใช้ฟอร์ม login / change password / user management, then ทุก control มี label, focus มองเห็นได้, badge status / priority / role แสดงข้อความประกอบสีเสมอ
- **AC-38** Given backend ล่มระหว่าง login หรือระหว่างบันทึกข้อมูล, when ส่งฟอร์ม, then เห็น error ที่ปลอดภัยและค่าที่กรอกไว้ยังอยู่ (ยกเว้นช่อง password ของหน้า Login ที่ถูกล้าง)

## 10. Definition of Done

**Product completion** (coding agent ใช้เช็คก่อนบอกว่า "เสร็จ"):

- [ ] FR-01–FR-23 implement ครบและสาธิตได้จริงในเบราว์เซอร์
- [ ] ทุกแถวใน authorization matrix (5.1) มีเทสต์ API ยืนยัน อย่างน้อยหนึ่งกรณี "ห้าม" ต่อแถว
- [ ] transition matrix (5.2) มี unit test ครบทุกช่อง และ API test ทั้งกรณีผ่านและ `409`
- [ ] AC-01–AC-38 map เข้าเทสต์อัตโนมัติใน `tests.md` พร้อม path ไฟล์จริง ไม่มีเทสต์ที่ skip / ปิด / comment ทิ้ง
- [ ] เทสต์ Lab 1 และ Lab 2 ทั้งหมดยังเขียว (ปรับเฉพาะส่วนที่ต้อง login แทน selector)
- [ ] migration ทั้ง 3 รันบนฐานข้อมูล Lab 2 ที่มีข้อมูลอยู่แล้วโดยไม่มีแถวหาย (ตรวจด้วย regression test)
- [ ] ไม่มี plaintext password ในโค้ด, log, response, migration SQL; secret อยู่ใน `.env` เท่านั้น
- [ ] หน้าจอใหม่ตรง `ui-spec.md` ทั้ง desktop / tablet / mobile และ visual checklist ติ๊กจากของจริง
- [ ] E2E Playwright ใน `e2e/lab-03/` รันผ่านกับ server + client จริง
- [ ] README อัปเดต: วิธี migrate, seed, บัญชีทดสอบ, วิธีรันเทสต์และ E2E

**Course delivery** (ตรวจแยกจาก product): Issue + feature branch ทุกชิ้น, PR ผ่าน `lab3-staging` → `main`, peer review approve จริง, ตอบ review comment, `reviewer.md` / `ai-use.md` ครบ, PDF ตามรูปแบบ Answer Part 1–9

## 11. Assumptions and Decisions

- **D-01** ใช้ session ใน Postgres + httpOnly cookie ไม่ใช่ JWT — logout ทำลาย session ได้ทันทีและอธิบายง่าย (ตัดสินใจร่วมกับผู้ใช้ 2026-10-03)
- **D-02** Hash รหัสผ่านด้วย `scrypt` ของ `node:crypto` (N=16384, r=8, p=1, key 64 byte, salt 16 byte) รูปแบบ `scrypt$N$r$p$<salt>$<hash>` — memory-hard และอยู่ในรายการที่ OWASP แนะนำ, ไม่ต้องติดตั้ง native module บน Windows (bcrypt / argon2 ต้อง compile)
- **D-03** DB เก็บ SHA-256 ของ session token แทน token จริง — ถ้าตาราง session รั่ว ก็เอาไปสวมรอยเป็น user ไม่ได้
- **D-04** session หมดอายุ absolute 8 ชั่วโมง (หนึ่งกะทำงาน) ไม่ต่ออายุอัตโนมัติ — ง่ายและทดสอบได้แน่นอน
- **D-05** ป้องกัน CSRF ด้วย `SameSite=Lax` + client เรียก API ผ่าน Vite proxy แบบ same-origin + server ไม่เปิด CORS; flag `Secure` เปิดเฉพาะ `NODE_ENV=production` เพราะ local dev เป็น http
- **D-06** Administrator ทำงานกับ Ticket ได้เท่า IT Staff (Lab 1 §1.1) แต่เมนูแยก — ทำให้ BR-04 (Admin เห็น Note) และ labsheet §4.5 (owner อาจเป็น Admin) สอดคล้องกัน
- **D-07** Requester ขอ resource ของคนอื่น → `404` (คง D-05 ของ Lab 2); ผิด role → `403` เพราะเช็ค role ก่อน lookup จึงไม่ leak
- **D-08** Public Comment กับ Internal Note แยกตาราง — query ฝั่ง Requester ไม่มีทางดึง note ติดมาโดยบังเอิญ
- **D-09** ใช้ Postgres enum สำหรับ role / status / priority — DB กันค่าผิด และ sort IT Priority ตามลำดับ LOW < MEDIUM < HIGH < CRITICAL ได้ตรง ๆ; migration แก้ SQL มือใช้ `USING` cast เพื่อคงข้อมูล
- **D-10** initial password ของ user ที่ migrate มากำหนดใน seed ไม่ใช่ใน migration SQL — ไม่มี credential ฝังใน migration ที่ถูก commit
- **D-11** health, categories, related systems ยังเป็น public read-only — เป็นข้อมูลอ้างอิงที่ไม่อ่อนไหว และหน้า login ไม่ต้องใช้
- **D-12** ไม่ทำ lockout / rate-limit ใน Lab 3 (labsheet ตัด account unlocking) — บันทึกเป็นความเสี่ยงที่รู้อยู่ ลดผลด้วย timing equalization ตาม BR-08
- **D-13** เทสต์ฝั่ง server รันแบบ `fileParallelism: false` — ทุกไฟล์ใช้ฐานข้อมูลเดียวกัน และเทสต์ "Administrator คนสุดท้าย" ต้องปิด admin คนอื่นชั่วคราว ถ้ารันขนานจะ flaky
- **D-14** Login ล้มเหลว: คงค่า email ไว้ ล้างช่อง password (ไม่ให้รหัสค้างบนจอ)
- **D-15** `CRITICAL` ใช้ได้เฉพาะ IT Priority — Requester ประเมินความเร่งด่วนจากมุมตัวเอง IT เป็นคนยกระดับ

## 12. Issue Decomposition

| # | Issue | ขอบเขต | ขึ้นกับ |
| --- | --- | --- | --- |
| L3-1 | Sprint 3 engineering contract | 4 ไฟล์ spec นี้ | — |
| L3-2 | Authentication foundation | migration `User` / `Session`, scrypt, auth API, middleware, seed, tests | L3-1 |
| L3-3 | Login, password change, role shell | หน้า Login / Change Password, AuthContext, route guard, เมนูตาม role, Forbidden | L3-2 |
| L3-4 | Requester regression on authenticated identity | API ของ Lab 2 ใช้ session, ลบ selector, ปรับเทสต์ Lab 2 | L3-3 |
| L3-5 | IT Staff Ticket Queue | migration workflow, queue API, หน้าคิว, seed Ticket | L3-4 |
| L3-6 | IT Staff Ticket operations | staff detail, owner / IT Priority / status, transition matrix | L3-5 |
| L3-7 | Public Comments, Internal Notes, resolved indication | migration comment / note, API, UI ทั้งสองฝั่ง | L3-6 |
| L3-8 | Administrator user management | admin API + หน้า User Management + safety rule | L3-7 |
| L3-9 | E2E and responsive evidence | Playwright `e2e/lab-03/`, screenshot, visual checklist | L3-8 |
| L3-10 | Lab 3 documentation | `reviewer.md`, `ai-use.md`, ผลเทสต์สุดท้ายใน `tests.md`, README | L3-9 |

แบ่งตาม "หน่วยที่ review และทดสอบแยกได้": auth ต้องมาก่อนทุกอย่างเพราะทุก endpoint อ้าง session; regression ของ Requester ทำทันทีหลังมี login เพื่อไม่ให้ระบบอยู่ในสภาพ "ครึ่ง selector ครึ่ง login" นาน; งาน IT Staff แยกคิวออกจาก operations เพื่อให้ PR ไม่ใหญ่เกินรีวิว; L3-8 ขึ้นกับ L3-3 จริง ๆ เท่านั้น แต่ทำต่อท้ายสายเพราะแก้ไฟล์ shell / routing ชุดเดียวกับ L3-5–L3-7 จะได้ไม่ชนกันตอน merge
