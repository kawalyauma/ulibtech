import { findLibreOffice } from './office';
import { findTesseract } from './ocr';

/**
 * Redis key where the worker publishes the document tools it can actually use. Conversion
 * and OCR run in the worker, so the admin status reads this instead of probing the API.
 */
export const WORKER_CAPABILITIES_KEY = 'es:worker:capabilities';

export interface DocumentCapabilities {
  officePreviews: boolean;
  ocr: boolean;
  checkedAt: string;
}

export async function detectDocumentCapabilities(): Promise<DocumentCapabilities> {
  const [libreoffice, tesseract] = await Promise.all([findLibreOffice(), findTesseract()]);
  return {
    officePreviews: Boolean(libreoffice),
    ocr: process.env.OCR_ENABLED === 'true' && Boolean(tesseract),
    checkedAt: new Date().toISOString(),
  };
}
