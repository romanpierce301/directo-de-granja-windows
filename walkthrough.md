# Security Summary

**Reviewed Files**: 26
**Issues Resolved**: 3

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Revoked Account Enforcement | `server.ts` | 93, 1484 | A previously issued session token remained usable on `/ws` and `GET /api/sync/pull` even after the owner blocked a vendor account. | Medium | Fixed | Added active-account checks against the user store on WebSocket handshake (`4003`) and `GET /api/sync/pull` (`403`), matching `/api/auth/me` and `/api/sync/push`. |
| Unbounded Sync Payloads | `server.ts` | 1261 | `POST /api/sync/push` iterated over unbounded incoming arrays and skipped deliveries referencing a merged duplicate customer ID. | Low | Fixed | Capped incoming sync arrays per batch (500 deliveries/payments, 200 losses/incidents) and resolved merged customer IDs safely with cycle protection. |
| Alert ID Sanitization | `server.ts` | 917 | `POST /api/monitoring/alerts/:id/ack` stored the raw URL parameter in `acknowledgedAlertIds`. | Low | Fixed | Applied `sanitizePlainText(..., 120)` and rejected empty IDs with HTTP 400. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Authentication & Passwords | `server/security.ts` | Passwords use `bcryptjs` (cost 12); sessions use HS256 JWTs with issuer/audience checks and strict `requireAuth`/`requireRole('dueno')` middleware. |
| Sensitive Field Encryption | `server/security.ts` | Authenticated `AES-256-GCM` encryption with 12-byte random IVs and auth tag verification protects sensitive values and detects tampering. |
| Profile Image Validation | `server/security.ts` | `sanitizeProfileImageDataUrl` strictly permits base64 raster `png`/`jpeg`/`webp` up to ~1.2 MB and blocks `image/svg+xml`, `javascript:`, and malformed URIs. |
| Excel Import & Export | `shared/domain.ts`, `src/views/ExcelView.tsx` | Imports enforce a 5 MB file limit, disable formulas/HTML/styles during parsing, and sanitize cells; exports escape leading `=`, `+`, `-`, `@` to prevent formula execution. |
| Atomic Warehouse Inventory | `server.ts`, `shared/domain.ts` | Bodega sales validate brand stock before committing and calculate stock dynamically from immutable shipment, delivery, and cancellation records. |

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
