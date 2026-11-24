# Security Policy

## Supported Versions

Only the latest released version of a7sbly (احسبلي) receives security fixes.

| Version | Supported |
| ------- | --------- |
| 20.10.2-ar.x  | ✅ |
| < 20.10.2-ar  | ❌ |

## Reporting a Vulnerability

Please **do not open a public issue** for security problems.

- Report privately via GitHub: *Security → Report a vulnerability* on this repository,
  or by email to **hondastore299@gmail.com** with the subject `a7sbly security`.
- Include: what you found, steps to reproduce, and the affected version/URL.
- You can expect an acknowledgement within **72 hours** and a status update at least every **7 days**.
- If the report is accepted we will fix it, release an update, and credit you (if you wish).
  If it is declined we will explain why.

## Security model (summary)

- Authentication: Firebase Auth. Admin/super-admin roles are enforced in `firestore.rules`
  (verified email required for super admin; new accounts can only be created as `free`).
- Private data lives under `users/{uid}/...` and is readable/writable only by its owner.
  Transaction documents are additionally shape-validated server-side.
- Client portals use isolated `client_portals/{randomId}` documents (unguessable id, `get` only, no listing).
  Anonymous visitors can only create validated requests under the owner's `requests` collection.
- Inline event handlers never interpolate raw user data: values are encoded with `jsAttr()`
  (JS `\uXXXX` escapes) and receipt images are restricted to HTTPS by `safeReceiptURL()`.
- Cloud sync will not delete cloud documents when the local list is empty/partial; an explicit
  user wipe is required to remove all documents.
- Third-party scripts are version-pinned and Subresource Integrity hashes are included on all
  versioned CDN files except Google Fonts (its CSS varies by user agent).
- `storage.rules` restricts receipt uploads to their owner; `database.rules.json` denies all
  Realtime Database access because the app does not use RTDB.
