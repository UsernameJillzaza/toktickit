# Lab 3 Zen Green UI Specification

ต่อยอดจาก `docs/lab-02/ui-spec.md` — color token, typography, field state, button hierarchy, responsive breakpoint และกติกา accessibility ของ Lab 2 **ยังใช้ทั้งหมด** ไม่สร้างระบบภาพใหม่ ไฟล์นี้กำหนดเฉพาะส่วนที่ Lab 3 เพิ่ม

## 1. Tokens ที่ใช้ต่อ (จาก Lab 2)

| Token | Hex | Bootstrap variable ที่ override (`client/src/index.css`) |
| --- | --- | --- |
| Primary green | `#006B3C` | `--bs-success` |
| Secondary green | `#0B7A46` | `--bs-link-color` |
| Pale green | `#EAF6EF` | — (ใช้ใน badge / active nav) |
| Page background | `#F5F7F6` | `body` |
| Error | `#B3261E` | `--bs-danger` |
| Warning (amber) | `#B45309` | `--bs-warning` |
| Read-only field | `#F0EFE8` | `.tt-readonly` |
| Internal note surface (ใหม่) | `#FFF7E6` พื้น + `#B45309` ขอบซ้าย 4px | `.tt-internal-note` |

## 2. Badges (component `client/src/components/Badges.tsx`)

ทุก badge มี **ข้อความ** เสมอ (ไม่พึ่งสี) และใช้ class `tt-badge tt-badge-<kind>-<VALUE>` เพื่อให้ UI style test ตรวจได้ ชุดสีเดียวกันทุกหน้าจอ

| Kind | ค่า → สไตล์ |
| --- | --- |
| Status | `NEW` pale green + ตัวอักษร primary · `OPEN` secondary green · `IN_PROGRESS` primary green · `WAITING_FOR_REQUESTER` amber · `RESOLVED` ขอบ primary green พื้นขาว · `CLOSED` เทาเข้ม `#4A5550` · `REOPENED` ขอบ amber พื้นขาว · `CANCELLED` เทา `#6B7470` |
| Priority (Requested / IT) | `LOW` เทา · `MEDIUM` secondary green · `HIGH` amber · `CRITICAL` error red |
| Role | `REQUESTER` pale green · `IT_STAFF` secondary green · `ADMIN` charcoal `#1F2E28` |

ข้อความที่แสดง: แปลง `WAITING_FOR_REQUESTER` → "Waiting for Requester", `IN_PROGRESS` → "In Progress", `IT_STAFF` → "IT Staff", `ADMIN` → "Administrator" ฯลฯ — ค่า enum ไม่โผล่ดิบบนจอ; badge priority มี prefix ("Req." / "IT") ตอนแสดงคู่กันในหน้าเดียว

Indicator พิเศษ: "Requester reports resolved" — badge ขอบ primary green + ไอคอน ✓ แสดงในคิวและหน้า detail ของ IT Staff เมื่อ `requesterResolvedAt` มีค่า

## 3. Application Shell

- ซ้าย: "TokTickIT" · กลาง: เมนูตาม role (FR-06) · ขวา: ชื่อผู้ใช้ + role badge, ลิงก์ "Change Password", ปุ่ม "Log out" (secondary)
- Requester: My Tickets, Create Ticket · IT Staff: Ticket Queue · Administrator: Ticket Queue, User Management
- ปลายทางที่ role ไม่มีสิทธิ์ **ไม่แสดงในเมนูเลย** (ไม่ใช่แค่ disable)
- active page: พื้น pale green + ตัวอักษร primary + `aria-current="page"`
- mobile <768px: hamburger เหมือน Lab 2 (`aria-label="Toggle navigation"`)
- หน้า Login / Change Password (บังคับ) ไม่แสดงเมนูนำทาง แสดงแค่ชื่อแอป

## 4. Login Screen (`/login`)

- Card กลางจอ max-width 420px: หัวข้อ "Sign in to TokTickIT", Email (`type=email`, `autocomplete=username`), Password (`type=password`, `autocomplete=current-password`), ปุ่ม primary "Sign in"
- **States:** initial · validation (ช่องว่าง → error ใต้ field, ไม่ยิง API) · busy (ปุ่ม "Signing in…" + disable ทั้งฟอร์ม) · invalid credentials (alert แดง "Invalid email or password.", คง email, ล้าง password, focus กลับไปที่ password) · inactive (alert amber ข้อความ inactive) · API failure (alert แดง "Unable to reach the server. Please try again.")
- ไม่มีลิงก์ "สมัครสมาชิก" หรือ "ลืมรหัสผ่าน" (excluded)

## 5. Change Password Screen (`/change-password`)

- โหมด **บังคับ** (หลัง login ด้วย initial password): หัวข้อ "Choose a new password" + คำอธิบาย "Your account uses an initial password. Choose a new one to continue."; ไม่มีเมนู, มีแค่ปุ่ม Log out
- โหมด **สมัครใจ** (จากเมนู): อยู่ใน shell ปกติ หัวข้อ "Change password" + ปุ่ม Cancel กลับหน้าเดิม
- Field: Current password, New password, Confirm new password — ทุกช่อง required + asterisk
- กล่อง policy แสดงตลอด: "8–72 characters · at least one letter · at least one number · not your email"
- Error ใต้ field: current ผิด (จาก API), policy ผิด (ตรวจทั้ง client และ server), confirm ไม่ตรง (client), ซ้ำรหัสเดิม (server)
- สำเร็จ: alert เขียว "Password updated" แล้วพาเข้าหน้าแรกตาม role

## 6. Forbidden / Not Found

- Forbidden: card "You don't have access to this page" + คำอธิบาย role ปัจจุบัน + ปุ่ม "Go to my home page"
- Not Found: card "Page not found" + ปุ่มเดียวกัน
- ไม่แสดงข้อมูลใด ๆ ของ resource ที่ถูกปฏิเสธ

## 7. Requester Ticket Detail (ต่อยอด Lab 2 §8)

- คง layout เดิมทั้งหมด (field read-only + attachments)
- เพิ่ม "Assigned to: <ชื่อ>" หรือ "Not yet assigned" ในกลุ่ม field บน
- **Problem Appears Resolved:** ปุ่ม secondary ใต้กลุ่ม field พร้อมคำอธิบาย "Let IT Staff know the problem seems fixed. IT Staff will confirm and resolve the ticket." — แสดงเฉพาะ status ที่อนุญาต (BR-25); หลังกดเปลี่ยนเป็นข้อความ "You reported this problem as resolved on <date>." (ไม่มีปุ่ม)
- **Public Comments** (section ใหม่ใต้ attachments): รายการเรียงเก่า→ใหม่, แต่ละรายการแสดงชื่อ + role badge + เวลา + เนื้อหา (pre-wrap); ฟอร์ม textarea "Add a public comment" + ตัวนับ "n / 2000" + ปุ่ม primary "Post comment"; Ticket terminal → ซ่อนฟอร์ม แสดง "This ticket is closed. New comments are disabled."
- ไม่มี UI ใด ๆ ของ Internal Notes, IT Priority, การเปลี่ยน status

## 8. IT Staff Ticket Queue (`/staff/queue`)

- **แถบเครื่องมือ** (desktop แถวเดียว / mobile stack): search box, quick filter (segmented): All open · My tickets · Unassigned, dropdown Status (Active / All / แต่ละ status), IT Priority, Category, Sort (Newest, Oldest, Recently updated, IT Priority high→low, Ticket number), ปุ่ม "Clear filters"
- **Desktop ≥992px — ตาราง 7 คอลัมน์:** Ticket (เลข + summary 2 บรรทัด, เป็นลิงก์เปิด detail) · Requester · Category · IT Priority (badge) · Status (badge + indicator resolved ถ้ามี) · Owner ("Unassigned" ตัวเอียงถ้าไม่มี) · Last Updated (relative + title เป็นเวลาเต็ม)
  - เหตุผลที่ตัด Created Date / Requested Priority ออกจากตาราง: ดูได้ในหน้า detail, ใส่ครบทุก field จะเป็น mega-grid ที่ labsheet เตือนไว้; Created Date ยังใช้เรียงได้
- **Tablet / Mobile <992px — การ์ด:** บรรทัด 1 เลข Ticket + status badge, บรรทัด 2 summary, บรรทัด 3 Requester · Owner, บรรทัด 4 IT Priority badge + Last Updated
- Pagination: Previous / "Page n of m" / Next + จำนวนรวม "23 tickets"
- **States:** loading (`role=status`) · empty ("No tickets in the queue yet.") · no-results ("No tickets match these filters." + Clear filters) · failure (alert แดง + ปุ่ม Retry) · forbidden (ได้ 403 → หน้า Forbidden)

## 9. IT Staff Ticket Detail (`/staff/tickets/:id`)

- **Desktop ≥992px สองคอลัมน์ (8/4):**
  - ซ้าย: กลุ่ม Ticket info (read-only: Ticket Number, Created, Requester ชื่อ + email, Category, Related System, Requested Priority badge, Summary, Description) → Attachments (ดาวน์โหลดได้, removed จาง + disabled, ไม่มีปุ่ม upload/remove) → **Public Comments**
  - ขวา: card "Operations": Owner (ข้อความปัจจุบัน + ปุ่ม "Claim" ถ้ายังไม่ใช่ตัวเอง + select "Assign to…" + ปุ่ม Save), IT Priority (select + Save), Status (badge ปัจจุบัน + select จาก `allowedTransitions` + Save) → card **Internal Notes**
- **Tablet / Mobile:** stack: Ticket info → Operations → Internal Notes → Attachments → Public Comments
- **แยก Public vs Internal ให้พลาดยาก:**
  - Public Comments: card ขาวปกติ หัวข้อ "Public comments — visible to the requester" ปุ่ม primary "Post public comment"
  - Internal Notes: พื้น `#FFF7E6` + ขอบซ้าย amber + ไอคอน 🔒 หัวข้อ "Internal notes — IT Staff and Administrators only" ปุ่มเป็น **ขอบ amber** "Add internal note" (คนละสไตล์กับปุ่ม public เพื่อไม่ให้กดผิด)
  - ฟอร์มทั้งสองอยู่คนละ card ไม่ใช้ textarea ร่วมกัน ไม่มี toggle สลับโหมด
- **Confirm (BR-24):** เลือก Resolved / Closed / Cancelled แล้วกด Save → dialog `role=alertdialog` "Change status to Resolved?" + คำอธิบายผลกระทบ + ปุ่ม "Confirm" / "Cancel" — Cancel แล้วไม่มี request
- Ticket terminal: Operations card แสดงค่าปัจจุบันแบบ read-only + ข้อความ "This ticket is closed — ownership, priority and status can no longer change."
- Feedback: ระหว่างบันทึกปุ่มเป็น busy; สำเร็จ toast เขียวเล็ก "Saved"; `409` แสดงข้อความจาก API ใต้ control นั้น และโหลดข้อมูลล่าสุดใหม่
- Requester reports resolved: แถบ pale green บนสุดของหน้า "The requester reported this problem as resolved on <date>."

## 10. User Management (`/admin/users`)

- หัวข้อ "User Management" + ปุ่ม primary "Create user"
- แถบ: search "Search name or email" + dropdown Role (All roles / Requester / IT Staff / Administrator)
- **Desktop ตาราง:** Name · Email · Role (badge) · Status ("Active" เขียว / "Inactive" เทา + ข้อความ, และป้าย "Must change password" amber ถ้ามี) · Edit (ปุ่ม secondary)
- **Mobile การ์ด:** Name + role badge, email, status, ปุ่ม Edit เต็มความกว้าง
- **Create / Edit form** (panel ใต้หัวตารางบน desktop, เต็มจอบน mobile — ไม่ใช้ modal เพื่อให้ keyboard และ screen reader ใช้ง่าย): Name, Email, Role (select), Active (checkbox/switch), Initial password (เฉพาะ create) — ปุ่ม primary "Create user" / "Save changes", secondary "Cancel"
- **Set initial password** (เฉพาะ edit): card แยกด้านล่างฟอร์ม "Set a new initial password" + field + ปุ่ม amber "Set initial password" + คำอธิบาย "The user will be signed out and must choose a new password at next sign-in."
- แก้บัญชีตัวเอง: switch Active และ select Role **disabled** พร้อมข้อความ "You can't deactivate or change the role of your own account." (backend ยังบังคับซ้ำ BR-36)
- **States:** loading, empty ("No users match."), failure, validation ใต้ field, `409` (email ซ้ำ / admin คนสุดท้าย) แสดงใต้ field ที่เกี่ยวข้องหรือ alert บนฟอร์ม, success toast

## 11. Responsive Rules

เหมือน Lab 2 §10 ทุกข้อ เพิ่มเติม:

- คิวและ User Management สลับตาราง → การ์ดที่ `<992px` ด้วย utility class (ไม่ใช้ตาราง scroll แนวนอน)
- Staff Ticket Detail สองคอลัมน์เฉพาะ `≥992px`
- ทุกปุ่มบน mobile สูงอย่างน้อย 44px (`btn` + `py-2`)

## 12. Accessibility

เหมือน Lab 2 §11 เพิ่มเติม:

- ทุก input มี `<label for>` ที่ตรงกัน, error เชื่อมด้วย `aria-describedby`, field ผิดมี `aria-invalid="true"`
- ข้อความ alert ใช้ `role="alert"`, loading ใช้ `role="status"`
- dialog ยืนยัน: `role="alertdialog"`, `aria-labelledby`, focus ไปที่ปุ่ม Cancel ก่อน (ค่าที่ปลอดภัย)
- badge และป้าย Internal มีข้อความเสมอ

## 13. Visual Inspection Checklist (ติ๊กตอน L3-9 จากของจริงเท่านั้น)

- [ ] สี token และ badge ตรงตารางข้อ 1–2 ทุกหน้าจอใหม่
- [ ] เมนูแต่ละ role แสดงเฉพาะปลายทางที่อนุญาต
- [ ] editable vs read-only แยกชัด (หน้า staff detail, user management)
- [ ] validation message อยู่ใต้ field ที่เกี่ยวข้อง
- [ ] Public Comment กับ Internal Note แยกกันทางสายตาชัด ไม่มีทางสับสน
- [ ] focus มองเห็นได้ทุก control (ทดสอบด้วย Tab)
- [ ] ไม่มี clipping / overlap / horizontal overflow ที่ desktop / tablet / mobile
- [ ] dialog ยืนยัน status แสดงถูกต้องและ Cancel ไม่ยิง request

## 14. Screenshot Paths (labsheet §12)

```
artifacts/lab-03/screenshots/
├── authentication/{login,login-invalid,login-inactive,change-password,shell-<role>}-{desktop,tablet,mobile}.png
├── staff-queue/{desktop,tablet,mobile}.png (+ filtered, empty, no-results)
├── staff-ticket-detail/{desktop,tablet,mobile}.png (+ confirm-dialog, terminal)
└── user-management/{desktop,tablet,mobile}.png (+ create, edit, last-admin-error)
```
