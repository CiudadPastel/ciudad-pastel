# HU-T01 — Product Catalog

This document records the public product catalog contract, technical constraints, and business questions for Ciudad Pastel. CIU-141 is not declared complete or client-approved here.

## Provisional decisions for CIU-141

**PENDING CONFIRMATION WITH CIUDAD PASTEL** (PENDIENTE DE CONFIRMACIÓN). These four rules are team proposals implemented for human review, not approved client decisions:

1. **Multiple selection:** visitors may select one or several categories. Multiple selection returns the OR union of their published products, each product once. Each Firestore product still has exactly one `categoryId`; no many-to-many relationship is introduced.
2. **Visual exploration:** a future “View all categories” interface will use cards with category name, representative image, and published product count from `GET /api/categories`. No additional navigation endpoint is needed.
3. **Empty categories:** hide categories without published products. Published out-of-stock products keep a category visible; withdrawn products do not.
4. **Counts:** show the number of published products per category regardless of availability. Withdrawn products never count.

The visual interface will be implemented later by the frontend team (CIU-145, CIU-146, CIU-147). This backend extension does not implement that interface or establish client approval.

## Existing product rules and storage

The existing model and validators remain unchanged. Except for the pagination contract already incorporated for frontend integration, business rules below remain proposals pending client confirmation.

| Topic | Current behavior |
|---|---|
| Required product fields | `name` (3–120 characters after trimming), integer CRC `price` (1–10,000,000), one `categoryId`, boolean `available`. |
| Optional fields | `description` (up to 1,000 characters after trimming), `imageUrl` (http/https URL up to 500 characters); missing values become null. |
| Availability | Boolean availability, no numerical stock. Published out-of-stock products remain public. |
| Status | Internal `published` or `withdrawn`; only published products are public. |
| Category membership | One stored category ID per product. Orphan products remain in the unfiltered catalog with `category: null`. |
| Product order | Category `order` ascending, product name using Spanish locale, then product ID as deterministic tie-breaker; orphan products last. |
| Prices | Fixed CRC amounts; variable or quotation-based prices require client confirmation. |
| Pagination | `page` defaults to 1; `limit` defaults to 12 and is capped at 50. Existing normalization is preserved. |
| Images | One external image per product. Local upload remains outside this work, reserved for HU-T06 and storage-plan evaluation. |

`categories/{id}` stores `name`, `order`, `createdAt`, and `updatedAt`.
`products/{id}` stores `name`, `description`, `price`, `categoryId`, `imageUrl`, `available`, `status`, `createdAt`, and `updatedAt`.
Document IDs identify entities. No category count/image fields, schema changes, migrations, indexes, or dependencies are added.

The existing repository reads products with `where("status", "==", "published")` and reads categories once per snapshot. Sorting, aggregation, filtering, and pagination happen in memory. Administrative metadata is never serialized by the public representations.

### Previously documented architectural guidance

The following technical decisions and deployment guidance were documented before CIU-141, in commit `0abc1154f5ecae8c633c959b3310a6b5f9c1302c`. They describe the intended architecture, not client approval of the provisional business rules above.

**Firestore access boundary:** the intended security restriction is to deny all direct client reads and writes to both `products` and `categories` in `firestore.rules`, using `allow read, write: if false;` for each collection's documents. Catalog access goes through the backend using Firebase Admin SDK. Public HTTP endpoints do not imply public Firestore access. This restores deployment guidance; it does not assert that the deployed rules have been verified or change any security rules in this work.

**Query and read-budget design:** the published-product query uses a single-field status filter and requires no composite index for catalog ordering, which happens in the service. The original Spark-plan rationale for the 60-second cache was to conserve Firestore's free daily read budget, documented at the time as 50,000 reads per day. That figure is a historical planning assumption, not a current quota guarantee. The existing invalidation hook was intended for future product writes under HU-T06; no product-write workflow is added by CIU-141.

**Image storage and upload limits (CIU-133):** the first-stage design uses one externally hosted image URL per product, rather than storing image files in category or product documents. Direct upload of the store's own photos remains reserved for product administration under HU-T06 and requires evaluation of Firebase storage and billing. The earlier architecture note recorded a Cloud Storage Blaze-plan requirement from February 2026; upload work must verify the applicable plan requirements before implementation. CIU-141 adds neither file upload nor a Cloud Storage integration.

**Image validation and presentation:** the existing product validator validates image URLs before persistence, and the public representation re-sanitizes stored URLs with `sanitizeImageUrl` before returning them. The earlier presentation guidance calls for the frontend to display a placeholder when an image is null. That is a frontend responsibility, not a fallback URL generated by this API; the future category-card interface remains outside this backend change.

## Public categories

`GET /api/categories` requires no authorization. HTTP 200 returns an ordered array with exactly `id`, `name`, `productCount`, and `imageUrl` per category:

```json
[
  {"id":"category-1","name":"Chocolates","productCount":2,"imageUrl":"https://example.com/chocolate.jpg"},
  {"id":"category-2","name":"Decoration","productCount":1,"imageUrl":null}
]
```

This is an illustrative response using fictitious data, not production content. The URL represents a stored fixture, not an invented fallback image.

For each existing category `c`:

`productCount(c) = number of products p where p.status === "published" and p.categoryId === c.id`.

Availability does not affect the count. Counts use the complete snapshot, independently of selected filters, pages, or page limits. Missing category references do not create categories or contribute to any existing category's count. Categories with count zero are omitted; if none qualify, return `[]`.

The representative `imageUrl` is the first non-null public product image in that category, following the existing deterministic catalog order. Products are converted through `toPublicProduct`, which uses `sanitizeImageUrl`: only trimmed http/https URLs up to 500 characters survive. Unsafe, malformed, absent, or oversized URLs become null. Skip invalid images and keep looking within the category. Published out-of-stock products may supply the image; withdrawn and orphan products may not. If none is valid, return `imageUrl: null`. No fallback images or links are generated and no remote image is fetched or verified for reachability.

Category ordering remains the repository's `order` ascending with Spanish alphabetical name ties. `order`, timestamps, status, stored category IDs on products, and other administrative fields are not added to public payloads.

Repository failures return HTTP 500 with `{"message":"Could not load the product categories."}`.

## Public product filters

All existing response fields remain: `items`, its alias `products`, `total`, `page`, `limit`, `hasMore`. Both product arrays contain only `id`, `name`, `description`, `price`, `imageUrl`, `available`, and `category`. Nested product categories remain exactly `{id, name}` or null; category summaries do not change this nested contract.

Supported requests:

```text
GET /api/products
GET /api/products?categoryId=category-1
GET /api/products?categoryId=category-1&page=2&limit=12
GET /api/products?categoryIds=category-1
GET /api/products?categoryIds=category-1&categoryIds=category-2
GET /api/products?categoryIds=category-1&categoryIds=category-2&page=2&limit=12
```

Without either filter, the existing complete published catalog behavior is preserved, including orphan products. `categoryId` retains its previous single-ID semantics. `categoryIds` accepts repeated exact parameter names and applies OR membership using a set of IDs, so duplicate selected IDs never duplicate products. Selection order does not reorder the catalog. Matching uses stored IDs exactly, without trimming, case folding, or display-name matching. A comma is a literal ID character, never a list separator; `categoryIds=a,b` does not select `a` and `b`.

Only products with an existing requested category qualify. Unknown IDs are ignored: a mixture returns the known categories' products; all unknown, orphan-only, empty, or withdrawn-only selections return HTTP 200 with empty arrays, `total: 0`, `hasMore: false`, and normalized requested page/limit. Filtering happens before totals and pagination. `hasMore = page * limit < total` after existing page/limit normalization.

### Validation and exact errors

Maximum **20 supplied `categoryIds` entries**, counted before deduplication, bounds filter work. One entry is valid. Validation uses original URL keys and values, so bracket notation is rejected under both simple and extended Express query parsers and filters cannot disappear through query-parser parameter truncation. Every invalid filter returns HTTP 400 with `{"message":"..."}` before repository access; it never falls back to an unfiltered response.

| Condition, in validation precedence order | Exact message |
|---|---|
| Empty/whitespace-only or repeated `categoryId`, or `categoryId[...]` notation | `categoryId must be a non-empty string.` |
| Any `categoryIds[...]` notation, including arrays, objects, and nested structures | `categoryIds must use repeated non-empty string parameters; bracket notation is not supported.` |
| Both exact `categoryId` and `categoryIds` parameters supplied | `categoryId and categoryIds cannot be used together.` |
| More than 20 `categoryIds` entries, including duplicates | `categoryIds must contain at most 20 entries.` |
| Any empty or whitespace-only `categoryIds` entry | `categoryIds must contain only non-empty strings.` |

All other query values are literal strings, not JSON objects or comma-separated lists. A repeated legacy `categoryId` remains invalid. No administrative authentication is required for either endpoint.

Catalog repository failures retain HTTP 500 with `{"message":"Could not load the product catalog."}`. Exception details are not returned.

## Shared cache and backend limits

One complete snapshot contains internal category relationships, sanitized public products, and ordered category summaries. Both endpoints share it for `CATALOG_CACHE_TTL_MS = 60_000`, measured from load start as before. Category counts and images require no additional Firestore queries: one published-product repository read and one category repository read populate the whole snapshot. Filter/page changes reuse it.

Requests with an empty or expired cache share a single pending load. At expiration the next request refreshes all products, counts, and images. `invalidateProductCatalogCache()` explicitly detaches the old snapshot and pending load. An older in-flight request may receive its original snapshot, but that load cannot repopulate the cache or clear a newer pending load. A category disappears on refresh when it loses its last published product; replacement images and counts refresh together. Repository errors are retryable and are never cached. Service results are deep copies so caller mutations cannot change cached summaries or nested product categories.

The cache is process-local, not distributed, and stale data can remain visible until TTL expiration or explicit invalidation. The complete published catalog is loaded into memory; this change does not add database-level pagination or search. Future writes should use the existing invalidation hook. Existing no-filter pagination and normalization remain unchanged.

Scope is backend API, tests, and documentation only. No React/CSS, HU-T02, WhatsApp, administrative authentication, product CRUD, Firestore structure/migrations/rules, unrelated endpoints, or Linear changes are included.

## Local sample data

The existing `apps/api/scripts/seed-products.js` provides deterministic sample data (6 categories, 18 products).

```bash
# Dry run: validates in memory, with no Firestore writes or credentials required.
npm run seed:products --workspace=apps/api
# Explicit upsert into Firestore; requires configured Firebase credentials.
npm run seed:products --workspace=apps/api -- --apply
# Explicit removal of seed-prefixed documents only.
npm run seed:products --workspace=apps/api -- --remove --apply
```

These commands are reference documentation; automated API tests mock repositories and forbid real Firebase initialization. No seed command that writes data is part of this implementation's verification.

## Pending client questions

Client responses have not been recorded. Confirm the four CIU-141 decisions above, including visual exploration, OR selection, hiding empty categories, and counting published out-of-stock products. Also confirm catalog size, fixed versus variable prices, out-of-stock visibility, boolean versus numerical inventory, single-category membership, category names, photo sources, and whether product sizes/presentations are separate products. Upload/storage choices and any broader catalog changes require separate agreement.

## Ciudad Pastel client validation results

Reserved for recording actual client responses after a validation session. No responses or approvals are recorded here yet. Keep the provisional rules pending until there is an actual response; implementation, code review, and the historical technical decisions are not evidence of client approval.

Validation session date: **Not recorded**. Client participant(s): **Not recorded**. Recorded by: **Not recorded**. Source or meeting-notes reference: **Not recorded**.

| Topic | Actual client response | Validation status |
|---|---|---|
| CIU-141: multiple category selection with OR semantics | Not recorded | Pending confirmation |
| CIU-141: visual category cards with name, image, and count | Not recorded | Pending confirmation |
| CIU-141: hiding categories without published products | Not recorded | Pending confirmation |
| CIU-141: counts include published out-of-stock products and exclude withdrawn products | Not recorded | Pending confirmation |
| Other catalog questions listed above, including single-category membership and image sources | Not recorded | Pending confirmation |

For each future response, record the client's wording, date, supporting reference, and any resulting decision or follow-up. If a response changes a provisional rule, identify the affected contract and required follow-up rather than implying the existing implementation has already changed.

CIU-141 remains pending human review and confirmation with Ciudad Pastel. Backend implementation does not mark it approved or complete and does not change Linear status.
