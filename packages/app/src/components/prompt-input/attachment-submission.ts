import { encodeFilePath } from "@/context/file/path"
import type { ImageAttachmentPart } from "@/context/prompt"
import { blobDataUrl } from "@/utils/draft-store"

const DOCUMENT_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

export function isDocumentAttachment(mime: string) {
  return DOCUMENT_ATTACHMENT_MIMES.has(mime.split(";", 1)[0]?.trim().toLowerCase() ?? "")
}

const absolute = (directory: string, path: string) => {
  if (path.startsWith("/")) return path
  if (/^[A-Za-z]:[\\/]/.test(path) || /^[A-Za-z]:$/.test(path)) return path
  if (path.startsWith("\\\\") || path.startsWith("//")) return path
  return `${directory.replace(/[\\/]+$/, "")}/${path}`
}

export function localAttachmentUrl(directory: string, path: string) {
  return `file://${encodeFilePath(absolute(directory, path))}`
}

type DataUrlReader = typeof blobDataUrl

export async function encodePromptAttachments(
  attachments: ImageAttachmentPart[],
  readDataUrl: DataUrlReader = blobDataUrl,
) {
  return Promise.all(
    attachments.map(async ({ blob, ...attachment }) => ({
      ...attachment,
      dataUrl: isDocumentAttachment(attachment.mime) ? "" : await readDataUrl(blob, attachment.mime),
    })),
  )
}

export async function commandAttachmentFiles(
  attachments: ImageAttachmentPart[],
  directory: string,
  readDataUrl: DataUrlReader = blobDataUrl,
) {
  const files: { uri: string; name: string }[] = []
  for (const attachment of attachments) {
    if (isDocumentAttachment(attachment.mime)) {
      if (attachment.sourcePath) {
        files.push({ uri: localAttachmentUrl(directory, attachment.sourcePath), name: attachment.filename })
      }
      continue
    }
    files.push({ uri: await readDataUrl(attachment.blob, attachment.mime), name: attachment.filename })
  }
  return files
}
