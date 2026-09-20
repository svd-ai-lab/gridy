import { deflateSync } from "node:zlib"
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js"

export async function zipBytes(entries: Record<string, string>) {
  const writer = new ZipWriter(new BlobWriter())
  for (const [name, text] of Object.entries(entries)) {
    await writer.add(name, new TextReader(text))
  }
  const blob = await writer.close()
  return new Uint8Array(await blob.arrayBuffer())
}

export function pdfBytes(content: string, options: { flate?: boolean } = {}) {
  const stream = Buffer.from(content, "latin1")
  const body = options.flate ? deflateSync(stream) : stream
  const filter = options.flate ? " /Filter /FlateDecode" : ""
  const objects = [
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"),
    Buffer.from(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
      "latin1",
    ),
    Buffer.concat([
      Buffer.from(`4 0 obj\n<< /Length ${body.length}${filter} >>\nstream\n`, "latin1"),
      body,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    ]),
    Buffer.from("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  ]
  const header = Buffer.from("%PDF-1.4\n", "latin1")
  const offsets: number[] = []
  const bodyBytes: Buffer[] = []
  let offset = header.length
  for (const object of objects) {
    offsets.push(offset)
    bodyBytes.push(object)
    offset += object.length
  }
  const xrefOffset = offset
  return new Uint8Array(
    Buffer.concat([
      header,
      ...bodyBytes,
      Buffer.from(
        `xref
0 ${objects.length + 1}
0000000000 65535 f
${offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}
trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`,
        "latin1",
      ),
    ]),
  )
}

export function documentDataUrl(mime: string, bytes: Uint8Array) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
}

export async function docxBytes(text: string) {
  return await zipBytes({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    "word/document.xml": `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>${xmlText(text)}</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `,
  })
}

export async function xlsxBytes(text: string) {
  return await zipBytes({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
      </Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
      </Relationships>`,
    "xl/workbook.xml": `
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Summary" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
    "xl/sharedStrings.xml": `
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
        <si><t>Metric</t></si>
        <si><t>Value</t></si>
        <si><t>${xmlText(text)}</t></si>
      </sst>`,
    "xl/worksheets/sheet1.xml": `
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>44</v></c></row>
        </sheetData>
      </worksheet>`,
  })
}

function xmlText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
