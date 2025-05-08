import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { logger } from "../logger/logger";

ffmpeg.setFfmpegPath(process.env.FFMPEG_LOCATION || "ffmpeg");

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
			.noVideo() 
			.audioFrequency(16000) 
			.audioChannels(1) 
			.audioCodec("pcm_s16le") 
			.audioFilters([
				"loudnorm",
				"silenceremove=start_periods=1:start_threshold=-50dB:start_silence=1",
			])
			.outputOptions("-map_metadata -1") 
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
