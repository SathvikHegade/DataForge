# DataForge Red-Team QA Report

Date: 2026-09-28

## 1. Executive Summary

DataForge's existing automated tests pass, but adversarial engine testing found three confirmed defects affecting data integrity or a documented core export format:

- **HIGH:** JSON export is unusable. Every JSON export reaches `DataExporter.export()` and fails because `polars.DataFrame.write_json()` is called with the unsupported `pretty` keyword.
- **HIGH:** Filling a Boolean column with an invalid constant silently changes the column type to `String` and inserts the invalid text, violating type preservation.
- **MEDIUM:** One-hot encoding rows with missing category values produces null indicator values rather than binary indicators. This introduces missing values into encoded features.

The backend suite (22 tests) and frontend suite (4 tests) passed, but their coverage is narrow. The application should not be considered production-ready for unfamiliar user-provided datasets until the confirmed defects are fixed and the missing integration/invariant coverage is added.

## 2. Architecture and Tested Features

The tested path is:

1. FastAPI routes under `/api/v1` authenticate users and resolve a dataset/version.
2. Upload parsing is handled by `backend/app/engine/reader.py`.
3. Uploaded data is stored as canonical Snappy Parquet; original upload bytes are retained separately.
4. Transformations are applied synchronously by `backend/app/engine/transformer.py`.
5. Successful transformations create immutable Parquet versions.
6. Preview reads a Parquet version and applies the same transformer in preview mode.
7. Export reads Parquet and dispatches to CSV, Parquet, JSON, or XLSX in `backend/app/engine/exporter.py`.

The documented transformation catalog contains 25 operations:

- Missing values: drop, constant fill, mean, median, mode
- Duplicates: remove duplicates
- Types: cast to integer, float, string, boolean, date, datetime, categorical
- Columns: rename, drop, select, duplicate
- Strings: trim, case conversion, replacement, normalization
- Dates: parse and extract components
- Numerical: standard scale, min-max scale, log1p
- Categorical: one-hot and ordinal encoding
- Outliers: IQR/z-score clip or remove
- Rows: filter and sort
- ML preparation: train/test/validation split

Supported upload extensions in source: CSV, TXT (parsed as CSV), Parquet, JSON/NDJSON, XLSX, XLS. Configured upload limit: 500 MB. Preview page size is constrained to 1-500 rows. Processing reads uploads fully into memory; no tested streaming upload path was found.

## 3. Test Environment and Limitations

- Windows 11 environment, Python 3.12 virtual environment under `backend/.venv`.
- Polars, PyArrow, pandas, FastAPI, pytest, and the checked-in frontend dependencies were used.
- No production infrastructure, Redis worker, PostgreSQL, S3/MinIO, browser automation, or real user data was exercised.
- No source code was modified to make a test pass.
- The workspace root is not a Git repository, so repository history and diff-based provenance were unavailable.
- Stale compiled red-team test artifacts existed under `backend/tests/__pycache__`, but no corresponding source tests existed and they were not counted as coverage.

## 4. Dataset Categories and Edge Cases Tested

Deterministic probes covered:

- Nulls, `None`, NaN and positive infinity
- Boolean invalid fills
- Numeric, string, date, and mixed-type columns
- Missing categorical values during one-hot encoding
- Category-name collisions (`a-b` and `a_b`)
- Header-only CSV, duplicate CSV headers, malformed CSV, and NDJSON
- Leading-zero identifiers during CSV export
- Constant and skewed numeric values, outlier handling, and invalid dates
- Combined columns with missing values, duplicates, invalid dates, whitespace, and outliers
- Transformation operations individually in a mixed matrix
- Export formats CSV, JSON, Parquet, and XLSX
- Mean imputation at 1,000, 10,000, and 100,000 rows

## 5. Test Counts

| Scope | Executed | Passed | Failed/defect | Unsupported or expected rejection | Blocked |
|---|---:|---:|---:|---:|---:|
| Existing backend pytest suite | 22 | 22 | 0 | 0 | 0 |
| Existing frontend Vitest suite | 4 | 4 | 0 | 0 | 0 |
| Frontend production build | 1 | 1 | 0 | 0 | 0 |
| Direct adversarial probes and matrix | 31 | 25 | 3 confirmed defects | 3 expected/unsupported cases | 0 |
| **Total checks** | **58** | **52** | **3** | **3** | **0** |

The matrix count treats each operation, export format, and performance size as one check. Probe output was captured directly from the running source; no failures were inferred from static inspection alone.

## 6. Results by Feature

### Reader and upload parsing

- Valid CSV, duplicate headers, and NDJSON parsed successfully.
- Empty/header-only CSV was rejected with `Dataset has 0 rows.` This is consistent with the current policy, but the behavior is undocumented for users.
- Malformed CSV was rejected with a clear 400-style engine error after the permissive fallback also failed.
- The reader accepts duplicate headers by renaming them (`a_duplicated_0`), which should be documented because it changes the schema.

### Transformation engine

- Existing type conversion, missing-value, date, boolean, split-validation, and preview tests passed.
- Common operations executed successfully on a mixed adversarial frame.
- One-hot encoding handles category-name collisions by suffixing generated names, but missing categories are not encoded as binary zeros.
- NaN and infinity are normalized to null before transformation, which is consistent with the engine's stated missing-value normalization.

### Export

- CSV, Parquet, and XLSX direct exports succeeded.
- CSV bytes preserved leading-zero identifiers (`001` and `002`) in the exported file. A generic CSV reader may infer those identifiers as integers on re-import, so identifier preservation depends on consumer schema handling.
- JSON export failed for the normal path, described below.

### API and frontend

- Existing authentication guards and route registration tests passed.
- Existing frontend API tests passed.
- Frontend TypeScript/Vite production build passed.
- No browser-level upload-to-preview-to-transform-to-export test was executed.
- Static inspection indicates the frontend advertises export behavior while application routing does not obviously expose a dedicated export page; this remains an unconfirmed integration gap, not a confirmed runtime defect.

## 7. Confirmed Bugs

### DF-001: JSON export always fails

**Severity:** HIGH

**Evidence:** Direct execution of:

```python
DataExporter.export(pl.DataFrame({"id": ["001", "002"]}), "json")
```

raised:

```text
TypeError: DataFrame.write_json() got an unexpected keyword argument 'pretty'
```

**Affected code:** `backend/app/engine/exporter.py`, JSON branch of `DataExporter.export()`.

**Impact:** The documented JSON export format cannot be downloaded. The route catches the exception and returns an export failure instead of data.

**Reproduction:**

1. Construct or upload any non-empty dataset.
2. Request export format `json`.
3. Observe the `TypeError` from Polars or the API's 400 `Export failed` response.

**Suggested regression test:** Export a two-row frame as JSON, assert HTTP success/direct return, parse the bytes as JSON, and compare all rows and columns with the source frame.

### DF-002: Invalid Boolean constant fill changes schema and values

**Severity:** HIGH

**Evidence:**

```python
frame = pl.DataFrame({"x": pl.Series([None, True], dtype=pl.Boolean)})
result, _ = DataTransformer.apply_transformation(
    frame,
    "fill_missing_constant",
    {"columns": ["x"], "value": "not-bool"},
)
```

Actual result: `x` became `String` with values `['not-bool', 'true']`.

**Expected behavior:** Reject an invalid Boolean fill value, or preserve Boolean type using an explicitly validated default. A successful fill operation must not silently widen the column to text.

**Impact:** Downstream filters, validation, ML readiness, and exports receive a schema/value different from the user's Boolean column while the operation reports success.

**Suggested regression test:** Assert invalid Boolean constants raise a validation error and assert valid Boolean constants retain `pl.Boolean`.

### DF-003: One-hot encoding emits null feature values for missing categories

**Severity:** MEDIUM

**Evidence:**

```python
result, _ = DataTransformer.apply_transformation(
    pl.DataFrame({"x": ["a", None, "b"]}),
    "one_hot_encode",
    {"columns": ["x"]},
)
```

Actual result:

```text
x_a: [1, null, 0]
x_b: [0, null, 1]
```

**Expected behavior:** For standard binary indicator columns, the missing-category row should be `[0, 0]`, or the operation should explicitly reject/retain a named missing category. It should not silently produce nulls in all generated indicators.

**Impact:** A transformation intended to produce binary ML features creates missing values and can break consumers expecting integer indicators.

**Suggested regression test:** Assert generated indicator columns have no nulls for missing source categories and are restricted to `{0, 1}`.

## 8. Data Integrity Findings

- No row or column count corruption was observed in the executed successful operation matrix except where the selected operation intentionally changed shape.
- Invalid Boolean filling violated type preservation.
- One-hot encoding introduced missing values that were absent from the intended binary output contract.
- Several version/export API workflows were not integration-tested end to end.
- Original uploads and canonical versions are designed to be retained, but deletion/recovery behavior was not exercised against a live database and storage backend.

## 9. Performance and Scalability

The direct in-process mean-imputation probe completed as follows on this environment:

| Rows | Elapsed seconds |
|---:|---:|
| 1,000 | 0.0033 |
| 10,000 | 0.0051 |
| 100,000 | 0.0026 |

These numbers are engine-only timings and are not representative of upload, Parquet I/O, database, worker, network, or browser latency. They do not establish a maximum safe size. The source config allows 500 MB uploads while the reader fully buffers input and the synchronous routes load complete Parquet versions, so peak-memory and timeout testing remains required before large-file readiness can be claimed.

The frontend build emitted a bundle-size warning: the main minified JavaScript chunk is approximately 749 kB before gzip. This is a performance risk for initial browser load, not a correctness failure.

## 10. Unsupported Cases and Missing Safeguards

- Empty and header-only datasets are rejected; user-facing documentation should state this explicitly.
- Malformed CSV is rejected; no repair policy is promised.
- No tested guarantee exists for arbitrary encodings beyond the reader's chardet detection and fallback behavior.
- No tested support guarantee exists for very wide datasets, near-500 MB files, huge strings, or pathological CSV quoting.
- No browser E2E coverage exists for upload, preview, chained transformations, reset/version restore, or export.
- No executed API integration test proves preview bytes and exported bytes represent the same version.
- No executed concurrency test covers simultaneous transformations, version-number allocation, or branch races.
- No executed worker/Redis test covers asynchronous task behavior described by architecture documentation.

## 11. Prioritized Recommendations

1. **P0:** Remove or adapt the unsupported JSON `pretty` argument and add route-level JSON export regression coverage.
2. **P0:** Validate Boolean fill constants before applying them; never coerce a typed Boolean column to string on an invalid value.
3. **P1:** Define one-hot missing-value semantics and enforce non-null binary indicators or an explicit missing category.
4. **P1:** Add API integration tests covering upload, version selection, preview, execute, history, and all export formats.
5. **P1:** Add invariant/property tests for row/column counts, untouched columns, schema preservation, idempotence, and preview/export agreement.
6. **P2:** Add deterministic fuzz/metamorphic tests for mixed types, duplicate identifiers, Unicode, malformed structures, and operation ordering.
7. **P2:** Test memory, latency, timeouts, and concurrency at progressively larger files up to and beyond the configured limit in an isolated environment.
8. **P2:** Reduce the frontend initial bundle through route-level code splitting and verify the complete browser workflow.

## 12. Required Regression Suite

At minimum, add tests for:

- JSON export success and JSON round-trip fidelity.
- Boolean fill with valid and invalid constants, preserving Boolean dtype.
- One-hot encoding with nulls, collision-safe names, and binary-value invariants.
- CSV/Parquet/JSON/XLSX export equality against the selected version.
- Upload of each supported format, including NDJSON and TXT-as-CSV.
- Chained transformations with explicit operation order and repeated/idempotent operations.
- Version creation, source-version selection, restore, branch behavior, and failed-run history.
- Authorization across every dataset/version/export/transformation route.
- Large-file processing, concurrent version creation, and cleanup failure recovery.

## 13. Overall Readiness Assessment

**Not ready for production use with unfamiliar datasets.** The baseline suites are green, but the confirmed JSON export outage and two data-integrity defects show that passing current tests does not establish correctness. The most important fixes are small and directly testable, but end-to-end workflow, storage, concurrency, and scale evidence is still missing.
