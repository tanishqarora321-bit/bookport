# Ship-Sphere | Security Testing & Release Acceptance Plan
**Version:** 1.0 | **Date:** 21 November 2026 | **Audience:** QA, engineering, independent security tester

**Status:** Testing plan only; no live penetration test or code audit has been performed.

## 1. Purpose, boundaries and rules of engagement

This is a tester-ready security acceptance plan for Ship-Sphere, a multi-company logistics SaaS handling bookings, parties, invoices, payments, documents, Excel imports, and Platform Admin. It is a risk-based checklist, not proof of security. The tester must obtain written authorization, a staging environment, seeded test tenants, and permission for each test type. Never attack third-party services or production data. Avoid destructive, load, or denial-of-service tests without a separately approved scope.
Scope inventory: web UI, backend APIs, background jobs, authentication, database, object storage, email/invitation links, Excel/PDF parsing, hosting, CI/CD, logs, backups, integrations. Record in-scope hosts, environments, test window, owners, and emergency contacts.
Test accounts: platform administrator; company A administrator, editor and read-only user; company B equivalents; unauthenticated user; suspended/invited user. Seed different bookings, forwarders, invoices, payments and attachments in both tenants.

## 2. Release-blocking acceptance gates (P0)

P0-01 Tenant isolation: every list, detail, update, export, upload, download, search and background job enforces server-side company ownership. Test ID changes, filters, bulk operations, attachment IDs, pagination, and nested records across A and B. Expected: deny access without revealing foreign data; record audit event.
P0-02 Platform Admin: company creation, company status, seat limits, company switching and admin invitations require server-side platform privileges. Changing client role flags or URLs must never grant privilege.
P0-03 Authentication and sessions: secure password reset and invitation tokens (single-use, short-lived), session rotation on login and privilege changes, revocation on logout/password change, safe cookie flags, MFA for privileged accounts.
P0-04 Financial integrity: cannot forge paid status, payment amount, currency, exchange rate, invoice totals, negative payments or duplicate payments by editing requests. Backend computes authoritative totals and validates idempotency. Audit every change.
P0-05 Uploads: malicious/oversized/corrupt Excel/PDF files rejected or quarantined; file types checked by content, not extension alone; private object storage; safe download headers; no cross-tenant document access.
P0-06 Secrets: no database credentials, API keys, signing secrets or private tokens in frontend bundles, logs, source history or public configuration. Rotate any exposed secrets.
P0-07 Critical vulnerabilities: zero known exploitable critical findings at release; any exception needs documented owner, compensating controls and explicit risk acceptance by leadership.

## 3. Authentication, account recovery and session testing

SEC-AUTH-01 Verify login throttling and monitoring for repeated failures; distinguish rate limiting from account lockout denial of service.
SEC-AUTH-02 Verify password reset does not reveal whether an email exists; token expires, cannot be replayed, and invalidates appropriately.
SEC-AUTH-03 Verify invite link cannot be reused, altered to assign a stronger role, or used for another tenant.
SEC-AUTH-04 Verify HttpOnly, Secure, SameSite cookies where cookie auth is used; protect state-changing actions against CSRF.
SEC-AUTH-05 Verify session is invalid after logout, password reset and account deactivation; test simultaneous sessions.
SEC-AUTH-06 Verify privileged accounts use MFA; test recovery flows and bypass paths.
SEC-AUTH-07 Verify no credentials or session tokens in URLs, browser storage where avoidable, analytics, errors or referrers.

## 4. Authorization and multi-tenant isolation

SEC-TEN-01 Change companyId, bookingId, forwarderId, invoiceId, paymentId, documentId and userId in authorized requests to another tenant’s IDs. Deny read and write.
SEC-TEN-02 Test bulk export, CSV, Excel, search autocomplete, analytics KPIs, file preview and dashboard aggregates for cross-tenant leaks.
SEC-TEN-03 Test nested resources: invoice attached to another company’s booking; payment allocated to foreign invoice; forwarder reassignment; linked trucking records.
SEC-TEN-04 Test role matrix for platform admin, tenant admin, editor, viewer, suspended and invited users, including direct API calls.
SEC-TEN-05 Test race conditions when tenant changes, roles change, invitations are accepted or seats are exhausted.
SEC-TEN-06 Ensure server derives tenant from verified membership, not solely a client-supplied company ID.
SEC-TEN-07 Verify audit logs and notifications do not include another tenant’s details.

## 5. API and browser security

SEC-API-01 Enumerate API routes and compare against authorization policy; test object-level and function-level access.
SEC-API-02 Validate schema, types, sizes, enum values, pagination bounds, date parsing, nulls and malformed JSON server-side.
SEC-API-03 Test SQL/ORM injection, stored/reflected/DOM XSS, unsafe Markdown/HTML rendering and CSV formula injection in exported sheets.
SEC-API-04 Test CSRF where browsers automatically attach credentials; validate CORS allowlists and preflight behavior.
SEC-API-05 Check HTTP security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors, and sensible Permissions-Policy.
SEC-API-06 Check error responses do not expose stack traces, connection strings, internal paths, PII or SQL.
SEC-API-07 Check mass assignment: clients cannot set internal role, tenant, owner, paidAmount, verified or isPlatformAdmin fields.
SEC-API-08 Check SSRF on URL-based imports, remote documents, webhook callbacks or preview features if present.
SEC-API-09 Test replay/idempotency and concurrency on payment creation, imports, status updates and invitations.
SEC-API-10 Confirm consistent authorization for WebSockets, server actions and background jobs if used.

## 6. Ship-Sphere workflow-specific tests

SEC-LOG-01 Booking edits and amendments: unauthorized roles cannot modify dates, cutoffs, statuses or related records. Amendment checks and audit history execute server-side.
SEC-LOG-02 Cancelled bookings: cannot silently progress or resend instructions contrary to workflow rules.
SEC-LOG-03 Excel import: enforce row/file limits, safe parser, required column mapping, duplicate handling, type validation, formula-injection protection, and rollback/partial-failure policy.
SEC-LOG-04 Custom columns: enforce 10-column limit on server, sanitize names, restrict type changes, and protect cross-tenant schema/data.
SEC-LOG-05 Forwarder payments: server validates amounts, currencies, year, invoice allocation, double submission, and reconciliation. Payment drawer must not expose hidden data.
SEC-LOG-06 Document upload/download: verify object ownership, MIME/content checks, malware scanning strategy, presigned URL expiry, and private storage.
SEC-LOG-07 Email sending: restrict templates, recipients and attachments; avoid unauthorized cross-tenant emails, sender spoofing and header injection.
SEC-LOG-08 Platform Admin: only platform roles may add companies, change company status or allocate seats. Tenant admins cannot enumerate all companies.
SEC-LOG-09 Exports and reports: verify company scope and permissions; protect against spreadsheet formula injection.
SEC-LOG-10 Status dropdowns and UI restrictions are not security controls: bypass UI and verify APIs still deny invalid transitions.

## 7. Infrastructure, dependencies and operations

SEC-OPS-01 Inventory production assets, domains, DNS, hosting, storage buckets, database, queues and third-party integrations.
SEC-OPS-02 Check TLS, security headers, public buckets, database network exposure, least-privilege service accounts and restrictive firewall rules.
SEC-OPS-03 Scan source, git history, deployment variables and build artifacts for secrets. Configure automated secret scanning.
SEC-OPS-04 Run SAST, dependency/SCA, container/image and infrastructure-as-code scanning in CI; triage findings with owners.
SEC-OPS-05 Verify environment isolation (dev/staging/prod), protected branches, reviewed changes, controlled deployments and rollback.
SEC-OPS-06 Validate encrypted backups, restoration tests, retention, disaster recovery targets and least-privilege access.
SEC-OPS-07 Verify structured audit logs for logins, permissions, company creation, payment changes, imports and downloads; logs are protected from alteration.
SEC-OPS-08 Validate alerting for unusual login failures, bulk downloads, privilege changes, suspicious imports and payment anomalies.
SEC-OPS-09 Verify incident response contacts, breach triage, credential rotation, session invalidation and customer notification procedures.
SEC-OPS-10 Review privacy/data retention and applicable legal obligations with qualified counsel; define deletion/export procedures.

## 8. Testing method and evidence

Use a risk-based combination of threat modeling, manual authorization tests, code review, automated scans, dependency review and authorized penetration testing. A passing scanner is not sufficient.
For each case capture: ID, route/feature, tenant and role, setup, safe steps, expected result, observed result, severity, evidence reference, affected commit/build, owner, remediation ticket, retest date and result. Redact tokens, passwords and personal data from screenshots.
Severity guidance: Critical = cross-tenant access, privilege escalation, remote code execution, exposed production secrets, or financial tampering. High = significant unauthorized data access or workflow compromise. Medium = constrained exploit with meaningful impact. Low = limited hardening issue. Assign actual severity based on exploitability and impact, not labels alone.
Release decision: block on open Critical/P0; block on High without documented exception and compensating control; require retest evidence for fixed issues. Publish residual-risk register and sign-off by engineering owner, security reviewer and business owner.

## 9. Tester execution worksheet

Copy the following template for every test case:
Test ID: __________   Environment/build: __________
Feature/API: __________   Tenant/role: __________
Preconditions: __________
Steps (non-destructive): __________
Expected secure behavior: __________
Observed behavior: __________
Result: PASS / FAIL / BLOCKED / NOT APPLICABLE
Severity if failed: Critical / High / Medium / Low
Evidence link (redacted): __________
Issue owner / ticket: __________
Fix commit / retest date / retest result: __________

Required deliverables: asset inventory, access-control matrix, test coverage list, findings with reproducible evidence, remediation tracker, retest report, dependency/SAST/DAST outputs, backup restore evidence, and final signed risk acceptance.

## 10. Beyond the security checklist: engineering practices

1. Threat-model major flows before new features: tenant boundaries, file uploads, payment updates, email, admin and imports.
2. Make authorization a reusable backend policy layer with automated negative tests for every tenant-owned resource.
3. Add CI security gates: tests, secret scan, dependency scan, SAST, and build checks; schedule DAST and external penetration tests.
4. Keep a software bill of materials and update dependencies; pin and review AI-generated packages.
5. Require code review by an experienced engineer for auth, financial and upload logic; do not accept AI-generated code without verification.
6. Run staging with realistic roles and synthetic data; do not copy unredacted production data into test systems.
7. Implement monitoring, incident response drills, backups and restore tests; security includes detection and recovery.
8. Commission an independent penetration test before high-risk customer onboarding and after major auth/tenant/payment changes.
9. Define secure development ownership: named people for patching, access reviews, alerts and incident response.
10. Reassess continuously; security is not a one-time certification.

## 11. Standards and references

Use OWASP ASVS (application security verification), OWASP Web Security Testing Guide, OWASP API Security Top 10, OWASP Cheat Sheet Series, NIST SSDF, and current dependency advisories as reference frameworks. The tester should map relevant ASVS controls to implemented features, rather than claim full compliance without evidence.
References: https://owasp.org/www-project-application-security-verification-standard/ ; https://owasp.org/www-project-web-security-testing-guide/ ; https://owasp.org/API-Security/ ; https://cheatsheetseries.owasp.org/ ; https://csrc.nist.gov/Projects/ssdf .
