import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Configure PDF worker (required for pdf.js to work in React)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface CourseData {
  code: string;
  name: string;
  workload: number;
  syllabus: string;
}

/**
 * Reads an Excel file from a URL (our public folder)
 */
export const parseExcelCurriculum = async (url: string): Promise<CourseData[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not find the Excel file.");
    
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // 1. Read as Array of Arrays to find the real header row
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (jsonData.length === 0) return [];

    // 2. Find the header row (look for "Nome" or "Disciplina")
    let headerIndex = -1;
    for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
      const row = jsonData[i];
      const rowStr = row ? row.join(' ').toLowerCase() : '';
      if (rowStr.includes('nome') || rowStr.includes('disciplina') || rowStr.includes('matéria')) {
        headerIndex = i;
        break;
      }
    }

    // 3. Identify column indices based on the found header
    let nameIdx = 1, codeIdx = 0, hoursIdx = 2, syllabusIdx = 3; // Defaults

    if (headerIndex !== -1) {
      const headerRow = jsonData[headerIndex].map(String);
      // Helper: Find index but allow excluding terms (e.g. find "Disciplina" but NOT "Cód")
      const findIdx = (terms: string[], excludeTerms: string[] = []) => headerRow.findIndex(cell => 
        cell && 
        terms.some(t => cell.toLowerCase().includes(t)) &&
        !excludeTerms.some(et => cell.toLowerCase().includes(et))
      );

      const n = findIdx(['nome', 'disciplina', 'matéria', 'denominacao', 'componente'], ['cód', 'cod', 'code']);
      const c = findIdx(['code', 'código', 'codigo', 'cod']);
      const h = findIdx(['hours', 'horas', 'carga', 'ch', 'créditos']);
      const s = findIdx(['summary', 'syllabus', 'ementa', 'conteúdo']);

      if (n !== -1) nameIdx = n;
      if (c !== -1) codeIdx = c;
      if (h !== -1) hoursIdx = h;
      if (s !== -1) syllabusIdx = s;
    }

    // 4. Extract Data starting from the row AFTER the header
    const startRow = headerIndex === -1 ? 0 : headerIndex + 1;
    const courses: CourseData[] = [];

    for (let i = startRow; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      const name = row[nameIdx];
      const code = row[codeIdx];
      const hours = row[hoursIdx];
      const syllabus = row[syllabusIdx];

      // Skip invalid rows (headers repeated or empty names)
      if (!name || String(name).length < 3 || String(name).toLowerCase().includes('nome')) continue;

      courses.push({
        code: String(code || 'N/A').trim(),
        name: String(name).trim(),
        workload: Number(hours) || 0,
        syllabus: String(syllabus || '')
      });
    }

    return courses;
  } catch (error) {
    throw new Error(`Excel Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Reads text from a PDF file. 
 * If text is empty, it suggests using OCR.
 */
export const parsePdfToText = async (file: File, useOCR: boolean): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    if (useOCR) {
      // OCR Path: Slow but reads images
      // This is a more robust method: render PDF page to an image canvas first, then OCR the image.
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 3.0 }); // Higher scale for better quality
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          const { data: { text } } = await Tesseract.recognize(canvas, 'por');
          fullText += text + '\n';
        }
      }
      return fullText;
    } else {
      // Standard Path: Fast, reads text layers
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Improved extraction: Sort by position and detect lines
        // Sort items by Y (descending - top to bottom) then X (ascending - left to right)
        const items = (textContent.items as any[]).sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) > 5) return yDiff; 
          return a.transform[4] - b.transform[4];
        });

        let lastY = -1000;
        let pageText = '';

        for (const item of items) {
          const currentY = item.transform[5];
          const text = item.str.trim();
          if (!text) continue;

          // If Y changed significantly (> 6 units), it's a new line
          if (lastY !== -1000 && Math.abs(currentY - lastY) > 6) {
            pageText += '\n';
          } else if (pageText.length > 0 && !pageText.endsWith('\n')) {
             pageText += ' '; // Add space between words on same line
          }
          
          pageText += text;
          lastY = currentY;
        }

        fullText += pageText + '\n';
      }

      if (fullText.trim().length < 50) {
        throw new Error("PDF seems empty or scanned. Please try checking the 'Enable OCR' box.");
      }
      
      return fullText;
    }
  } catch (error) {
    throw new Error(`PDF Error: ${error instanceof Error ? error.message : 'Failed to parse PDF'}`);
  }
};
