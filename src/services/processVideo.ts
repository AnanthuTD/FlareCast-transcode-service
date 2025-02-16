import { generateTranscript } from "./huggingface";
import { generateSummaryAndTitle } from "../gemini/generateSummary";
import { logger } from "../logger/logger";

export const processVideo = async (inputVideo: string, videoId: string) => {
	try {
		logger.info("⚙️ Generating video transcriptions...");
		const transcription = await generateTranscript(inputVideo);
		logger.info("⚙️ Generating video transcriptions success ✅");

		if (transcription) {
			logger.info("⚙️ Generating summary and title...");
			const result = await generateSummaryAndTitle(transcription);
			if (result) {
				logger.info(result.title);
				logger.info(result.summary);

				logger.info("✅ Generated Title and Summary:", result);

				return {
					title: result.title,
					description: result.summary,
					transcription,
				};
			} else {
				logger.error("🔴 Failed to generate title and summary.");
				return { transcription };
			}
		} else {
			logger.error("🔴 Failed to transcribe audio.");
		}
	} catch (error) {
		logger.error("🔴 Error processing video:", error);
	}
};
