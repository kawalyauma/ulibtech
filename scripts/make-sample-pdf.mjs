// Generates a small sample examination PDF used by tests and local demos.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';

const out = process.argv[2] ?? 'P6 Social Studies Term 2 Examination 2026.pdf';
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const questions = [
  'Name the largest lake in Uganda.',
  'Give two uses of the equator.',
  'Mention one economic activity carried out on Lake Victoria.',
  'Why is the Rwenzori region important for tourism?',
  'State two ways of conserving the environment.',
  'Name the district where the source of the Nile is found.',
];
for (let p = 0; p < 3; p++) {
  const page = doc.addPage([595, 842]);
  page.drawText('PRIMARY SIX END OF TERM II EXAMINATION 2026', { x: 60, y: 780, size: 15, font: bold, color: rgb(0.1, 0.2, 0.4) });
  page.drawText('SOCIAL STUDIES WITH RELIGIOUS EDUCATION', { x: 60, y: 755, size: 13, font: bold });
  page.drawText(`Page ${p + 1} of 3   Time: 2 hours 15 minutes`, { x: 60, y: 730, size: 10, font });
  questions.forEach((q, i) => page.drawText(`${p * 6 + i + 1}. ${q}`, { x: 60, y: 690 - i * 34, size: 12, font }));
}
doc.setTitle('P6 Social Studies Term 2 Examination 2026');
doc.setAuthor('EduShare Uganda');
fs.writeFileSync(out, await doc.save());
console.log(`Wrote ${out}`);
