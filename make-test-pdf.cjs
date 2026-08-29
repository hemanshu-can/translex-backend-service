const fs = require("fs");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

const stream =
  "BT /F1 24 Tf 72 720 Td (Hello World from PDF OCR Test) Tj ET";

let pdf = "%PDF-1.4\n";
const offsets = [];
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(pdf, "ascii"));
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}
offsets.push(Buffer.byteLength(pdf, "ascii"));
pdf += `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream\nendobj\n`;

const xrefStart = Buffer.byteLength(pdf, "ascii");
pdf += `xref\n0 ${objects.length + 2}\n0000000000 65535 f \n`;
for (const off of offsets) {
  pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 2} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

fs.writeFileSync(process.argv[2], pdf, "ascii");
console.log(`Wrote ${Buffer.byteLength(pdf, "ascii")} bytes to ${process.argv[2]}`);
