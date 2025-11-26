import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { RedactionRect, PageRedactions } from '../types';
import { Trash2, Loader2, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';

// Configure worker - must match the pdfjs-dist version exactly
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs`;

// Configure standard fonts for better rendering
const pdfOptions = {
  cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/standard_fonts/',
};

interface PdfViewerProps {
  file: File;
  redactions: PageRedactions;
  setRedactions: React.Dispatch<React.SetStateAction<PageRedactions>>;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ file, redactions, setRedactions }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Handle zoom with Ctrl + Mouse Wheel
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoomPercent(prev => {
          const newZoom = Math.max(25, Math.min(300, prev + delta));
          setScale(newZoom / 100);
          return newZoom;
        });
      }
    };

    const container = pdfContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    setError(null);
  };

  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.max(25, Math.min(300, newZoom));
    setZoomPercent(clampedZoom);
    setScale(clampedZoom / 100);
  };

  const zoomIn = () => handleZoomChange(zoomPercent + 25);
  const zoomOut = () => handleZoomChange(zoomPercent - 25);

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF Load Error:', error);
    setError(error.message || 'Không thể tải file PDF');
  };

  // Helper to get coordinates relative to the PDF page (0-1 percentage)
  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getRelativeCoords(e);
    setStartPos(coords);
    setCurrentRect({ x: coords.x, y: coords.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos) return;
    e.preventDefault();
    const current = getRelativeCoords(e);

    const x = Math.min(startPos.x, current.x);
    const y = Math.min(startPos.y, current.y);
    const w = Math.abs(current.x - startPos.x);
    const h = Math.abs(current.y - startPos.y);

    setCurrentRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentRect && currentRect.w > 0.01 && currentRect.h > 0.01) {
      // Add new redaction
      const newRedaction: RedactionRect = {
        id: Math.random().toString(36).substr(2, 9),
        x: currentRect.x,
        y: currentRect.y,
        width: currentRect.w,
        height: currentRect.h
      };

      setRedactions(prev => {
        const pageRedactions = prev[currentPage - 1] || [];
        return {
          ...prev,
          [currentPage - 1]: [...pageRedactions, newRedaction]
        };
      });
    }
    setIsDrawing(false);
    setStartPos(null);
    setCurrentRect(null);
  };

  const removeRedaction = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRedactions(prev => {
      const pageRedactions = prev[currentPage - 1] || [];
      return {
        ...prev,
        [currentPage - 1]: pageRedactions.filter(r => r.id !== id)
      };
    });
  };

  const clearPageRedactions = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tất cả vùng che trên trang này?')) {
      setRedactions(prev => ({
        ...prev,
        [currentPage - 1]: []
      }));
    }
  };

  const currentPageRedactions = redactions[currentPage - 1] || [];

  return (
    <div className="flex flex-col w-full flex-1 min-h-0">
      {/* Pagination and Zoom Controls */}
      <div className="flex items-center justify-between gap-4 py-3 px-6 bg-white w-full border-b border-slate-200 flex-shrink-0">
        {/* Pagination */}
        <div className="flex items-center gap-4">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="p-2 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
          >
            &lt; Trước
          </button>
          <span className="text-sm font-medium text-slate-600">
            Trang {currentPage} / {numPages || '--'}
          </span>
          <button
            disabled={numPages === null || currentPage >= numPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="p-2 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
          >
             Sau &gt;
          </button>
        </div>

        <button
          onClick={clearPageRedactions}
          disabled={currentPageRedactions.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Xóa tất cả vùng che trên trang này"
        >
          <Trash2 className="w-4 h-4" />
          <span>Xóa các vùng che</span>
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={zoomOut}
            disabled={zoomPercent <= 25}
            className="p-2 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
            title="Thu nhỏ"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="25"
              max="300"
              step="25"
              value={zoomPercent}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-32 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-sm font-medium text-slate-600 min-w-[4rem] text-center">
              {zoomPercent}%
            </span>
          </div>
          <button
            onClick={zoomIn}
            disabled={zoomPercent >= 300}
            className="p-2 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
            title="Phóng to"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Canvas Container */}
      <div 
        ref={pdfContainerRef}
        className="relative flex-1 w-full overflow-auto p-4 bg-slate-100 flex justify-center min-h-0"
      >
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          options={pdfOptions}
          loading={
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p>Đang tải tài liệu...</p>
            </div>
          }
          error={
            <div className="flex flex-col items-center text-red-500 p-8 bg-white rounded-lg shadow">
              <AlertCircle className="w-12 h-12 mb-3" />
              <p className="font-semibold mb-2">Không thể tải file PDF</p>
              {error && <p className="text-sm text-slate-600 mb-4">{error}</p>}
              <p className="text-xs text-slate-500">Vui lòng kiểm tra file và thử lại</p>
            </div>
          }
          className="shadow-xl"
        >
          <div 
            className="relative" 
            style={{ cursor: 'crosshair' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <Page 
              pageNumber={currentPage} 
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />

            {/* Drawing Layer - Current Rectangle being drawn */}
            {isDrawing && currentRect && (
              <div
                className="absolute bg-black/50 border border-black"
                style={{
                  left: `${currentRect.x * 100}%`,
                  top: `${currentRect.y * 100}%`,
                  width: `${currentRect.w * 100}%`,
                  height: `${currentRect.h * 100}%`,
                  pointerEvents: 'none'
                }}
              />
            )}

            {/* Rendered Redactions */}
            {currentPageRedactions.map(rect => (
              <div
                key={rect.id}
                className="absolute bg-black group hover:bg-black/90 transition-colors"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
              >
                {/* Delete Button visible on hover */}
                <button
                  onClick={(e) => removeRedaction(e, rect.id)}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 border border-slate-200 z-10"
                  title="Xóa vùng chọn"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </Document>
      </div>

      {/* Instructions / Legend */}
      <div className="w-full bg-white p-3 border-t border-slate-200 text-center text-sm text-slate-500 flex-shrink-0">
        <p>💡 Kéo chuột để tạo vùng che đen. Dùng <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs">Ctrl + Con lăn</kbd> để zoom.</p>
      </div>
    </div>
  );
};