# Lab 2 REST API Contract

ทุก endpoint ที่มี `requesterId` ต้องเช็ค ownership ตาม BR-06/BR-07 ก่อนคืนข้อมูลเสมอ — ownership
failure = `404` เสมอ ไม่ใช่ `403` (ตาม D-05 ใน `specification.md`)

## Reference Data

### `GET /api/categories`

- **Response 200:** `[{ "id": 1, "name": "Account and Access" }, ...]`
- ไม่มี ownership check (ข้อมูลกลาง ไม่ผูก requester)

### `GET /api/related-systems`

- **Response 200:** `[{ "id": 1, "name": "Email" }, ...]`
- ไม่มี ownership check

### `GET /api/requesters`

- คืนเฉพาะ `isActive: true` (BR-05)
- **Response 200:** `[{ "id": 1, "name": "...", "email": "..." }, ...]` เรียงตามชื่อ

## Ticket

### `POST /api/tickets`

**Request body:**
```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 3,
  "summary": "Laptop battery drains quickly",
  "description": "...",
  "requestedPriority": "MEDIUM"
}
```

**Validation (BR-08, BR-09):**
- `summary`: required หลัง trim, ยาว 10–150 ตัวอักษร
- `description`: required หลัง trim, ยาว 10–2000 ตัวอักษร
- `requestedPriority`: ต้องเป็น `LOW` | `MEDIUM` | `HIGH`
- `requesterId`: ต้องมีอยู่จริงและ `isActive = true`
- `categoryId`, `relatedSystemId`: ต้องมีอยู่จริง

| Status | เมื่อไหร่ |
| --- | --- |
| `201` | สร้างสำเร็จ — คืน ticket เต็ม พร้อม `ticketNumber` ที่ generate แล้ว |
| `400` | validation ไม่ผ่าน (field ไหนผิดบอกใน response) |
| `404` | `requesterId`/`categoryId`/`relatedSystemId` ไม่มีอยู่จริง |
| `500` | unexpected error — ไม่ leak stack trace ให้ client |

**Response 201:**
```json
{
  "id": 42, "ticketNumber": "TKT-2026-000042", "requesterId": 1, "categoryId": 2,
  "relatedSystemId": 3, "summary": "...", "description": "...",
  "requestedPriority": "MEDIUM", "currentStatus": "NEW", "createdAt": "2026-08-19T10:00:00Z"
}
```

### `GET /api/tickets`

**Query parameters:**

| Param | Default | หมายเหตุ |
| --- | --- | --- |
| `requesterId` | *(required)* | BR-06 — ทุก query ต้องกรองด้วยค่านี้ |
| `search` | `""` | match `summary` หรือ `ticketNumber` แบบ case-insensitive contains |
| `categoryId` | *(ไม่กรอง)* | filter ตาม category |
| `priority` | *(ไม่กรอง)* | filter ตาม `requestedPriority` |
| `sort` | `createdAt:desc` | ค่าที่รับ: `createdAt:asc\|desc`, `summary:asc\|desc` — secondary sort เป็น `id:desc` เสมอ (BR-18) |
| `page` | `1` | เริ่มที่ 1 |
| `pageSize` | `10` | max `50` — เกินให้ปัดเหลือ 50 ไม่ error (BR-17) |

**Response 200:**
```json
{
  "items": [ { "id": 42, "ticketNumber": "TKT-2026-000042", "...": "..." } ],
  "page": 1, "pageSize": 10, "total": 37
}
```

| Status | เมื่อไหร่ |
| --- | --- |
| `200` | สำเร็จ (แม้ `items` จะว่างเปล่าก็ตอบ 200 ไม่ใช่ 404 — ว่างเปล่าไม่ใช่ error) |
| `400` | `page`/`sort` เป็นค่าที่ parse ไม่ได้ (เช่น `page=abc`) |

### `GET /api/tickets/:id`

**Query parameter:** `requesterId` (required)

| Status | เมื่อไหร่ |
| --- | --- |
| `200` | ticket มีอยู่จริงและ `ticket.requesterId === requesterId` |
| `404` | ticket ไม่มีอยู่จริง **หรือ** เป็นของ requester คนอื่น (BR-07 — ตอบเหมือนกันทั้งสองกรณี ไม่แยก) |

**Response 200:** ticket เต็ม + `attachments: [...]` (metadata, ไม่รวมไฟล์จริง)

## Attachment

### `POST /api/tickets/:id/attachments`

**Content-Type:** `multipart/form-data`, field `file` + query `requesterId`

**Validation (BR-12):**
- ประเภทไฟล์: `image/jpeg`, `image/png`, `image/webp`, `application/pdf` เท่านั้น
- ขนาด: ≤ 5 MB
- จำนวน active attachment ของ ticket นี้ต้อง < 5 ก่อน upload

| Status | เมื่อไหร่ |
| --- | --- |
| `201` | อัปโหลดสำเร็จ — คืน attachment metadata |
| `400` | ประเภทไฟล์ผิด, ขนาดเกิน, หรือ active attachment ครบ 5 แล้ว (ระบุเหตุผลใน response) |
| `404` | ticket ไม่มีอยู่จริงหรือไม่ใช่ของ requester นี้ |

**Response 201:**
```json
{ "id": 7, "ticketId": 42, "filename": "photo.jpg", "mimeType": "image/jpeg",
  "sizeBytes": 204800, "isRemoved": false, "createdAt": "..." }
```

### `GET /api/attachments/:id`

**Query:** `requesterId`

| Status | เมื่อไหร่ |
| --- | --- |
| `200` | คืน metadata (ไม่ว่าจะ `isRemoved` หรือไม่ — metadata ยังเห็นได้เสมอตาม BR-15) |
| `404` | attachment ไม่มีอยู่จริง หรือ ticket ที่มันผูกอยู่ไม่ใช่ของ requester นี้ |

### `GET /api/attachments/:id/download`

**Query:** `requesterId`

| Status | เมื่อไหร่ |
| --- | --- |
| `200` | ไฟล์จริง (binary stream) — เฉพาะตอน `isRemoved = false` เท่านั้น |
| `404` | `isRemoved = true` (BR-15), หรือ attachment/ticket ไม่ใช่ของ requester นี้ (BR-07) |

### `POST /api/attachments/:id/remove`

**Request body:**
```json
{ "requesterId": 1, "reason": "Uploaded the wrong file" }
```

**Validation:**
- `reason`: required หลัง trim, อย่างน้อย 5 ตัวอักษร
- ต้องไม่ remove ไฟล์ที่ `isRemoved = true` อยู่แล้วซ้ำ (idempotent guard — คืน `409` ถ้าซ้ำ)

| Status | เมื่อไหร่ |
| --- | --- |
| `200` | soft-remove สำเร็จ — คืน attachment ที่ `isRemoved = true` แล้ว |
| `400` | ไม่มี `reason` หรือสั้นเกินไป |
| `404` | attachment/ticket ไม่ใช่ของ requester นี้ |
| `409` | attachment ถูก remove ไปแล้วก่อนหน้า |

## Error Response Shape (ใช้ร่วมกันทุก endpoint)

```json
{ "error": "human-readable message", "field": "summary" }
```

`field` มีเฉพาะตอน validation error ระบุ field เดียวได้ชัดเจน — endpoint อื่นส่งแค่ `error`

## Summary of HTTP Statuses Used

| Status | ความหมายในระบบนี้ |
| --- | --- |
| `200` | สำเร็จ (GET) |
| `201` | สร้างสำเร็จ (POST ที่สร้างทรัพยากรใหม่) |
| `400` | validation ผิด (client ส่งข้อมูลผิด) |
| `404` | ไม่พบทรัพยากร **หรือ** ownership ไม่ตรง (จงใจให้เหมือนกันตาม D-05) |
| `409` | conflict — พยายามทำ action ที่ทำไปแล้ว (เช่น remove ซ้ำ) |
| `500` | server error ที่ไม่คาดคิด — ไม่ leak รายละเอียดภายใน |
