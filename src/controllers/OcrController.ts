import { Controller, Post, UploadedFile } from "routing-controllers";
import { ImageAnnotatorClient } from "@google-cloud/vision";

// Creates a client (uses GOOGLE_APPLICATION_CREDENTIALS from the environment)
const client = new ImageAnnotatorClient();

@Controller("/ocr")
export class OcrController {
  @Post("/")
  async extractText(
    @UploadedFile("file") file: Express.Multer.File,
  ): Promise<{ text: string }> {
    if (file.mimetype === "application/pdf") {
      return { text: await this.extractPdfText(file.buffer) };
    }
    // Performs text detection on the uploaded image
    const [result] = await client.textDetection(file.buffer);
    console.log("Text detection result:", result);
    const detections = result.textAnnotations ?? [];
    console.log("Detected text:", detections.map((d) => d.description));
    const text = detections.map((d) => d.description ?? "").join("\n");
    return { text };
  }

  // PDFs/TIFFs use document text detection: one response per page, and the
  // extracted text lives in fullTextAnnotation.text (textDetection is image-only).
  private async extractPdfText(buffer: Buffer): Promise<string> {
    const [result] = await client.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            content: buffer.toString("base64"),
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    });
    const fileResponses = result.responses ?? [];
    return fileResponses
      .flatMap((fileRes) => fileRes.responses ?? [])
      .map((page) => page.fullTextAnnotation?.text ?? "")
      .join("\n");
  }
}
