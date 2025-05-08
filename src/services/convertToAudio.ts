import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { logger } from "../logger/logger"; // Reuse the logger from generateTranscript

// Ensure FFmpeg is configured
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

// Function to ensure the output directory exists
function ensureDirectoryExists(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		logger.info(`Created output directory: ${dir}`);
	}
}

export async function extractAndConvertAudio({
	inputFile,
	outputDir,
	fileName,
}: {
	inputFile: string;
	outputDir: string;
	fileName: string;
}): Promise<string> {
	// Validate inputs
	if (!fs.existsSync(inputFile)) {
		throw new Error(`Input file does not exist: ${inputFile}`);
	}
	if (!fileName.endsWith(".wav")) {
		throw new Error(`Output file must have .wav extension: ${fileName}`);
	}

	const outputFile = path.join(outputDir, fileName);
	ensureDirectoryExists(outputDir);

	return new Promise((resolve, reject) => {
		ffmpeg(inputFile)
			.noVideo() // Remove video, keep only audio
			.audioFrequency(16000) // 16 kHz for Whisper
			.audioChannels(1) // Mono
			.audioCodec("pcm_s16le") // PCM 16-bit for WAV
			.audioFilters([
				"loudnorm", // Normalize volume
				"silenceremove=start_periods=1:start_threshold=-50dB:start_silence=1", // Trim silence
			])
			.outputOptions("-map_metadata -1") // Strip metadata to avoid UTF-8 issues
			.output(outputFile)
			.on("end", () => {
				logger.info(`Audio extraction & conversion finished: ${outputFile}`);
				resolve(outputFile);
			})
			.on("error", (err) => {
				logger.error(`Error during conversion: ${err.message}`);
				reject(new Error(`FFmpeg conversion failed: ${err.message}`));
			})
			.run();
	});
}
