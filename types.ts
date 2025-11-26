export interface RedactionRect {
  id: string;
  x: number; // Percentage 0-1
  y: number; // Percentage 0-1
  width: number; // Percentage 0-1
  height: number; // Percentage 0-1
}

export interface PageRedactions {
  [pageIndex: number]: RedactionRect[];
}

export interface PDFDimensions {
  width: number;
  height: number;
}