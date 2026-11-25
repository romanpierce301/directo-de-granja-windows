# Security Summary

**Reviewed Files**: 33
**Issues Resolved**: 4

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Revoked Account Enforcement | `server.ts` | 93, 1484 | A previously issued session token remained usable on `/ws` and `GET /api/sync/pull` even after the owner blocked a vendor account. | Medium | Fixed | Added active-account checks against the user store on WebSocket handshake (`4003`) and `GET /api/sync/pull` (`403`), matching `/api/auth/me` and `/api/sync/push`. |
| Unbounded Sync Payloads | `server.ts` | 1261 | `POST /api/sync/push` iterated over unbounded incoming arrays and skipped deliveries referencing a merged duplicate customer ID. | Low | Fixed | Capped incoming sync arrays per batch (500 deliveries/payments, 200 losses/incidents) and resolved merged customer IDs safely with cycle protection. |
| Alert ID Sanitization | `server.ts` | 917 | `POST /api/monitoring/alerts/:id/ack` stored the raw URL parameter in `acknowledgedAlertIds`. | Low | Fixed | Applied `sanitizePlainText(..., 120)` and rejected empty IDs with HTTP 400. |
| SQLite Path Confinement | `server/store.ts` | 61 | `resolveDefaultDbPath()` allowed `SQLITE_DB_PATH` resolving to the workspace root directory itself alongside child paths. | Low | Fixed | Restricted `SQLITE_DB_PATH` strictly to `:memory:` or files inside the application directory (`resolved.startsWith(process.cwd() + path.sep)`), falling back to `data/directodegranja.db` otherwise. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Primary SQLite Storage | `server/store.ts` | Uses prepared, parameterized SQL statements (`?`) for every query/insert, atomic `sqlite.transaction(...)` commits, `WAL` journaling, `PRAGMA foreign_keys = ON`, and allowlisted column migrations. |
| Multi-Item Bodega Sales & Tare | `server.ts`, `shared/domain.ts` | Recomputes all subtotals, sugar sack weights, 2 kg / 1 kg carton tare deductions, and aggregated per-brand stock checks on the server before committing; rejects split-brand oversells and invalid gross weights `<= tare`. |
| .NET 8 SQLite Services | `dotnet-solution/src/Services/*/Program.cs` | Configured EF Core `UseSqlite` as the primary provider with parameterized LINQ queries and database connectivity health checks. |
| Authentication & Passwords | `server/security.ts` | Passwords use `bcryptjs` (cost 12); sessions use HS256 JWTs with issuer/audience checks and strict `requireAuth`/`requireRole('dueno')` middleware. |
| Sensitive Field Encryption | `server/security.ts` | Authenticated `AES-256-GCM` encryption with 12-byte random IVs and auth tag verification protects sensitive values and detects tampering. |
| Profile Image Validation | `server/security.ts` | `sanitizeProfileImageDataUrl` strictly permits base64 raster `png`/`jpeg`/`webp` up to ~1.2 MB and blocks `image/svg+xml`, `javascript:`, and malformed URIs. |
| Excel Import & Export | `shared/domain.ts`, `src/views/ExcelView.tsx` | Imports enforce a 5 MB file limit, disable formulas/HTML/styles during parsing, and sanitize cells; exports escape leading `=`, `+`, `-`, `@` to prevent formula execution. |

## PoC Verification

### Blocked Vendor Token Rejection on Sync & WebSocket

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Active-Status Check for Revoked Sessions |
| Impact | Medium |
| Affected File | `server.ts:93` and `server.ts:1484` |
| Test Scenario | A vendor obtains a valid JWT while active, is subsequently blocked by the owner (`POST /api/vendors/:id/block`), and attempts `GET /api/sync/pull` with that unexpired JWT. |

#### How It Was Fixed
Both the WebSocket upgrade handler and `GET /api/sync/pull` now look up the account's current status in the store before serving customer data or subscribing to live updates.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request with unexpired vendor JWT reaches `GET /api/sync/pull` (`server.ts:1482`). | `requireAuth` validates JWT signature. |
| 2 | Server loads user record and evaluates `user.status !== 'activa'` (`server.ts:1484`). | Detects `status === 'bloqueada'`. |
| 3 | Route immediately returns HTTP `403` without querying or returning customer lists (`server.ts:1485`). | **Handled Safely** |

#### Conclusion
**Fix Verified** - Blocking a vendor account immediately revokes real-time WebSocket subscriptions and sync data access without waiting for token expiry.

### SQLite Parameterized Queries & Path Confinement

#### Summary
| Field | Value |
|---|---|
| Issue Type | SQL Injection & Database Path Traversal |
| Impact | High |
| Affected File | `server/store.ts:61` and `server/store.ts:876` |
| Test Scenario | Creating a customer named `"Sr. Pablo'; DROP TABLE users; --"` and setting `SQLITE_DB_PATH=../../etc/passwd` or `.`. |

#### How It Was Fixed
All database reads and writes use `better-sqlite3` prepared statements with positional `?` bindings inside transactions, and `resolveDefaultDbPath()` confines custom paths strictly inside the workspace root directory.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `SQLITE_DB_PATH=../../etc/passwd` or `.` enters `resolveDefaultDbPath()` (`server/store.ts:61`). | Fails `resolved.startsWith(process.cwd() + path.sep)` check (`server/store.ts:66`) and defaults to `data/directodegranja.db`. |
| 2 | Customer name `"Sr. Pablo'; DROP TABLE users; --"` is persisted via `insCust.run(...)` (`server/store.ts:881`). | Bound as literal SQL parameter rather than SQL syntax. |
| 3 | Database is reopened from disk (`tests/domain-and-security.test.ts:371`). | `users` table remains intact and customer name is retrieved verbatim. **Handled Safely** |

#### Conclusion
**Fix Verified** - SQLite storage confines database file paths to the application directory and safely parameterizes all persisted records.
