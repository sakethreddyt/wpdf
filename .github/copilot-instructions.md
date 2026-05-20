## Purpose

This file gives concise, actionable guidance for AI coding agents working on this repository (Word -> PDF merger using LibreOffice). It focuses on the concrete, discoverable patterns and workflows an agent needs to be immediately productive.

## Quick start (developer)

1. Ensure LibreOffice (`soffice`) is installed and on PATH (Windows: add `C:\Program Files\LibreOffice\program`).
2. Install dependencies and start the server:

```powershell
npm install
npm start
```

3. Open http://localhost:3000 or use the client in `public/index.html` to upload `.docx` files.

## Big-picture architecture

- server: `server.js` — Express app that accepts file uploads, converts each uploaded DOCX to PDF via `libreoffice-convert`, merges PDFs with `pdf-lib`, and writes a merged PDF to `output/{jobId}.pdf`.
- client: `public/index.html` (server-driven flow) and `wpdf.html` (local client-side conversion alternative using `mammoth` + `html2pdf`).
- storage: `uploads/` (temporary, populated by `multer`) and `output/` (final PDFs served statically).
- job tracking: in-memory `jobs` object in `server.js` (volatile; restart clears jobs).

Why this structure: converting with LibreOffice preserves fidelity; server-side conversion allows larger documents and faster client experience. The client and server coordinate via a jobId + polling (`/status/:id`).

## Important API & data shapes (do not change lightly)

- POST /convert — accepts multipart `files` and immediately returns `{ jobId }`. Server processes files async and updates `jobs[jobId]`.
- GET /status/:id — returns JSON with at least: `{ status, progress, message, result, error, phase, phaseProgress, totalProgress }`.
- GET /result/:id — convenience download endpoint that streams `output/{id}.pdf` when job `status === 'done'`.

Job object (observed shape in `server.js`):
```
{ status, progress, message, resultPath, error, phase, phaseProgress, totalProgress }
```

Client expectations:
- `public/index.html` reserves 30% of progress for upload and expects server `totalProgress` to be in the same 0-100 scale that already includes that upload weight (see constants: UPLOAD_WEIGHT=30). Keep this contract when changing progress math.

## Project-specific patterns & conventions

- Progress weights: server uses W_UPLOAD=30, W_CONVERT=60, W_MERGE=10 in `server.js` when computing `totalProgress`. The client uses UPLOAD_WEIGHT=30. Keep these in sync.
- Temporary files: `multer` writes to `uploads/` and each uploaded file is removed after conversion (`fs.unlinkSync` in `server.js`). The merged output remains in `output/` and is served statically at `/output`.
- PDF merging: `pdf-lib` is used both server-side and client-side (in `wpdf.html`) — prefer reusing existing helper patterns rather than introducing a different PDF library.
- Conversion: `libreoffice-convert` expects a Buffer; `server.js` reads the DOCX into a buffer and passes it to `libre.convert`.

## Notable gotchas discovered in the codebase

- `jobs` is in-memory. Any server restart will orphan job entries and output files on disk. Avoid relying on `jobs` persistence for long-running or production changes without adding durable storage.
- `public/index.html` contains a small client bug: inside the XHR `onload` handler the code references `response.ok` which is undefined (this path still works because upload response is parsed earlier). If modifying client-side upload flow, tidy this block and follow one clear response-parsing path.
- Outputs are served statically (`app.use('/output', express.static('output'))`). Be mindful of information leakage when changing filenames or adding auth.

## Recommended dev/debug workflows (fast checks)

- Verify LibreOffice is accessible:

```powershell
soffice --version
```

- Start server and watch logs (server prints URL on start). Use the browser at `/` or `public/index.html` to exercise end-to-end flow.
- To simulate an upload from the terminal, use a multipart/form POST (or use the browser UI). After upload, poll `/status/{jobId}` until `status==='done'` and then GET the returned `result` path.

## When changing conversion or progress logic

- If you change W_UPLOAD/W_CONVERT/W_MERGE or the progress model, update both server (`server.js`) and client (`public/index.html`) so the progress bar mapping remains correct.
- Keep the job JSON shape stable (status/progress/message/result/error). Many client UX bits rely on `phase` and `phaseProgress` fields.

## Files to inspect for examples

- `server.js` — full server flow, progress math, use of `libreoffice-convert` and `pdf-lib`.
- `public/index.html` — client upload, XHR upload progress, status polling and progress bar mapping.
- `wpdf.html` — client-side conversion alternative using `mammoth` + `html2pdf` and client-side `pdf-lib` merging.

## Security & operational notes

- Uploaded files are placed in `uploads/` and removed after conversion, but outputs in `output/` are permanent until manually cleaned. Consider a cleanup policy if adding persistence.
- Don't expose internal job IDs without considering access controls — the `output/` static route can be used to download files directly if the path is known.

---

If anything above is unclear or you want the file to include more examples (e.g., exact JSON responses observed at runtime, or a short checklist for pulling and running on Windows), tell me which section to expand and I'll iterate.
