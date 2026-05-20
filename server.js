const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const libre = require("libreoffice-convert");
const { PDFDocument } = require("pdf-lib");

const app = express();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirectory(UPLOAD_DIR);
ensureDirectory(OUTPUT_DIR);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_DIR));

const upload = multer({
  dest: UPLOAD_DIR
});

function convertToPdf(buffer) {
  return new Promise((resolve, reject) => {
    libre.convert(buffer, ".pdf", undefined, (err, done) => {
      if (err) return reject(err);
      resolve(done);
    });
  });
}

// Simple in-memory job store. For production use a persistent store.
const jobs = {}; // jobId -> { status, progress, message, resultPath }

app.post("/convert", upload.array("files"), (req, res) => {
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const jobId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // initialize job
  jobs[jobId] = {
    status: 'queued', // queued, running, done, error
    progress: 0,
    message: 'Queued',
    resultPath: null,
    error: null
  };

  // respond immediately with jobId
  res.json({ jobId });

  // process in background
  (async function processJob(files, id) {
    jobs[id].status = 'running';
    jobs[id].message = 'Starting conversion';

    try {
      const total = files.length;
      let completedFiles = 0;

      const mergedPdf = await PDFDocument.create();

      // Weights for phases (percent of total)
      const W_UPLOAD = 30; // upload (client-side)
      const W_CONVERT = 60; // conversion
      const W_MERGE = 10; // final merge

      // helper to update overall progress based on completed files and current file phase progress
      function updateProgress(currFilePhaseProgress = 0) {
        // completedFiles fully done -> contribute fully to conversion weight
        const perFileWeight = W_CONVERT / total;
        const convertedPortion = (completedFiles * perFileWeight) + (currFilePhaseProgress / 100) * perFileWeight;
        const totalProgress = Math.round(W_UPLOAD + Math.min(W_CONVERT, convertedPortion) + 0);
        jobs[id].progress = Math.min(99, Math.max(0, totalProgress));
        jobs[id].phase = 'converting';
        jobs[id].phaseProgress = currFilePhaseProgress;
        jobs[id].totalProgress = jobs[id].progress;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const docxPath = file.path;

        // stage: reading (quick)
        jobs[id].message = `Reading ${file.originalname}`;
        updateProgress(0);

        const docxBuf = fs.readFileSync(docxPath);

        // stage: converting
        jobs[id].message = `Converting ${file.originalname}`;
        jobs[id].phase = 'converting';
        jobs[id].phaseProgress = 0;

        // start a small ticker to provide smooth progress while conversion runs
        let tickerActive = true;
        let currPhaseProgress = 0;
        const ticker = setInterval(() => {
          if (!tickerActive) return;
          currPhaseProgress = Math.min(95, currPhaseProgress + 5);
          updateProgress(currPhaseProgress);
        }, 300);

        // perform conversion (this awaits the LibreOffice async call)
        const pdfBuf = await convertToPdf(docxBuf);

        // conversion finished
        tickerActive = false;
        clearInterval(ticker);
        currPhaseProgress = 100;
        updateProgress(currPhaseProgress);

        // stage: loading PDF
        jobs[id].message = `Loading PDF for ${file.originalname}`;
        jobs[id].phase = 'loading';
        jobs[id].phaseProgress = 100;

        const pdfDoc = await PDFDocument.load(pdfBuf);

        // stage: copying pages
        jobs[id].message = `Merging pages from ${file.originalname}`;
        jobs[id].phase = 'merging-file';
        jobs[id].phaseProgress = 0;

        const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach((page) => mergedPdf.addPage(page));

        // cleanup uploaded file
        try { fs.unlinkSync(docxPath); } catch (e) { /* ignore */ }

        completedFiles++;
        // after finishing this file, update progress
        updateProgress(100);
        jobs[id].message = `Completed ${completedFiles} of ${total}`;
      }

      // final merging stage
      jobs[id].message = 'Finalizing merged PDF';
      jobs[id].phase = 'merging-final';
      jobs[id].phaseProgress = 0;

      // smooth finalization
      for (let t = 0; t <= 10; t++) {
        jobs[id].phaseProgress = Math.round((t / 10) * 100);
        jobs[id].progress = Math.min(99, W_UPLOAD + W_CONVERT + Math.round((jobs[id].phaseProgress / 100) * W_MERGE));
        jobs[id].totalProgress = jobs[id].progress;
        await new Promise((r) => setTimeout(r, 80));
      }

      // save merged PDF to output folder
      const mergedBytes = await mergedPdf.save();
      const outPath = path.join(OUTPUT_DIR, `${id}.pdf`);
      fs.writeFileSync(outPath, Buffer.from(mergedBytes));

      jobs[id].status = 'done';
      jobs[id].progress = 100;
      jobs[id].phase = 'done';
      jobs[id].phaseProgress = 100;
      jobs[id].message = 'Completed';
      jobs[id].resultPath = `/download/${id}`;

    } catch (err) {
      console.error('Job error', err);
      jobs[id].status = 'error';
      jobs[id].error = (err && err.message) ? err.message : String(err);
      jobs[id].message = 'Conversion failed';
      jobs[id].phase = 'error';
      jobs[id].phaseProgress = 0;
    }

  })(req.files, jobId).catch((e) => {
    console.error('Processing failed:', e);
    jobs[jobId].status = 'error';
    jobs[jobId].error = e && e.message;
    jobs[jobId].message = 'Processing failed';
  });

});

// Status endpoint for clients to poll
app.get('/status/:id', (req, res) => {
  const id = req.params.id;
  const job = jobs[id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ status: job.status, progress: job.progress, message: job.message, result: job.resultPath, error: job.error });
});

// Download endpoint (optional)
app.get('/result/:id', (req, res) => {
  const id = req.params.id;
  const job = jobs[id];
  if (!job) return res.status(404).send('Job not found');
  if (job.status !== 'done') return res.status(400).send('Job not completed');

  const p = path.join(OUTPUT_DIR, `${id}.pdf`);
  if (!fs.existsSync(p)) return res.status(404).send('Result not found');
  res.download(p, 'merged.pdf');
});

// Direct download endpoint
app.get('/download/:id', (req, res) => {
  const id = req.params.id;
  const job = jobs[id];
  if (!job) return res.status(404).send('Job not found');
  if (job.status !== 'done') return res.status(400).send('Job not completed');

  const p = path.join(OUTPUT_DIR, `${id}.pdf`);
  if (!fs.existsSync(p)) return res.status(404).send('Result not found');
  res.download(p, 'merged.pdf');
});

// Health check for Render and uptime checks
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
