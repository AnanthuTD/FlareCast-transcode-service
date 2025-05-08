import fs from "fs";
import env from "../env";
import { logger } from "../logger/logger";
import path from "path";
import { promisify } from "util";
import { extractAndConvertAudio } from "./convertToAudio";

const unlinkAsync = promisify(fs.unlink);

export async function generateTranscript(filePath: string): Promise<string> {
  try {
    let tempFilePath = filePath;
    const fileExtension = filePath.split(".").pop()?.toLowerCase();

    // Convert video or unsupported audio formats to .wav
    if (fileExtension === "webm" || fileExtension === "mp4") {
      const fileName = `${Date.now()}.wav`;
      tempFilePath = await extractAndConvertAudio({
        inputFile: filePath,
        outputDir: "temp_upload",
        fileName,
      });
    }

    // Determine the Content-Type based on file extension
    const tempExtension = tempFilePath.split(".").pop()?.toLowerCase();
    let contentType;
    switch (tempExtension) {
      case "mp3":
        contentType = "audio/mpeg";
        break;
      case "mp4":
        contentType = "audio/mp4";
        break;
      case "wav":
        contentType = "audio/wav";
        break;
      default:
        throw new Error(`Unsupported file format: ${tempExtension}. Supported formats: mp3, mp4, wav`);
    }

    // Read the audio file as a Buffer
    const data = fs.readFileSync(tempFilePath);

    // Send the audio file to the Hugging Face Whisper API
    const response = await fetch(
      "https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo",
      {
        headers: {
          Authorization: `Bearer ${env.HUGGINGFACE_TOKEN}`,
          "Content-Type": contentType,
        },
        method: "POST",
        body: data,
      }
    );

    // Check if the response is OK
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    // Parse the JSON response
    const result = await response.json();
    logger.info("transcript: ", result);

    // Clean up temporary file if it was created
    if (tempFilePath !== filePath) {
      await unlinkAsync(tempFilePath).catch((err) => logger.warn(`Failed to delete temp file ${tempFilePath}:`, err));
    }

    // Return the transcribed text or an empty string if not available
    return result.text || "";
  } catch (error) {
    logger.error("Error generating transcript:", error);
    throw error;
  }
}