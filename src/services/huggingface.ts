import fs from "fs";
import env from "../env";
import { logger } from "../logger/logger";

export async function generateTranscript(filePath: string): Promise<string> {
	try {
		const data = fs.readFileSync(filePath);

		const fileExtension = filePath.split(".").pop()?.toLowerCase();
		logger.debug("fileExtension: ", fileExtension);

		let contentType;
		switch (fileExtension) {
			case "webm":
				contentType = "audio/webm";
				break;
			case "mp3":
				contentType = "audio/mpeg";
				break;
			case "wav":
				contentType = "audio/wav";
				break;
			default:
				throw new Error(`Unsupported file format: ${fileExtension}`);
		}

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

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API request failed: ${response.status} ${errorText}`);
		}

		const result = await response.json();
		logger.info("transcript: ", result);

		return result.text || "";
	} catch (error) {
		logger.error("Error generating transcript:", error);
		throw error;
	}
}
