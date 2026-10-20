# Student access (CIU-118 / CIU-119 / CIU-121 / CIU-123)

## Identity and access rules

Students submit `fullName`, `idNumber`, and `phone`. Name is collected for UX/audit
consistency, trimmed and validated, but never compared with the stored name or
used as an authentication factor. This endpoint does not persist an audit record.
No email, Firebase account, username, password, or administrative authentication
is required.

Access requires normalized ID number AND normalized phone to match the SAME
active confirmed enrollment. Cancelled enrollments do not grant access.
Multiple active enrollments may grant access to multiple courses. Identity lookup
uses HU-A09's `findActiveEnrollments({ idNumber, phone })`; there is no second
enrollment lookup implementation.

Validation reuses HU-A05/HU-A09 person validation: fullName is a string, whitespace
is collapsed, and length is 3–120 characters. ID and phone must be strings.
The existing `normalizeDigits` removes all non-digit characters, including spaces
and hyphens. National IDs have 9 digits starting with 1–7; DIMEX has 11 or 12
digits. Since this contract has no `idType`, 11/12-digit IDs select DIMEX rules;
other lengths select national ID rules. Phone has exactly 8 normalized digits.
Additional fields are ignored; email is neither collected nor returned.

## HTTP contract

`POST /api/student-access/verify` is public, with JSON body:

```json
{"fullName":"Ana Mora","idNumber":"1-0538-0021","phone":"8888 7777"}
```

Success is HTTP 200:

```json
{
  "accessToken": "<signed-payload>.<signature>",
  "expiresIn": 900,
  "courses": [
    {
      "id": "course-1",
      "name": "Taller de macarons",
      "recipeBooks": [
        {"id":"book-1","title":"Macarons","fileName":"macarons.pdf","sizeBytes":12345}
      ]
    }
  ]
}
```

Courses use the enrollment's `courseId` and `courseName`. HU-A03's
`findRecipeBooksByCourse` checks the course and returns its existing student-safe
serialization (`id`, `title`, `fileName`, `sizeBytes`). Only courses with at least
one recipe book appear. Multiple books remain an array. No createdBy, Firestore
paths, storage internals, notes, other students, or enrollment IDs are returned
in the response fields. An otherwise valid student with no recipe books still
gets HTTP 200, a token, and `courses: []`.

Malformed inputs return HTTP 400 with
`{"message":"Student verification validation failed.","errors":["..."]}`.
Validation errors describe input syntax, never whether a record exists.
All well-formed verification failures return exactly HTTP 401 with
`{"message":"We couldn't find an enrollment with this data."}`.
Wrong ID, wrong phone, mismatched pairs, and cancelled enrollments are
indistinguishable. Never disclose which identity field was incorrect.
Unexpected failures return HTTP 500 with
`{"message":"Could not verify student access."}`. Raw IDs, phones, and tokens
are not logged by this feature.

## Temporary tokens and revocation

Tokens use Node's built-in HMAC SHA-256, with a domain/version prefix in the
signed input and timing-safe signature comparison. The wire format is
`base64url(JSON claims).base64url(signature)`. It is signed, NOT encrypted.
Claims contain only `enrollmentIds` (matching active enrollments), `courseIds`
(currently eligible courses), `iat`, and `exp` (Unix seconds). They never contain
name, phone, or ID number. Lifetime is 900 seconds (15 minutes).

`STUDENT_ACCESS_TOKEN_SECRET` is required when creating/verifying a token and
must be at least 32 bytes; use a cryptographically random secret. There is no
hardcoded fallback, including in production. Missing/invalid configuration fails
closed on use with the safe HTTP 500. Syntactically valid verification requests
validate configuration before enrollment lookup, regardless of identity match.
Automated tests inject a test-only secret;
the reusable token functions also accept explicit secret/time options.
`verifyStudentAccessToken` rejects malformed, tampered, expired, and future-issued
tokens. Verification is a service function, not an HTTP endpoint.

A token is temporary access, not a permanent student account/session. The client
has NOT confirmed how long students retain access to course materials. That
long-term access period remains an open business question; 15 minutes is only
the technical token lifetime.

Even with a valid token, the recipe-book endpoint re-checks that the underlying
enrollment is still active and linked to the requested course on every request.
Cancellation must revoke practical access immediately without waiting for token
expiry. Signature verification alone cannot authorize PDF delivery.

## Rate limiting

Verification has a dedicated `createRateLimiter` instance: 5 attempts per
15 minutes per IP, counting successes and failures that reach the route. The
sixth attempt returns HTTP 429 with `Retry-After` and
`{"message":"Too many verification attempts. Please try again later."}`.
Malformed JSON and bodies over 100 KB also count and receive safe JSON 400
responses without logging parser errors or their input. It has its own `.reset()`
for tests and does not share enrollment-request
counters. Like the existing limiter, counters are in memory per API process and
reset on restart. Proxy configuration must follow the existing limiter's
deployment guidance so `req.ip` represents the visitor accurately.

## Authorized recipe-book file (CIU-121)

The authoritative backend contract is:

`GET /api/student-access/courses/:courseId/recipe-books/:recipeBookId/file`

Send `Authorization: Bearer <student-access-token>` using the temporary token
from verification. This uses the existing HMAC verifier, not Firebase/admin
authentication. The server validates token configuration first; missing/invalid
configuration returns safe HTTP 500 rather than implying invalid credentials.
No raw tokens, enrollment data, or storage errors are logged by this flow.

The signed token must include the requested course in `courseIds`. Then the
service retrieves current enrollment records using HU-A09's existing
`getEnrollmentById` repository helper for the signed `enrollmentIds`. At least
one represented enrollment must still exist, have status `enrolled`, and belong
to that course. Course claims alone do not authorize access. Cancellation,
deletion, or reassignment removes access on subsequent requests without waiting
for token expiry, unless another represented active enrollment grants access.
No ID number or phone is needed in the token. Existing token claims are retained:
enrollmentIds may include enrollments for courses without books, but these never
authorize a course absent from courseIds. Verification with `courses: []` still
succeeds; that token cannot authorize a file request.

Only after authorization succeeds does the service call HU-A03's existing
`getRecipeBookFileForCourse(courseId, recipeBookId)`. This checks the course,
recipe-book existence and ownership, and stored binary content through the
existing repository/storage layers. No public or permanent file URL is created.

Success is HTTP 200 with the actual PDF Buffer and:

- `Content-Type: application/pdf`
- `Content-Disposition: inline; filename="<safe stored filename>"` (Unicode
  filenames may also have an encoded `filename*` parameter)
- `Content-Length`: actual Buffer length, not stored metadata size
- `Cache-Control: private, no-store` to discourage reuse of cached protected files
- `X-Content-Type-Options: nosniff`

The controller safely quotes/encodes the filename already sanitized by HU-A03. Responses
do not expose enrollment IDs, personal data, createdBy, Firestore paths, chunks,
or other storage details. Cancellation cannot retract bytes already delivered.

File endpoint errors always use a safe JSON `{ "message": "..." }` body:

| Status | Condition | Message |
| --- | --- | --- |
| 401 | Missing Authorization, wrong scheme, missing/malformed token, modified signature, or expiration | Invalid or expired student access token. |
| 403 | Course absent from claims, or no represented active enrollment belongs to that course | Student access is not authorized for this course. |
| 404 | Course/book missing, book belongs to another course, or binary missing | Recipe book not found. |
| 500 | Missing/invalid token configuration or unexpected repository/storage failure | Could not retrieve recipe book. |

The route refines the original singular CIU-121 wording
(`GET /api/student-access/courses/:id/recipe-book`) because current HU-A03
supports MULTIPLE recipe books per course and verification exposes their IDs.
Clients choose a `recipeBookId` from `courses[].recipeBooks[]`; the server never
arbitrarily selects a PDF. The original singular route is not implemented.
HU-A03 cardinality and administrative recipe-book routes are unchanged.

## Backend acceptance tests (CIU-123)

`tests/student-access.api.test.js` retains all verification and token tests and
exercises file access through route, middleware/controller, authorization service,
and existing HU-A03 services with enrollment/recipe-book repositories and storage
mocked. No real Firebase connection is used. Coverage includes invalid/expired
tokens, server misconfiguration, course scope, cancellation/deletion/reassignment,
multiple enrollments/books, PDF bytes/headers, safe errors, and privacy. Existing
verification tests preserve normalization, generic failures, name independence,
no-book success, expiry, and rate limiting. No frontend or student accounts are
introduced.
