import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PageRedactions } from '../types';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs`;

export const saveRedactedPdf = async (
  file: File, 
  redactions: PageRedactions
): Promise<Uint8Array> => {
  const fileBuffer = await file.arrayBuffer();

  // 1. Load original PDF (to copy unredacted pages)
  const originalPdfDoc = await PDFDocument.load(fileBuffer);
  
  // 2. Create new PDF
  const newPdfDoc = await PDFDocument.create();

  // 3. Load PDF.js (to render redacted pages)
  // We use a copy of the buffer to avoid any potential detachment issues
  const pdfJsDoc = await pdfjsLib.getDocument({ data: fileBuffer.slice(0) }).promise;
  
  const numPages = originalPdfDoc.getPageCount();

  for (let i = 0; i < numPages; i++) {
    const pageRedactions = redactions[i] || [];

    // === ALWAYS FLATTEN PAGE ===
    // This ensures consistency and security by converting all pages to images
    // We render at 3x scale for high quality (approx 216 DPI)
    
    const page = await pdfJsDoc.getPage(i + 1); // PDF.js uses 1-based index
    const viewport = page.getViewport({ scale: 3.0 }); 
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Draw redactions if any
    if (pageRedactions.length > 0) {
      pageRedactions.forEach(rect => {
        const rectX = rect.x * canvas.width;
        const rectY = rect.y * canvas.height;
        const rectWidth = rect.width * canvas.width;
        const rectHeight = rect.height * canvas.height;
        
        context.fillStyle = '#000000';
        context.fillRect(rectX, rectY, rectWidth, rectHeight);
      });
    }
    
    // Convert to JPEG with maximum quality
    const imageDataUrl = canvas.toDataURL('image/jpeg', 1.0);
    const imageBytes = Uint8Array.from(
      atob(imageDataUrl.split(',')[1]),
      c => c.charCodeAt(0)
    );
    
    const image = await newPdfDoc.embedJpg(imageBytes);
    
    // Create page with original dimensions (viewport / 3)
    const newPage = newPdfDoc.addPage([viewport.width / 3, viewport.height / 3]);
    
    // Draw the high-res image to fit the page
    newPage.drawImage(image, {
      x: 0,
      y: 0,
      width: newPage.getWidth(),
      height: newPage.getHeight(),
    });
  }
  
  return await newPdfDoc.save();
};

export const downloadPdf = (data: Uint8Array, filename: string) => {
  const blob = new Blob([data as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};