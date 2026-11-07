# Tests

Use Node.js 20+ and `npm ci --registry=https://registry.npmjs.org`.

- `npm test`: parsing, unknown colors, blank detection, quantity independence.
- `node tests/inventory.cjs`: footer-first deduction, footer-only colors, shortages, repeat protection, persistence, invalid quantities and grid fallback.
- `node tests/loading.cjs`: simulate failed model requests and recovery; check persistent cache/migration, wrong column-count warning, and blank-cell PNG labels. Requires the cat fixture.
- `node tests/run-fixtures.cjs --assert`: actual ONNX inference and expected footer/grid results.
- `npm run test:browser`: Edge mobile viewport, actual Worker/WASM, correction, persistence, touch selection and offline OCR. Requires installed Microsoft Edge.

The four user images are not committed. Save them as `.local-tests/cat.png`, `bread.png`, `landscape.png`, `pink.png`, preserving dimensions and embedded ICC profiles. Their original attachment UUIDs are respectively:

1. `9392abae-a975-4a9b-b570-b9f2574b1806`
2. `000403c6-d51b-4a7f-b6b7-4e68998bd66c`
3. `e6088fdc-fc9a-4dce-9753-660096d86aa7`
4. `af5289e8-a901-4132-bfde-e93f784aaeb2`

For JPEG inputs use Pillow `im.save(output, format='PNG', icc_profile=im.info.get('icc_profile'))`; do not resize or strip the profile. Expected counts are in `cases.json`. Fixed, manually verified rectangles are in the runners; full automatic boundary detection is not claimed. Node can override fixture directory via `COUNTBEAN_FIXTURES`.

Browser run writes `.local-tests/browser-results.json` and screenshots; Node writes `.local-tests/regression-results.json`. These are ignored. Browser applies embedded color profiles; raw PNG decoding does not, so the landscape unknown coordinate differs (documented in the report). Assertions preserve this uncertainty instead of silently correcting to footer totals.

To smoke-test a deployed site set `COUNTBEAN_TEST_URL` to its HTTPS URL before running the browser suite. It uses an isolated browser context with fresh local storage.
