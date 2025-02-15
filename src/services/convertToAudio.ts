import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

// Function to ensure the output directory exists
function ensureDirectoryExists(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		console.log(`📁 Created output directory: ${dir}`);
	}
}

export async function extractAndConvertAudio({ inputFile, outputDir, fileName }) {
	const outputFile = path.join(outputDir, fileName);

	try {
		ensureDirectoryExists(outputDir); // Ensure output folder exists

		ffmpeg()
			.input(inputFile)
			.noVideo() // Remove video, keep only audio
			.audioFrequency(16000) // Convert sample rate to 16 kHz (Whisper requirement)
			.audioChannels(1) // Convert to mono
			.audioCodec("pcm_s16le") // Use PCM 16-bit little-endian format (best for Whisper)
			.audioFilters([
				"loudnorm", // Normalize volume for better transcription
				"silenceremove=start_periods=1:start_threshold=-50dB:start_silence=1", // Trim silence
			])
			.output(outputFile)
			.on("end", () => {
				console.log(`✅ Audio extraction & conversion finished: ${outputFile}`);
			})
			.on("error", (err) => {
				console.error("❌ Error during conversion:", err.message);
			})
			.run();
	} catch (error) {
		console.error("❌ Unexpected error:", error);
	}
}

// extractAndConvertAudio();
