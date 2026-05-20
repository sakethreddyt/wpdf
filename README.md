# DOCX to Merged PDF (LibreOffice backend)

This project provides a small local server that converts uploaded DOCX files to PDF using LibreOffice, merges the PDFs, and returns a single merged PDF for download.

Requirements
- Node.js (14+)
- LibreOffice installed and added to your PATH (soffice command available)

Windows instructions
1. Install LibreOffice from https://www.libreoffice.org/
2. Add `C:\Program Files\LibreOffice\program` to your PATH environment variable (soffice resides there).
3. Open a new PowerShell and run `soffice --version` to confirm.

Setup

1. Install dependencies:

```powershell
npm install
```

2. Start the server:

```powershell
npm start
```

3. Open http://localhost:3000 in your browser, upload DOCX files, and download the merged PDF.

Notes
- LibreOffice conversion preserves headers, footers, tables, images, margins, and pagination much more accurately than client-side HTML rendering.
- For production or higher fidelity, consider OnlyOffice Document Server or commercial libraries like Aspose.Words.

Smoke test (Windows PowerShell)
1. Ensure the server is running: `npm start`.
2. Run the included smoke-test script (from repo root):

```powershell
powershell -ExecutionPolicy Bypass -File .github\smoke-test.ps1 -FilePath C:\path\to\sample.docx
```

This will upload the DOCX, poll `/status/:jobId`, and download the merged PDF as `merged-<jobId>.pdf`.

Notes
- Fixed a small client-side bug in `public/index.html` around the XHR upload handler (removed an invalid `response.ok` reference). If you change the upload flow, keep the upload weight/progress contract in sync with the server.
