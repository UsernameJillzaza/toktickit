# Lab 3 REST API Contract

ต่อยอดจาก `docs/lab-02/api-spec.md` — endpoint ของ Lab 2 ยังอยู่ที่ path เดิม แต่ตอนนี้ต้อง login และใช้ตัวตนจาก session แทน `requesterId` ทุก response เป็น JSON (ยกเว้น download) ตาราง authorization อยู่ใน `specification.md` Section 5.1

## Authentication Mechanism

- Session cookie `tt_session`: token สุ่ม 32 byte (hex), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=28800` (8 ชั่วโมง), `Secure` เฉพาะ `NODE_ENV=production`
- ตาราง `Session` เก็บ `id = SHA-256(token)` และ `expiresAt` — เทียบ token ด้วย hash เท่านั้น
- ทุก request ที่มี cookie: middleware หา session → ถ้าหมดอายุลบทิ้ง → โหลด user สดจาก DB → ถ้า `isActive = false` ถือว่าไม่ได้ login
- Client เรียก API แบบ same-origin ผ่าน Vite proxy จึงไม่ต้องตั้ง `credentials` เพิ่ม; server ไม่เปิด CORS
- Password hash: `scrypt$16384$8$1$<salt base64>$<key base64>` (ดู D-02)

## Common Error Responses

| Status | `code` | `error` (ข้อความ) | ใช้เมื่อ |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` (+ `field`) | ข้อความเฉพาะ field | input ไม่ถูกต้อง |
| 401 | `UNAUTHENTICATED` | `Authentication required.` | ไม่มี session / session หมดอายุ / user inactive |
| 403 | `FORBIDDEN` | `You do not have permission to perform this action.` | login แล้วแต่ role ไม่มีสิทธิ์ |
| 403 | `PASSWORD_CHANGE_REQUIRED` | `You must change your password before continuing.` | `mustChangePassword = true` |
| 404 | `NOT_FOUND` | `<Resource> not found` | ไม่มีอยู่ หรือ Requester ขอของคนอื่น |
| 409 | ตาม endpoint | ข้อความเฉพาะกรณี | ขัดกับ business rule / สถานะปัจจุบัน |
| 500 | `SERVER_ERROR` | `Unable to …` | error ที่ไม่คาดคิด (log ฝั่ง server, ไม่ส่งรายละเอียด) |
| 503 | — | `Database unavailable` | endpoint อ้างอิงของ Lab 1/2 ตอนฐานข้อมูลล่ม |

รูปทรงเดียวกันทุกที่: `{ "error": string, "code"?: string, "field"?: string }`

JSON ที่ parse ไม่ได้ → `400 VALIDATION_ERROR` (error middleware) ไม่ใช่ 500

## Authentication

### `POST /api/auth/login`

Request: `{ "email": "somchai@toktickit.test", "password": "…" }`

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 200 | `{ "user": { id, name, email, role, mustChangePassword } }` + `Set-Cookie: tt_session=…` | credential ถูก, active |
| 400 | `VALIDATION_ERROR` field `email` หรือ `password` | ไม่ส่งมา / ไม่ใช่ string / ว่าง |
| 401 | `INVALID_CREDENTIALS` — `Invalid email or password.` | ไม่มี email, รหัสผิด, ยังไม่มี password hash |
| 403 | `ACCOUNT_INACTIVE` — `This account is inactive. Contact an administrator.` | รหัสถูกแต่ `isActive = false` |

email ถูก trim + lowercase ก่อนค้นหา; ถ้ามี session เดิมอยู่ใน cookie จะถูกลบแล้วออกใหม่

### `POST /api/auth/logout`

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 204 | — (cookie ถูกล้าง) | มี session ที่ใช้ได้ |
| 401 | `UNAUTHENTICATED` | ไม่มี session |

### `GET /api/auth/me`

| Status | Body |
| --- | --- |
| 200 | `{ "user": { id, name, email, role, mustChangePassword } }` |
| 401 | `UNAUTHENTICATED` |

ใช้ได้แม้ `mustChangePassword = true` (client ต้องรู้ว่าจะพาไปหน้าไหน)

### `POST /api/auth/change-password`

Request: `{ "currentPassword": "…", "newPassword": "…" }` (ช่อง confirm ตรวจที่ client)

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 200 | `{ "user": { …, mustChangePassword: false } }` | สำเร็จ — session อื่นของ user นี้ถูกลบ, session ปัจจุบันยังใช้ต่อได้ |
| 400 | `VALIDATION_ERROR` field `currentPassword` — `Current password is incorrect.` | รหัสปัจจุบันผิด |
| 400 | `WEAK_PASSWORD` field `newPassword` | ผิด BR-10 (ข้อความบอกกฎที่ผิด) |
| 400 | `PASSWORD_REUSE` field `newPassword` — `New password must be different from your current password.` | รหัสใหม่ = รหัสเดิม |
| 401 | `UNAUTHENTICATED` | ไม่มี session |

## Requester Tickets (Lab 2 endpoints, ตอนนี้ต้อง login role `REQUESTER`)

ทุก endpoint ด้านล่าง: `401` ถ้าไม่ login, `403 PASSWORD_CHANGE_REQUIRED` ถ้ายังไม่เปลี่ยนรหัส, `403 FORBIDDEN` ถ้า role ไม่ใช่ `REQUESTER` (ยกเว้น attachment metadata/download ที่ IT Staff/Admin ใช้ได้) — `requesterId` ใน query/body ถูกเพิกเฉย (BR-03)

### `POST /api/tickets`

Request: `{ categoryId, relatedSystemId, summary, description, requestedPriority }` — validation เดิมของ Lab 2 (BR-08/09), `requestedPriority` รับเฉพาะ `LOW|MEDIUM|HIGH`

Response `201`: `{ id, ticketNumber, summary, description, requestedPriority, currentStatus: "NEW", categoryId, relatedSystemId, createdAt }` — owner = ผู้ที่ login อยู่, `itPriority` ตั้ง = `requestedPriority` (BR-21) แต่ไม่ส่งกลับให้ Requester

`404` ถ้า category / related system ไม่มีอยู่

### `GET /api/tickets`

Query: `search`, `priority` (`LOW|MEDIUM|HIGH`), `categoryId`, `sort` (`createdAt|summary` : `asc|desc`), `page`, `pageSize` — กฎ pagination เดิม (Lab 2 BR-17/18)

Response `200`: `{ items: [{ id, ticketNumber, summary, requestedPriority, currentStatus, createdAt, updatedAt, category: { name } }], page, pageSize, total }` — เฉพาะ Ticket ของผู้ที่ login อยู่

### `GET /api/tickets/:id`

Response `200`: `{ id, ticketNumber, summary, description, requestedPriority, currentStatus, requesterResolvedAt, createdAt, updatedAt, category: { name }, relatedSystem: { name }, owner: { name } | null, attachments: [{ id, filename, mimeType, sizeBytes, isRemoved, removedAt, createdAt }] }` — ไม่มี `itPriority`, ไม่มี Internal Note

`404` ถ้าไม่มี หรือไม่ใช่ของผู้ที่ login

### Attachments

| Endpoint | Role | หมายเหตุ |
| --- | --- | --- |
| `POST /api/tickets/:id/attachments` (multipart `file`) | REQUESTER เจ้าของ | กฎเดิม Lab 2 BR-12/13 |
| `GET /api/attachments/:id` | REQUESTER เจ้าของ, IT_STAFF, ADMIN | metadata แม้ removed |
| `GET /api/attachments/:id/download` | REQUESTER เจ้าของ, IT_STAFF, ADMIN | removed → `404` |
| `POST /api/attachments/:id/remove` `{ reason }` | REQUESTER เจ้าของ | soft-remove, ซ้ำ → `409` |

Requester ขอของคนอื่น → `404`; IT Staff / Admin เรียก upload / remove → `403`

### `GET /api/tickets/:id/comments`

Role: REQUESTER (เจ้าของ), IT_STAFF, ADMIN

Response `200`: `[{ id, body, createdAt, author: { id, name, role } }]` เรียง `createdAt asc, id asc`

### `POST /api/tickets/:id/comments`

Request: `{ "body": "…" }`

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 201 | comment object (รูปเดียวกับ GET) | สำเร็จ, `Ticket.updatedAt` ขยับ |
| 400 | `VALIDATION_ERROR` field `body` | ว่าง / ช่องว่างล้วน / เกิน 2000 |
| 404 | `NOT_FOUND` | ไม่มี Ticket หรือ Requester ไม่ใช่เจ้าของ |
| 409 | `TICKET_CLOSED` — `Comments cannot be added to a closed or cancelled ticket.` | Ticket terminal |

### `POST /api/tickets/:id/resolved-indication`

Role: REQUESTER เจ้าของ เท่านั้น — ไม่มี body

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 200 | `{ id, currentStatus, requesterResolvedAt }` | บันทึกแล้ว, status ไม่เปลี่ยน |
| 404 | `NOT_FOUND` | ไม่ใช่ของตัวเอง / ไม่มี |
| 409 | `ALREADY_INDICATED` | มีค่าอยู่แล้ว |
| 409 | `INVALID_STATUS` | status เป็น `RESOLVED`, `CLOSED`, `CANCELLED` |

## IT Staff (role `IT_STAFF` หรือ `ADMIN`)

### `GET /api/staff/tickets`

| Param | ค่า | Default |
| --- | --- | --- |
| `search` | ข้อความ — ค้น ticketNumber, summary, ชื่อ/email Requester | — |
| `status` | `active` (ไม่รวม CLOSED/CANCELLED), `all`, หรือ status 1 ค่า | `active` |
| `owner` | `any`, `me`, `unassigned`, หรือ user id | `any` |
| `priority` | IT Priority: `LOW|MEDIUM|HIGH|CRITICAL` | — |
| `categoryId` | integer | — |
| `sort` | `createdAt|updatedAt|itPriority|ticketNumber` : `asc|desc` | `createdAt:desc` (+ `id desc`) |
| `page` | integer ≥ 1 | 1 |
| `pageSize` | integer ≥ 1, เกิน 50 ปัดเป็น 50 | 10 |

Response `200`:

```json
{
  "items": [
    {
      "id": 12, "ticketNumber": "TKT-2026-000012", "summary": "VPN disconnects every 10 minutes",
      "currentStatus": "OPEN", "requestedPriority": "MEDIUM", "itPriority": "HIGH",
      "createdAt": "…", "updatedAt": "…", "requesterResolvedAt": null,
      "category": { "id": 4, "name": "Network" },
      "requester": { "id": 2, "name": "Michael Brown", "email": "michael.brown@toktickit.test" },
      "owner": { "id": 8, "name": "Arthit Wongsa" }
    }
  ],
  "page": 1, "pageSize": 10, "total": 23
}
```

`400 VALIDATION_ERROR` (field = ชื่อพารามิเตอร์) เมื่อค่าไม่รู้จัก

### `GET /api/staff/tickets/:id`

Response `200` — **Staff Ticket Detail** (ใช้รูปนี้เป็น response ของทุก mutation ด้านล่างด้วย):

```json
{
  "id": 12, "ticketNumber": "…", "summary": "…", "description": "…",
  "currentStatus": "OPEN", "requestedPriority": "MEDIUM", "itPriority": "HIGH",
  "requesterResolvedAt": null, "createdAt": "…", "updatedAt": "…",
  "category": { "id": 4, "name": "Network" }, "relatedSystem": { "id": 3, "name": "VPN" },
  "requester": { "id": 2, "name": "…", "email": "…" },
  "owner": { "id": 8, "name": "…", "role": "IT_STAFF", "isActive": true },
  "attachments": [ { "id": 3, "filename": "…", "mimeType": "…", "sizeBytes": 1, "isRemoved": false, "removedAt": null, "createdAt": "…" } ],
  "allowedTransitions": ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]
}
```

`allowedTransitions` คำนวณจาก matrix (Section 5.2 ของ spec) ที่ backend — UI แสดงตัวเลือกจากค่านี้ ไม่ hardcode ซ้ำ (ไม่รวมเงื่อนไข owner; ถ้าเลือกค่าที่ต้องมี owner ตอนไม่มี owner จะได้ `409 OWNER_REQUIRED`)

`404` ถ้าไม่มี Ticket

### `GET /api/staff/assignees`

Response `200`: `[{ id, name, role }]` — user ที่ active และ role `IT_STAFF` หรือ `ADMIN` เรียงตามชื่อ

### `PUT /api/staff/tickets/:id/owner`

Request: `{ "ownerId": 8 }` หรือ `{ "ownerId": null }` (unassign) — Claim = ส่ง id ตัวเอง

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 200 | Staff Ticket Detail | สำเร็จ |
| 400 | `ASSIGNEE_INVALID` field `ownerId` | ไม่ใช่ integer/null, ไม่มี user, inactive, หรือ role REQUESTER |
| 404 | `NOT_FOUND` | ไม่มี Ticket |
| 409 | `TICKET_TERMINAL` | Ticket CLOSED / CANCELLED |
| 409 | `OWNER_REQUIRED` | unassign ตอน status ต้องมี owner |

### `PUT /api/staff/tickets/:id/it-priority`

Request: `{ "itPriority": "HIGH" }`

`200` Staff Ticket Detail · `400 VALIDATION_ERROR` field `itPriority` · `404` · `409 TICKET_TERMINAL`

### `PUT /api/staff/tickets/:id/status`

Request: `{ "status": "IN_PROGRESS" }`

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 200 | Staff Ticket Detail | transition อยู่ใน matrix; ถ้าไป `REOPENED` จะล้าง `requesterResolvedAt` |
| 400 | `VALIDATION_ERROR` field `status` | ไม่ใช่ status ที่รู้จัก |
| 404 | `NOT_FOUND` | ไม่มี Ticket |
| 409 | `INVALID_TRANSITION` — `Cannot change status from X to Y.` | นอก matrix / ค่าเดิม / จาก terminal |
| 409 | `OWNER_REQUIRED` | ไป IN_PROGRESS / WAITING_FOR_REQUESTER / RESOLVED โดยไม่มี owner |

### `GET /api/staff/tickets/:id/notes` · `POST /api/staff/tickets/:id/notes`

Role: IT_STAFF, ADMIN เท่านั้น (Requester → `403` โดยไม่ lookup Ticket) — รูป response และ validation เหมือน comments (`body` 1–2000) แต่ POST ได้ทุก status (ไม่มี `409 TICKET_CLOSED`)

## Administrator (role `ADMIN`)

### `GET /api/admin/users`

Query: `search` (ชื่อหรือ email, contains ไม่สนตัวพิมพ์), `role` (`REQUESTER|IT_STAFF|ADMIN`, ไม่บังคับ)

Response `200`: `[{ id, name, email, role, isActive, mustChangePassword, createdAt }]` เรียง `name asc, id asc` — ไม่มี pagination (labsheet §8.5) · `400` ถ้า role ไม่รู้จัก

### `POST /api/admin/users`

Request: `{ name, email, role, isActive, initialPassword }`

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 201 | user object (`mustChangePassword: true`) | สำเร็จ |
| 400 | `VALIDATION_ERROR` / `WEAK_PASSWORD` + `field` | name 2–100, email รูปแบบผิด / เกิน 254, role ไม่รู้จัก, isActive ไม่ใช่ boolean, password ผิด BR-10 |
| 409 | `DUPLICATE_EMAIL` field `email` | email ซ้ำ (ไม่สนตัวพิมพ์) |

### `PATCH /api/admin/users/:id`

Request: field ใดก็ได้ใน `{ name, email, role, isActive }` (อย่างน้อย 1 field; field อื่น เช่น password ถูกปฏิเสธด้วย `400`)

| Status | Body | เงื่อนไข |
| --- | --- | --- |
| 200 | user object | สำเร็จ — ถ้า `isActive` เปลี่ยนเป็น false ลบ session ทั้งหมดของ user นั้น |
| 400 | `VALIDATION_ERROR` + `field` | ค่าไม่ถูกต้อง / ไม่มี field ให้แก้ |
| 404 | `NOT_FOUND` | ไม่มี user |
| 409 | `DUPLICATE_EMAIL` | email ซ้ำ |
| 409 | `SELF_MODIFICATION` | แก้ `isActive` หรือ `role` ของตัวเอง |
| 409 | `LAST_ADMIN` | ทำให้ไม่เหลือ ADMIN ที่ active |

### `POST /api/admin/users/:id/initial-password`

Request: `{ "initialPassword": "…" }`

`200` user object (`mustChangePassword: true`, session ทั้งหมดของ user ถูกลบ) · `400 WEAK_PASSWORD` · `404`

## Removed in Lab 3

- `GET /api/requesters` — ลบแล้ว (BR-42) ได้ `404`
- พารามิเตอร์ `requesterId` ของทุก endpoint — ถูกเพิกเฉย (BR-03)

## Summary of HTTP Statuses Used

| Status | ใช้ที่ |
| --- | --- |
| 200 | อ่านข้อมูล, update สำเร็จ, login |
| 201 | สร้าง Ticket / Attachment / Comment / Note / User |
| 204 | logout |
| 400 | validation, query parameter ผิด, ไฟล์ผิดประเภท/ใหญ่เกิน, รหัสปัจจุบันผิด |
| 401 | ไม่ได้ login, credential ผิด |
| 403 | role ไม่มีสิทธิ์, ต้องเปลี่ยนรหัสก่อน, บัญชี inactive ตอน login |
| 404 | ไม่มี resource / ของ Requester คนอื่น |
| 409 | transition ผิด, Ticket terminal, email ซ้ำ, แก้ตัวเอง, admin คนสุดท้าย, attachment ถูกลบแล้ว, กด resolved ซ้ำ |
| 500 | error ที่ไม่คาดคิด |
| 503 | ฐานข้อมูลล่ม (endpoint อ้างอิง) |
