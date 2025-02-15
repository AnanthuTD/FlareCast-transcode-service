import { GoogleGenerativeAI } from "@google/generative-ai";
import env from "../env";
import { logger } from "../logger/logger";

interface SummaryAndTitle {
	title: string;
	summary: string;
}

export async function generateSummaryAndTitle(
	transcript: string
): Promise<SummaryAndTitle | null> {
	if (!transcript || transcript.trim() === "") {
		logger.error("🔴 Transcript is empty.");
		return null;
	}

	try {
		const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
		const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // "gemini-pro"

		const prompt = `Given the following transcript:

        ${transcript}

        Generate a concise title and a short summary of the content.
        Return your output as JSON, with the format: { "title": <the generated title>, "summary": <the generated summary> }. Do not add extra text before or after the JSON, just the raw JSON.
    `;

		const result = await model.generateContent(prompt);

		if (!result || !result.response || !result.response.text()) {
			logger.error("🔴 Unexpected API response:", result);
			return null;
		}

		const responseText = result.response.text();
		logger.info("raw response: ", responseText);
		// Attempt to parse JSON, handle failures gracefully
		try {
			const jsonResult: SummaryAndTitle = JSON.parse(responseText);
			return jsonResult;
		} catch (jsonError) {
			logger.error(
				"Error parsing JSON:",
				jsonError,
				" Raw Response: ",
				responseText
			);
			// Sometimes the model outputs a poorly formatted json, let's try to clean it up

			try {
				const cleanResponse = responseText
					.replace(/(\s*\\n\s*)/g, "")
					.replace(/(\n)/g, "")
					.replace("```json", "")
					.replace("```", "");
				logger.info("cleaned up: ", cleanResponse);
				const jsonResult: SummaryAndTitle = JSON.parse(cleanResponse);
				return jsonResult;
			} catch (cleanUpError) {
				logger.error("🔴 Could not cleanup response", cleanUpError);
				return null;
			}
		}
	} catch (error) {
		logger.error("🔴 Error generating summary and title:", error);
		return null; // Or throw the error, depending on your application needs
	}
}
