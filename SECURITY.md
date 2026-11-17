# Security Policy

## Supported Versions

Only the latest released version of a7sbley (احسبلي) receives security fixes.

| Version | Supported |
| ------- | --------- |
| 11.5.x  | ✅ |
| < 11.5  | ❌ |

## Reporting a Vulnerability

Please **do not open a public issue** for security problems.

- Report privately via GitHub: *Security → Report a vulnerability* on this repository,
  or by email to **hondastore299@gmail.com** with the subject `a7sbley security`.
- Include: what you found, steps to reproduce, and the affected version/URL.
- You can expect an acknowledgement within **72 hours** and a status update at least every **7 days**.
- If the report is accepted we will fix it, release an update, and credit you (if you wish).
  If it is declined we will explain why.

## Security model (summary)

- Authentication: Firebase Auth. Admin/super-admin roles are enforced in `firestore.rules`
  (verified email required for super admin; new accounts can only be created as `free`).
- Private data lives under `users/{uid}/...` and is readable/writable only by its owner.
- Client portals use isolated `client_portals/{randomId}` documents (unguessable id, `get` only, no listing).
  Anonymous visitors can only create validated requests under the owner's `requests` collection.
- Third-party scripts are version-pinned and use Subresource Integrity where the host allows it.
