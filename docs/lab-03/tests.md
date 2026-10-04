# Lab 3 Test Plan and Results

## 1. Test Strategy

ครอบคลุมทุกระดับที่ labsheet §10 กำหนด: unit, API/integration, UI component, UI style, responsive, security/authorization, migration/regression, E2E — วางแผนจาก `specification.md` ก่อนเขียนโค้ด (TDD: เขียนเทสต์ของแต่ละ Issue ให้แดงก่อนแล้วค่อย implement)

- **Security/authorization แยกเป็นไฟล์ของตัวเอง** (`authorization.api.test.ts`) เดินตามตาราง Section 5.1 ของ spec แถวต่อแถว ไม่ปล่อยให้ปนกับ happy path — "การซ่อนปุ่มไม่ใช่การกันสิทธิ์" ต้องพิสูจน์ที่ API
- **Transition matrix ทดสอบที่ระดับ unit ครบทุกช่อง** (8 × 8) แล้วยืนยันที่ API อีกชั้นทั้งกรณีผ่านและ `409`
- **Regression:** เทสต์ Lab 1 และ Lab 2 ทั้งหมดยังต้องเขียว — เทสต์ Lab 2 ถูกปรับให้ login ผ่าน helper แทนการส่ง `requesterId` (เปลี่ยนวิธีระบุตัวตน ไม่เปลี่ยนสิ่งที่ assert)
- **Test data:** เทสต์ฝั่ง server สร้าง user / Ticket ของตัวเองด้วย email สุ่ม (`*@lab3.test`) แล้วลบทิ้งใน `afterAll` ไม่พึ่งข้อมูล seed ยกเว้นเทสต์ migration ที่ตั้งใจตรวจ seed
- **ไม่รันขนาน** (`fileParallelism: false`, D-13) เพราะทุกไฟล์ใช้ฐานข้อมูลเดียวกัน
- **UI tests** mock `fetch` (ไม่ต้องมี backend) ส่วน **E2E** รันกับ server + client + ฐานข้อมูลจริงที่ seed แล้ว

## 2. Planned Tests

### Unit

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-09, D-02 | hash แล้ว verify รหัสเดิมผ่าน รหัสอื่นไม่ผ่าน; hash รหัสเดียวกันสองครั้งได้ค่าต่างกัน (salt) | verify ถูกต้อง, hash ไม่ซ้ำ, ไม่มี plaintext ใน hash | server/tests/lab-03/password.unit.test.ts | Planned |
| UNIT-02 | Unit | BR-10, AC-08 | policy ที่ขอบ: 7/8/72/73 ตัว, ไม่มีตัวเลข, ไม่มีตัวอักษร, เท่ากับ email | ผ่านเฉพาะ 8 และ 72 ที่ครบเงื่อนไข | server/tests/lab-03/password.unit.test.ts | Planned |
| UNIT-03 | Unit | BR-22, 5.2 | ทุกช่องของ transition matrix 8 × 8 | ผ่านเฉพาะช่อง ✅ | server/tests/lab-03/status-transitions.unit.test.ts | Planned |
| UNIT-04 | Unit | BR-23 | status ที่ต้องมี owner | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED` เท่านั้น | server/tests/lab-03/status-transitions.unit.test.ts | Planned |

### Authentication (API)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | AC-01, BR-11 | login ถูกต้อง | `200`, cookie `tt_session` มี `HttpOnly` + `SameSite=Lax`, body มี role และไม่มี `passwordHash` | server/tests/lab-03/auth.api.test.ts | Planned |
| API-02 | API | AC-05, BR-07 | รหัสผิด vs email ไม่มีอยู่ | ทั้งคู่ `401` ข้อความเดียวกัน ไม่มี cookie | server/tests/lab-03/auth.api.test.ts | Planned |
| API-03 | API | AC-06, BR-01 | inactive + รหัสถูก / inactive + รหัสผิด | `403 ACCOUNT_INACTIVE` / `401` ไม่มี session | server/tests/lab-03/auth.api.test.ts | Planned |
| API-04 | API | AC-09, FR-03 | `GET /api/auth/me` มี/ไม่มี cookie | `200` ตัวตน / `401` | server/tests/lab-03/auth.api.test.ts | Planned |
| API-05 | API | AC-07, BR-12 | logout แล้วใช้ cookie เดิม | `204` แล้ว `401` | server/tests/lab-03/auth.api.test.ts | Planned |
| API-06 | API | AC-02, BR-02 | user ที่ต้องเปลี่ยนรหัส เรียก My Tickets → เปลี่ยนรหัส → เรียกอีกครั้ง | `403 PASSWORD_CHANGE_REQUIRED` แล้ว `200` | server/tests/lab-03/auth.api.test.ts | Planned |
| API-07 | API | AC-08, BR-10 | change-password: current ผิด, policy ผิด, ซ้ำรหัสเดิม | `400` + field/code ที่ถูก รหัสไม่เปลี่ยน | server/tests/lab-03/auth.api.test.ts | Planned |
| API-08 | API | BR-11, D-03 | แถว session ใน DB ไม่ใช่ token ใน cookie (เป็น SHA-256) | `id` ≠ token, `id` = sha256(token) | server/tests/lab-03/auth.api.test.ts | Planned |
| API-09 | API | BR-11 | session ที่ `expiresAt` ผ่านไปแล้ว | `401` และแถวถูกลบ | server/tests/lab-03/auth.api.test.ts | Planned |

### Authorization (API)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-10 | Security | AC-09, 5.1 | ไม่มี cookie เรียกทุก endpoint ที่ป้องกันไว้ | `401` ทุกตัว | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-11 | Security | AC-10, AC-35, BR-15 | Requester → staff/admin, IT Staff → admin และ requester-only endpoints | `403` ทุกตัว ไม่มีข้อมูลรั่ว | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-12 | Security | AC-03, BR-03 | Requester ส่ง `requesterId` ของคนอื่นใน list / create | ได้เฉพาะของตัวเอง; Ticket ที่สร้างเป็นของผู้ login | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-13 | Security | AC-13, BR-16 | Requester A ขอ Ticket / Attachment / Comments ของ B | `404` ทุกตัว | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-14 | Regression | BR-42 | `GET /api/requesters` | `404` (ลบแล้ว) | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-40 | Security | BR-21, api-spec Requester Tickets | response ของ create / list / detail ฝั่ง Requester | มีเฉพาะ field ตามสัญญา ไม่มี `itPriority` / `ownerId` / `requesterId` | server/tests/lab-03/authorization.api.test.ts | Planned |

### Migration & regression

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | Migration | AC-11, BR-39 | หลัง migrate: ตาราง `DevRequester` ไม่มีแล้ว, Ticket ทุกใบมี requester role `REQUESTER`, email Lab 2 ทั้ง 5 เป็น `User` | ครบทุกข้อ | server/tests/lab-03/migration.api.test.ts | Planned |
| MIG-02 | Migration | AC-11, BR-40 | Requester ที่ migrate มา login ด้วย initial password ที่ seed กำหนด | `200` + `mustChangePassword: true` (ถ้ายังไม่เคยเปลี่ยน) | server/tests/lab-03/migration.api.test.ts | Planned |
| MIG-03 | Migration | BR-21, D-09 | Ticket ทุกใบมี `itPriority` (backfill) และ status เป็น enum ที่ถูกต้อง | ไม่มีค่า null / ค่าแปลก | server/tests/lab-03/migration.api.test.ts | Planned |
| REG-01 | Regression | AC-12, BR-45 | ชุดเทสต์ server ของ Lab 2 (6 ไฟล์ที่เหลือหลัง retire `requesters.api.test.ts` — ดู §7.1) รันแบบ login จริง | เขียวทั้งหมด | server/tests/lab-02/*.test.ts | Planned |
| REG-02 | Regression | AC-12 | ชุดเทสต์ client ของ Lab 2 รันกับ AuthContext | เขียวทั้งหมด | client/tests/lab-02/*.test.tsx | Planned |

### IT Staff Queue

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-15 | API | AC-14, BR-43 | คิวค่าเริ่มต้น | ไม่มี CLOSED/CANCELLED, item มี requester/owner/itPriority/updatedAt | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-16 | API | AC-15, BR-44 | filter status / owner=me / owner=unassigned / priority / category + search ด้วย email Requester | ได้ชุดที่ถูกต้องเท่านั้น | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-17 | API | AC-15, D-09 | sort `itPriority:desc`, pagination metadata, `pageSize=999` ถูกปัด | CRITICAL มาก่อน, `pageSize=50`, `total` ถูก | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-18 | API | AC-15 | `status=BOGUS`, `sort=foo:up`, `page=0`, `owner=abc` | `400` + field | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| UI-15 | UI | AC-14 | คิว render แถวพร้อม badge และ Owner "Unassigned" | แสดงครบ 7 คอลัมน์ | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |
| UI-16 | UI | AC-15 | quick filter / dropdown / search ยิง query ที่ถูก + reset page | URL query ตรงกับที่เลือก | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |
| UI-17 | UI | AC-16 | empty vs no-results vs failure | ข้อความต่างกัน ไม่ปนกัน | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |
| STYLE-01 | UI style | AC-37, ui-spec §2 | badge status / priority / role ใช้ class `tt-badge-*` และมีข้อความอ่านได้ | class + label ถูก | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |

### IT Staff Ticket operations

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-19 | API | FR-12 | staff detail มี requester, owner, attachments, `allowedTransitions` | ครบ, `allowedTransitions` ตรง matrix | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-20 | API | AC-17, BR-18/19 | claim, reassign, unassign; assign ให้ inactive / Requester | `200` / `400 ASSIGNEE_INVALID` | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-21 | API | AC-18, BR-21 | IT Staff ตั้ง IT Priority; Requester เรียกเดียวกัน | `200` + requestedPriority เดิม / `403` | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-22 | API | AC-19, BR-22/23 | transition ถูก / นอก matrix / ไม่มี owner / unassign ตอน IN_PROGRESS / unassign กับเปลี่ยนเป็น IN_PROGRESS พร้อมกัน (race) | `200` / `409 INVALID_TRANSITION` / `409 OWNER_REQUIRED` | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-23 | API | AC-21, BR-20 | Ticket CLOSED: เปลี่ยน owner / priority / status | `409` ทุกตัว | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-24 | API | FR-18 | IT Staff ดาวน์โหลด attachment ของ Ticket ใดก็ได้; removed → 404 | `200` ไฟล์จริง / `404` | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-25 | API | BR-25, BR-26 | ไป REOPENED ล้าง `requesterResolvedAt`; ทุก mutation ขยับ `updatedAt` | ค่าเป็น null / updatedAt ใหม่กว่าเดิม | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| UI-18 | UI | AC-17 | กด Claim ยิง `PUT …/owner` ด้วย id ตัวเอง แล้วแสดง owner ใหม่ | request body ถูก, UI อัปเดต | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-19 | UI | AC-20, BR-24 | เลือก Resolved → dialog; Cancel ไม่ยิง request; Confirm ยิง | ตรงตามนั้น | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-20 | UI | AC-21 | Ticket CLOSED: operations read-only | ไม่มี select/ปุ่ม Save | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-21 | UI | AC-36, ui-spec §9 | Public Comments กับ Internal Notes คนละ card, คนละปุ่ม, ป้าย Internal ชัด | 2 ฟอร์มแยกกัน, class `tt-internal-note` | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-22 | UI | AC-19 | API ตอบ `409` | ข้อความ error ใต้ control นั้น | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |

### Public Comments, Internal Notes, resolved indication

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-26 | API | AC-22, BR-29 | Requester โพสต์ comment แล้ว IT Staff อ่าน | เห็นพร้อม author (id, name, role) และ createdAt จาก server | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-27 | API | AC-23, AC-04, BR-32 | IT Staff เขียน note; Requester เรียก notes endpoint และ ticket detail | staff เห็น / Requester `403` ไม่มีเนื้อหา, detail ไม่มี note | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-28 | API | AC-24, BR-28 | body ว่าง / ช่องว่างล้วน / 2001 ตัว / 2000 ตัว | `400` สามตัวแรก, `201` ตัวสุดท้าย | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-29 | API | AC-27, BR-31 | comment บน Ticket CLOSED; note บน Ticket CLOSED | `409 TICKET_CLOSED` / `201` | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-30 | API | AC-26, BR-25 | resolved indication, กดซ้ำ, status ไม่เปลี่ยน, Requester เรียก status endpoint | `200` / `409` / status เดิม / `403` | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-31 | API | AC-25, BR-30 | comment ที่มี `<script>` เก็บและคืนตรงตัว | body ตรงกับที่ส่ง (ไม่ strip ไม่ escape ซ้ำ) | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| UI-23 | UI | AC-22, AC-25 | Requester โพสต์ comment; comment ที่มี HTML แสดงเป็นข้อความ | เห็นข้อความตรงตัว ไม่มี element `<b>` ถูกสร้าง | client/tests/lab-03/RequesterComments.test.tsx | Planned |
| UI-24 | UI | AC-26, BR-25 | ปุ่ม Problem Appears Resolved แสดงตาม status; หลังกดเป็นข้อความยืนยัน | ตรงเงื่อนไข | client/tests/lab-03/RequesterComments.test.tsx | Planned |
| UI-25 | UI | AC-23 | หน้า Requester ไม่มี UI ของ Internal Notes / IT Priority / status control | ไม่พบเลย | client/tests/lab-03/RequesterComments.test.tsx | Planned |

### Administrator

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-32 | API | AC-28 | list, search ชื่อ, search email, filter role, role ไม่รู้จัก | ผลถูก / `400` | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-33 | API | AC-29, BR-33 | create user แล้ว login ด้วย initial password | `201` + `mustChangePassword: true`, login ได้แต่ API อื่น `403 PASSWORD_CHANGE_REQUIRED` | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-34 | API | AC-30, BR-06/34 | email ซ้ำ (ตัวพิมพ์ต่าง), role ผิด, name สั้น, password อ่อน | `409 DUPLICATE_EMAIL` / `400` + field, จำนวน user ไม่เพิ่ม | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-35 | API | AC-31, BR-13 | แก้ name/email/role; deactivate แล้ว session เดิมของ user นั้น | ค่าใหม่ / `401` | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-36 | API | AC-32, BR-35 | ตั้ง initial password ใหม่ | session เดิม `401`, login ใหม่ต้องเปลี่ยนรหัส | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-37 | API | AC-33, BR-36 | admin deactivate / เปลี่ยน role ตัวเอง | `409 SELF_MODIFICATION` | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-38 | API | AC-34, BR-37 | admin ทดสอบ 2 คนเป็น admin active เพียงสองคน (ปิด admin อื่นชั่วคราวแล้วคืนค่าใน `finally`) แล้วยิง deactivate กันและกัน **พร้อมกัน** | สำเร็จ 1 / `409 LAST_ADMIN` 1 / เหลือ admin active ≥ 1 | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-39 | API | AC-35 | Requester / IT Staff เรียก `/api/admin/*` | `403` | server/tests/lab-03/users-admin.api.test.ts | Planned |
| UI-26 | UI | AC-28 | ตาราง Name/Email/Role/Status/Edit; search + role filter ยิง query | ครบ | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-27 | UI | AC-30 | create ไม่กรอกช่อง → error ใต้ field ไม่ยิง API; `409 DUPLICATE_EMAIL` แสดงใต้ Email | ตรงตามนั้น | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-28 | UI | AC-33 | แก้บัญชีตัวเอง: Active / Role disabled + ข้อความอธิบาย | disabled | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-29 | UI | AC-34 | API ตอบ `409 LAST_ADMIN` | alert แสดงเหตุผล | client/tests/lab-03/UserManagement.test.tsx | Planned |

### Authentication UI & role navigation

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | UI | AC-38 | Login ช่องว่าง | error ใต้ field, ไม่ยิง API | client/tests/lab-03/Login.test.tsx | Planned |
| UI-02 | UI | §8.1 | Login busy state | ปุ่ม "Signing in…" disabled ระหว่างรอ | client/tests/lab-03/Login.test.tsx | Planned |
| UI-03 | UI | AC-05, D-14 | `401` | alert ข้อความ generic, คง email, ล้าง password | client/tests/lab-03/Login.test.tsx | Planned |
| UI-04 | UI | AC-06 | `403 ACCOUNT_INACTIVE` | alert ข้อความ inactive | client/tests/lab-03/Login.test.tsx | Planned |
| UI-05 | UI | AC-38 | network error | ข้อความ safe failure, คง email | client/tests/lab-03/Login.test.tsx | Planned |
| UI-06 | UI | AC-08 | change password: policy ผิดฝั่ง client | error ใต้ New password ไม่ยิง API | client/tests/lab-03/ChangePassword.test.tsx | Planned |
| UI-07 | UI | AC-08 | confirm ไม่ตรง | error ใต้ Confirm | client/tests/lab-03/ChangePassword.test.tsx | Planned |
| UI-08 | UI | AC-08 | server ตอบ `PASSWORD_REUSE` / current ผิด | error ใต้ field ที่ server ระบุ | client/tests/lab-03/ChangePassword.test.tsx | Planned |
| UI-09 | UI | AC-02 | สำเร็จ | refresh ตัวตน แล้วไปหน้าแรกตาม role | client/tests/lab-03/ChangePassword.test.tsx | Planned |
| UI-10 | UI | AC-10, FR-06 | เมนูของ Requester / IT Staff / Administrator | แสดงเฉพาะลิงก์ที่อนุญาต, ไม่มี Change Requester | client/tests/lab-03/AuthShell.test.tsx | Planned |
| UI-11 | UI | AC-09 | ไม่ได้ login เปิด `/my-tickets` | redirect ไป `/login` | client/tests/lab-03/AuthShell.test.tsx | Planned |
| UI-12 | UI | AC-02 | `mustChangePassword` เปิด `/my-tickets` | redirect ไป `/change-password` | client/tests/lab-03/AuthShell.test.tsx | Planned |
| UI-13 | UI | AC-10, AC-35 | Requester เปิด `/admin/users` | หน้า Forbidden | client/tests/lab-03/AuthShell.test.tsx | Planned |
| UI-14 | UI | AC-07 | กด Log out | ยิง logout แล้วไปหน้า Login | client/tests/lab-03/AuthShell.test.tsx | Planned |
| UI-30 | UI | BR-11, BR-13 | session หมด/ถูกปิดระหว่างใช้งาน: API ของหน้าตอบ `401` | กลับไปหน้า Login อัตโนมัติ (ผ่าน `apiFetch`) | client/tests/lab-03/AuthShell.test.tsx | Planned |

### E2E (Playwright, server + client + DB จริง)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-01, AC-05, AC-06 | login ถูก / ผิด / inactive ในเบราว์เซอร์จริง | ข้อความและการพาไปหน้าถูกต้อง | e2e/lab-03/authentication.spec.ts | Planned |
| E2E-02 | E2E | AC-02 | login ด้วย initial password แล้วเปลี่ยน | เข้าแอปปกติได้หลังเปลี่ยนสำเร็จเท่านั้น | e2e/lab-03/authentication.spec.ts | Planned |
| E2E-03 | E2E | AC-07, AC-09 | logout แล้วเปิด URL ที่ป้องกันไว้ตรง ๆ | ถูกพาไปหน้า Login | e2e/lab-03/authentication.spec.ts | Planned |
| E2E-04 | E2E | AC-10 | เมนูของแต่ละ role + Forbidden | ตรง FR-06 | e2e/lab-03/authentication.spec.ts | Planned |
| E2E-05 | E2E | AC-12, AC-17–AC-23, AC-26 | Requester สร้าง Ticket + comment → IT Staff claim, ตั้ง priority, note, comment, In Progress → Requester เห็น comment ไม่เห็น note, กด resolved → IT Staff Resolve (confirm) + Close | ครบทั้ง flow | e2e/lab-03/staff-ticket-flow.spec.ts | Planned |
| E2E-06 | E2E | AC-29, AC-32 | Admin สร้าง user → user ใหม่ถูกบังคับเปลี่ยนรหัส | flow ครบ | e2e/lab-03/user-administration.spec.ts | Planned |
| E2E-07 | E2E | AC-31 | Admin deactivate user → user login ไม่ได้ | ข้อความ inactive | e2e/lab-03/user-administration.spec.ts | Planned |
| E2E-08 | E2E | AC-33, AC-35 | Admin แก้ตัวเองไม่ได้; IT Staff เปิด User Management | control disabled / Forbidden | e2e/lab-03/user-administration.spec.ts | Planned |
| RESP-01 | Responsive | AC-36 | ทุกหน้าจอหลักที่ 1280 / 820 / 375 px | ไม่มี horizontal overflow (`scrollWidth ≤ clientWidth`) + screenshot | e2e/lab-03/responsive-evidence.spec.ts | Planned |
| REG-03 | Regression | AC-12 | flow Requester ของ Lab 2 แบบ login | ผ่าน | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Tests |
| --- | --- |
| AC-01 | API-01, E2E-01 |
| AC-02 | API-06, UI-09, UI-12, E2E-02 |
| AC-03 | API-12 |
| AC-04 | API-27 |
| AC-05 | API-02, UI-03, E2E-01 |
| AC-06 | API-03, UI-04, E2E-01 |
| AC-07 | API-05, UI-14, E2E-03 |
| AC-08 | UNIT-02, API-07, UI-06, UI-07, UI-08 |
| AC-09 | API-04, API-10, UI-11, E2E-03 |
| AC-10 | API-11, UI-10, UI-13, E2E-04 |
| AC-11 | MIG-01, MIG-02, MIG-03 |
| AC-12 | REG-01, REG-02, REG-03, E2E-05 |
| AC-13 | API-13 |
| AC-14 | API-15, UI-15 |
| AC-15 | API-16, API-17, API-18, UI-16 |
| AC-16 | UI-17 |
| AC-17 | API-20, UI-18, E2E-05 |
| AC-18 | API-21, E2E-05 |
| AC-19 | UNIT-03, UNIT-04, API-22, UI-22 |
| AC-20 | UI-19, E2E-05 |
| AC-21 | API-23, UI-20 |
| AC-22 | API-26, UI-23, E2E-05 |
| AC-23 | API-27, UI-25, E2E-05 |
| AC-24 | API-28 |
| AC-25 | API-31, UI-23 |
| AC-26 | API-30, UI-24, E2E-05 |
| AC-27 | API-29 |
| AC-28 | API-32, UI-26 |
| AC-29 | API-33, E2E-06 |
| AC-30 | API-34, UI-27 |
| AC-31 | API-35, E2E-07 |
| AC-32 | API-36, E2E-06 |
| AC-33 | API-37, UI-28, E2E-08 |
| AC-34 | API-38, UI-29 |
| AC-35 | API-11, API-39, UI-13, E2E-08 |
| AC-36 | UI-21, RESP-01 |
| AC-37 | STYLE-01 |
| AC-38 | UI-01, UI-05 |

## 4. Responsive and Visual Checklist

ใช้รายการเดียวกับ `ui-spec.md` §13 — ติ๊กใน L3-9 จากการดูหน้าจอจริงที่ 3 viewport พร้อม screenshot ใน `artifacts/lab-03/screenshots/`

## 5. Test Commands

PowerShell (Windows):

```powershell
cd server; npx prisma migrate deploy; npx prisma db seed; npm test
cd ..\client; npm test
# E2E: เปิด server (npm run dev) และ client (npm run dev) ไว้ก่อนในอีกสองหน้าต่าง
cd ..; npx playwright test e2e/lab-03
```

## 6. Final Results

_(อัปเดตใน L3-10 หลังรันบน branch สุดท้าย)_

## 7. Known Limitations or Deferred Tests

### 7.1 Lab 2 tests retired (ไม่ใช่ลบทิ้งเงียบ ๆ — บันทึกเหตุผลไว้ที่นี่)

| Lab 2 test file | Retired in | เหตุผล | พฤติกรรมเดิมถูกคุมโดย |
| --- | --- | --- | --- |
| `client/tests/lab-02/RequesterContext.test.tsx` | L3-3 | ทดสอบ `RequesterContext` (เลือก/จำ requester ใน localStorage) ซึ่งถูกลบออกตาม BR-42 / FR-08 — identity มาจาก session เท่านั้น | AuthShell: UI-11 และเทสต์ BR-42 (ล้าง key เก่าใน localStorage) |
| `client/tests/lab-02/RequesterSelect.test.tsx` | L3-3 | หน้า Requester Selection ไม่มีอีกแล้ว (BR-42 / FR-08) | Login: UI-01..UI-05 |
| `client/tests/lab-02/AppShell.test.tsx` | L3-3 | ทดสอบ guard "ยังไม่เลือก requester" และปุ่ม Change Requester | AuthShell: UI-10, UI-11, UI-14 |
| `server/tests/lab-02/requesters.api.test.ts` | L3-4 | ทดสอบ `GET /api/requesters` ซึ่งถูกลบตาม BR-42 | API-14 (ยืนยันว่าได้ `404`) |

stand-in "E2E-04: switching requester" ใน `MyTickets.test.tsx` ถูกแทนที่ใน L3-4 ด้วยเทสต์ BR-03 "My Tickets request carries no requesterId" — การสลับ requester ไม่มีอยู่แล้ว สิ่งที่ต้องพิสูจน์แทนคือ client ไม่ระบุตัวตนเองเลย

เทสต์ server ของ Lab 2 ที่เหลือ 6 ไฟล์ (REG-01) รันแบบ login จริงผ่าน `loginAgent` — assertion เดิมทั้งหมดคงไว้ ยกเว้นสองกรณีที่ความหมายเปลี่ยนตาม Lab 3: "ไม่ส่ง requesterId → 400" กลายเป็น "ไม่มี session → 401" และ "requester inactive สร้าง Ticket → 404" กลายเป็น "requester ถูก deactivate แล้ว session เดิม → 401"

Lab 2 UI-11 ใน `client/tests/lab-02/RequesterTicketDetail.test.tsx` เคยยืนยันว่า "ไม่มี public comment" (Lab 2 ตัดออก) — L3-7 เปลี่ยน assertion นั้นเป็น "มี section Public comments" ตาม FR-09; ส่วนที่ยืนยันว่าไม่มี Internal Notes / Actions Taken คงไว้

_(ส่วนที่เหลืออัปเดตใน L3-10)_
