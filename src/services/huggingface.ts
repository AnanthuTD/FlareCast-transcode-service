import fs from "fs";
import env from "../env";
import { logger } from "../logger/logger";
// import { extractAndConvertAudio } from "./convertToAudio";
// import { randomUUID } from "crypto";

export async function generateTranscript(filePath: string): Promise<string> {
	/* extractAndConvertAudio({
		inputFile: filePath,
		fileName: `${randomUUID()}.wav`,
		outputDir: "outputAudio",
	}); */
	const data = fs.readFileSync(filePath);
	const response = await fetch(
		// "https://api-inference.huggingface.co/models/openai/whisper-tiny",
		"https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo",
		{
			headers: {
				Authorization: `Bearer ${env.HUGGINGFACE_TOKEN}`,
				"Content-Type": "application/json",
			},
			method: "POST",
			body: data,
		}
	);
	const result = await response.json();
	logger.info("transcript: ", result);
	return result.text || "";
}

/* generateTranscript("./temp_upload/0ae083af-1a02-46ea-9db1-a78bf4d6c9d2-67978c4f.webm")
	.then((transcript) => {
		console.log(transcript);
	})
	.catch((e) => console.error(e)); */
