import { open } from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import { ALLOWED_FILE_TYPES, type AllowedFileKind, fileExtension } from '@edushare/shared';

export interface DetectedFileType {
  kind: AllowedFileKind;
  mime: string;
  extension: string;
  label: string;
}

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

const HEAD_BYTES = 64 * 1024;

export async function readHead(path: string, bytes = HEAD_BYTES): Promise<Buffer> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function looksLikeText(head: Buffer): boolean {
  if (head.length === 0) return false;
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, Math.min(head.length, 16_000)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Determines a file's real type from its signature (magic bytes). The extension is only
 * used to disambiguate container formats (legacy Office CFB files) and must agree with the
 * detected type; mismatches are rejected.
 */
export async function detectFileType(head: Buffer, originalName: string): Promise<DetectedFileType> {
  const ext = fileExtension(originalName);
  const detected = await fileTypeFromBuffer(head);

  let kind: AllowedFileKind | null = null;
  if (detected) {
    switch (detected.ext) {
      case 'pdf':
        kind = 'pdf';
        break;
      case 'docx':
        kind = 'docx';
        break;
      case 'pptx':
        kind = 'pptx';
        break;
      case 'xlsx':
        kind = 'xlsx';
        break;
      case 'odt':
        kind = 'odt';
        break;
      case 'jpg':
        kind = 'jpg';
        break;
      case 'png':
        kind = 'png';
        break;
      case 'webp':
        kind = 'webp';
        break;
      case 'cfb':
        // Legacy Office binary formats share the Compound File container.
        if (ext === 'doc') kind = 'doc';
        else if (ext === 'xls') kind = 'xls';
        else if (ext === 'ppt') kind = 'ppt';
        break;
      default:
        kind = null;
    }
  } else if (ext === 'txt' && looksLikeText(head)) {
    kind = 'txt';
  }

  if (!kind) {
    throw new UnsupportedFileError(
      detected
        ? `Files of type "${detected.ext}" are not allowed.`
        : 'The file type could not be verified. Upload PDF, Word, PowerPoint, Excel, images or plain text.',
    );
  }
  const info = ALLOWED_FILE_TYPES[kind];
  if (ext && !(info.extensions as readonly string[]).includes(ext)) {
    throw new UnsupportedFileError(
      `The file extension ".${ext}" does not match its content (${info.label}). Rename the file or upload the correct document.`,
    );
  }
  return { kind, mime: info.mime, extension: info.extensions[0], label: info.label };
}

export function isPreviewable(kind: string): 'pdf' | 'image' | null {
  if (kind === 'pdf') return 'pdf';
  if (kind === 'jpg' || kind === 'png' || kind === 'webp') return 'image';
  return null;
}
