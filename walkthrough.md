# Security Summary

**Reviewed Files**: 42
**Issues Resolved**: 7

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Cross-Vendor WebSocket Broadcasts | `server.ts` | 125, 421, 809, 876 | Real-time WebSocket broadcasts sent full payloads (including vendor closings, device approvals, and incident updates) to every connected vendor session. | High | Fixed | Added role- and target-aware filtering in `broadcastEvent()`: owner sessions receive full operational payloads, while vendor sessions receive only targeted authorization/closing notifications without raw payload figures. |
| Missing Device Registration & Approval Gate | `server.ts` | 350, 1610, 1665, 2175 | Android devices could not register for owner approval, `/api/sync/folios/reserve` was missing, and `GET /api/sync/pull` / `POST /api/sync/push` needed strict per-device `active` verification. | High | Fixed | Added `POST /api/devices/register` (defaulting new devices to `active: false` and rejecting `403` on cross-vendor device ID takeover) and enforced active device approval on `/api/sync/folios/reserve`, `/api/sync/pull`, and `/api/sync/push`. |
| Excel Spreadsheet Row & Key Hardening | `src/views/ExcelView.tsx` | 85 | Imported spreadsheet rows were converted into standard objects without a row count ceiling or prototype-key filtering (relevant to `xlsx@0.18.5` advisories reported by `bun audit`). | Medium | Fixed | Capped imports at 5,000 rows, kept formulas/HTML/styles disabled, and copied cells into null-prototype objects skipping `__proto__`, `constructor`, and `prototype` keys (`xlsx` stays `0.18.5` as SheetJS ceased npm releases; mitigate by accepting spreadsheets only from authenticated owners). |
| Revoked Account Enforcement | `server.ts` | 93, 2181 | A previously issued session token remained usable on `/ws` and `GET /api/sync/pull` even after the owner blocked a vendor account. | Medium | Fixed | Added active-account checks against the user store on WebSocket handshake (`4003`) and `GET /api/sync/pull` (`403`), matching `/api/auth/me` and `/api/sync/push`. |
| Unbounded Sync Payloads | `server.ts` | 1693 | `POST /api/sync/push` iterated over unbounded incoming arrays and skipped deliveries referencing a merged duplicate customer ID. | Low | Fixed | Capped incoming sync arrays per batch (500 deliveries/payments, 200 losses/incidents) and resolved merged customer IDs safely with cycle protection. |
| Alert ID Sanitization | `server.ts` | 1016 | `POST /api/monitoring/alerts/:id/ack` stored the raw URL parameter in `acknowledgedAlertIds`. | Low | Fixed | Applied `sanitizePlainText(..., 120)` and rejected empty IDs with HTTP 400. |
| SQLite Path Confinement | `server/store.ts` | 62 | `resolveDefaultDbPath()` allowed `SQLITE_DB_PATH` resolving to the workspace root directory itself alongside child paths. | Low | Fixed | Restricted `SQLITE_DB_PATH` strictly to `:memory:` or files inside the application directory (`resolved.startsWith(process.cwd() + path.sep)`), falling back to `data/directodegranja.db` otherwise. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Primary SQLite Storage | `server/store.ts` | Uses prepared, parameterized SQL statements (`?`) for every query/insert, atomic `sqlite.transaction(...)` commits, `WAL` journaling, `PRAGMA foreign_keys = ON`, and allowlisted column migrations. |
| Server-Side Sync Totals & Folio Integrity | `server.ts`, `shared/domain.ts` | Android sync payloads (`POST /api/sync/push`) recompute total grams, millicentavos, official `<50 / =50 / >50` rounding, and sugar subtotals server-side, force the vendor's assigned `folioSeries`, and reject duplicate folios. |
| Android Session & Network Hardening | `WindowsApiClient.kt`, `DirectoSessionStore.kt`, `HyhRepository.kt` | Stores JWT tokens encrypted with Android Keystore `AES/GCM/NoPadding`, restricts server URLs to `http`/`https` without embedded credentials or queries, and guards ZIP restore paths against directory traversal (`canonicalPath`) with a 25 MB limit. |
| Multi-Item Bodega Sales & Tare | `server.ts`, `shared/domain.ts` | Recomputes all subtotals, sugar sack weights, 2 kg / 1 kg carton tare deductions, and aggregated per-brand stock checks on the server before committing; rejects split-brand oversells and invalid gross weights `<= tare`. |
| .NET 8 SQLite Services | `dotnet-solution/src/Services/*/Program.cs` | Configured EF Core `UseSqlite` as the primary provider with parameterized LINQ queries and database connectivity health checks. |
| Authentication & Passwords | `server/security.ts` | Passwords use `bcryptjs` (cost 12); sessions use HS256 JWTs with issuer/audience checks and strict `requireAuth`/`requireRole('dueno')` middleware. |
| Sensitive Field Encryption | `server/security.ts` | Authenticated `AES-256-GCM` encryption with 12-byte random IVs and auth tag verification protects sensitive values and detects tampering. |
| Profile Image Validation | `server/security.ts` | `sanitizeProfileImageDataUrl` strictly permits base64 raster `png`/`jpeg`/`webp` up to ~1.2 MB and blocks `image/svg+xml`, `javascript:`, and malformed URIs. |
| Excel Import & Export | `shared/domain.ts`, `src/views/ExcelView.tsx` | Imports enforce a 5 MB file limit, 5,000-row cap, prototype-key filtering, disable formulas/HTML/styles, and sanitize cells; exports escape leading `=`, `+`, `-`, `@` to prevent formula execution. |

## PoC Verification

### Cross-Vendor Device Takeover & Unapproved Sync Blocking

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Device Ownership & Approval Enforcement |
| Impact | High |
| Affected File | `server.ts:350`, `server.ts:1610`, `server.ts:1665`, `server.ts:2175` |
| Test Scenario | Vendor A registers `dev-android-redteam-1`; Vendor A attempts `/api/sync/folios/reserve`, `/api/sync/pull`, and `/api/sync/push` before owner approval, and Vendor B attempts to re-register the same `deviceId` or call `/api/devices/:id/authorize`. |

#### How It Was Fixed
New devices are created with `active: false`, existing device IDs verify `existing.userId === req.user.sub`, device approval requires `requireRole('dueno')`, and all three Android sync endpoints enforce `device.active === true`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Vendor A submits `POST /api/devices/register` (`server.ts:350`). | Device created with `active: false` (HTTP `201`). |
| 2 | Vendor A calls `/api/sync/folios/reserve`, `/api/sync/pull`, `/api/sync/push` prior to approval. | `device.active` check fails and returns HTTP `403`. |
| 3 | Vendor B calls `POST /api/devices/register` with Vendor A's `deviceId` or `POST /api/devices/:id/authorize`. | Fails ownership check (`403`) and `requireRole('dueno')` (`403`). **Handled Safely** |

#### Conclusion
**Fix Verified** - Verified live against `http://127.0.0.1:3000`: only the owning vendor's owner-approved device can pull catalogs, reserve folios, or push deliveries.

### Cross-Vendor WebSocket Broadcast Isolation

#### Summary
| Field | Value |
|---|---|
| Issue Type | Cross-User Operational Data Leakage over WebSocket |
| Impact | High |
| Affected File | `server.ts:125`, `server.ts:421`, `server.ts:876` |
| Test Scenario | Owner authorizes Vendor A's device (`POST /api/devices/:id/authorize`) and closes Vendor A's daily cash (`POST /api/closings`) while both Vendor A and Vendor B maintain open `/ws` connections. |

#### How It Was Fixed
`broadcastEvent()` now accepts a `targetUserId` and suppresses `closing:created`, `incident:updated`, `vendor:updated`, `device:authorized`, and `alert:acknowledged` for unrelated vendor sockets, while stripping raw financial payloads from vendor-bound refresh notifications.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Owner triggers `POST /api/devices/dev-android-redteam-1/authorize` (`server.ts:421`) and `POST /api/closings` (`server.ts:876`). | `broadcastEvent` receives `targetUserId = vendorA.id`. |
| 2 | WebSocket dispatcher evaluates role and `c.userId === targetUserId` (`server.ts:144`). | Sends `vendorSafeMsg` (without `payload`) only to Vendor A and full `ownerMsg` to owner. |
| 3 | Vendor B's WebSocket event log is inspected. | Zero `device:authorized` or `closing:created` frames received by Vendor B. **Handled Safely** |

#### Conclusion
**Fix Verified** - Verified live with concurrent WebSocket connections: vendors never receive another vendor's closing totals or device authorization events.

### Blocked Vendor Token Rejection on Sync & WebSocket

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Active-Status Check for Revoked Sessions |
| Impact | Medium |
| Affected File | `server.ts:93` and `server.ts:2181` |
| Test Scenario | A vendor obtains a valid JWT while active, is subsequently blocked by the owner (`POST /api/vendors/:id/block`), and attempts `GET /api/sync/pull` with that unexpired JWT. |

#### How It Was Fixed
Both the WebSocket upgrade handler and `GET /api/sync/pull` look up the account's current status in the store before serving customer data or subscribing to live updates.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request with unexpired vendor JWT reaches `GET /api/sync/pull` (`server.ts:2175`). | `requireAuth` validates JWT signature. |
| 2 | Server loads user record and evaluates `user.status !== 'activa'` (`server.ts:2181`). | Detects `status === 'bloqueada'`. |
| 3 | Route immediately returns HTTP `403` without querying or returning customer lists (`server.ts:2182`). | **Handled Safely** |

#### Conclusion
**Fix Verified** - Blocking a vendor account immediately revokes real-time WebSocket subscriptions and sync data access without waiting for token expiry.

### SQLite Parameterized Queries & Path Confinement

#### Summary
| Field | Value |
|---|---|
| Issue Type | SQL Injection & Database Path Traversal |
| Impact | High |
| Affected File | `server/store.ts:62` and `server/store.ts:880` |
| Test Scenario | Creating a customer named `"Sr. Pablo'; DROP TABLE users; --"` and setting `SQLITE_DB_PATH=../../etc/passwd` or `.`. |

#### How It Was Fixed
All database reads and writes use `better-sqlite3` prepared statements with positional `?` bindings inside transactions, and `resolveDefaultDbPath()` confines custom paths strictly inside the workspace root directory.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `SQLITE_DB_PATH=../../etc/passwd` or `.` enters `resolveDefaultDbPath()` (`server/store.ts:62`). | Fails `resolved.startsWith(process.cwd() + path.sep)` check (`server/store.ts:67`) and defaults to `data/directodegranja.db`. |
| 2 | Customer name `"Sr. Pablo'; DROP TABLE users; --"` is persisted via `insCust.run(...)`. | Bound as literal SQL parameter rather than SQL syntax. |
| 3 | Database is reopened from disk (`tests/domain-and-security.test.ts:374`). | `users` table remains intact and customer name is retrieved verbatim. **Handled Safely** |

#### Conclusion
**Fix Verified** - SQLite storage confines database file paths to the application directory and safely parameterizes all persisted records.
