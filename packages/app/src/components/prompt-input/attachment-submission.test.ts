import { describe, expect, test } from "bun:test"
import type { ImageAttachmentPart } from "@/context/prompt"
import { commandAttachmentFiles, encodePromptAttachments } from "./attachment-submission"

const documents: ImageAttachmentPart[] = [
  {
    type: "image",
    id: "pdf",
    filename: "paper.pdf",
    sourcePath: "C:\\docs\\paper.pdf",
    mime: "application/pdf",
    blob: { id: "RAW_DOCUMENT_BYTES", url: "blob:pdf" },
  },
  {
    type: "image",
    id: "docx",
    filename: "report.docx",
    sourcePath: "C:\\docs\\report.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    blob: { id: "RAW_DOCUMENT_BYTES", url: "blob:docx" },
  },
  {
    type: "image",
    id: "xlsx",
    filename: "data.xlsx",
    sourcePath: "C:\\docs\\data.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    blob: { id: "RAW_DOCUMENT_BYTES", url: "blob:xlsx" },
  },
]

describe("document attachment submission", () => {
  test("does not read or embed PDF, DOCX, or XLSX blob data", async () => {
    let reads = 0
    const read = async () => {
      reads += 1
      return "data:application/octet-stream;base64,UkFXX0RPQ1VNRU5UX0JZVEVT"
    }

    const prompt = await encodePromptAttachments(documents, read)
    const command = await commandAttachmentFiles(documents, "C:\\workspace", read)

    expect(reads).toBe(0)
    expect(prompt.every((attachment) => attachment.dataUrl === "" && !("blob" in attachment))).toBe(true)
    expect(command.map((file) => file.uri)).toEqual([
      "file:///C:/docs/paper.pdf",
      "file:///C:/docs/report.docx",
      "file:///C:/docs/data.xlsx",
    ])
    expect(JSON.stringify({ prompt, command })).not.toContain("RAW_DOCUMENT_BYTES")
  })

  test("still converts ordinary image blobs at submission time", async () => {
    let reads = 0
    const image: ImageAttachmentPart = {
      type: "image",
      id: "image",
      filename: "plot.png",
      mime: "image/png",
      blob: { id: "image-bytes", url: "blob:image" },
    }
    const prompt = await encodePromptAttachments([image], async () => {
      reads += 1
      return "data:image/png;base64,UE5H"
    })

    expect(reads).toBe(1)
    expect(prompt[0]?.dataUrl).toBe("data:image/png;base64,UE5H")
  })
})
