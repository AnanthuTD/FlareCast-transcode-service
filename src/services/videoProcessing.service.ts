import path from "path";
import { createHLSAndUpload } from "../aws/uploadToS3";
import { createThumbnails } from "./createThumbnails";
import { processVideo } from "./processVideo";
import { sendMessage } from "../kafka/producer";
import { TOPICS } from "../kafka/topics";
import { unlink } from "fs/promises";
import { fixWebMDuration } from "./fixDuration";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { logger } from "../logger/logger";

// Set FFmpeg path for fluent-ffmpeg
ffmpeg.setFfmpegPath(process.env.FFMPEG_LOCATION || "ffmpeg");

// Function to get video duration in seconds using fluent-ffmpeg
async function getVideoDuration(filePath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(new Error(`ffprobe error: ${err.message}`));
			} else {
				const duration = metadata.format.duration; // Duration in seconds
				if (typeof duration === "number") {
					resolve(duration);
				} else {
					reject(new Error("Duration not found in metadata"));
				}
			}
		});
	});
}

export class VideoProcessingService {
	static async processVideoFile({
		fileName,
		videoId,
		filePath,
		aiFeature = true,
		transcode = true,
		type = "VOD",
	}: {
		fileName: string;
		videoId: string;
		filePath: string;
		aiFeature?: boolean;
		transcode?: boolean;
		type: "LIVE" | "VOD";
	}) {
		logger.info("============ started video processing =================");

		const inputVideo = filePath;
		const outputDirectory = path.join(process.cwd(), `hls-output/${videoId}`);
		const gcsPath = videoId;

		if (transcode) {
			try {
				logger.info("============ started transcoding =================");

				sendMessage(
					TOPICS.VIDEO_TRANSCODE_EVENT,
					JSON.stringify({ videoId, status: "PROCESSING" }) // Notify start
				);
				await createHLSAndUpload(inputVideo, outputDirectory, gcsPath);
				sendMessage(
					TOPICS.VIDEO_TRANSCODE_EVENT,
					JSON.stringify({ videoId, status: "SUCCESS" })
				);
			} catch (error) {
				console.error(`HLS FAILED for ${videoId}:`, error);
				sendMessage(
					TOPICS.VIDEO_TRANSCODE_EVENT,
					JSON.stringify({
						videoId,
						status: "FAILED",
						error: (error as Error).message,
					})
				);
				// removeFile(inputVideo);
				return;
			}
		}

		// Step 2: Get Video Duration and Process Thumbnails
		let duration: string | undefined;

		try {
			if (type !== "LIVE") {
				// For live streams, fix WebM duration if needed
				const remuxedPath = path.join(
					process.cwd(),
					`remuxed_video`,
					`${randomUUID()}.webm`
				);
				duration = await fixWebMDuration(inputVideo, remuxedPath);
			} else {
				// For VOD, get duration directly with fluent-ffmpeg
				const durationSeconds = await getVideoDuration(inputVideo);
				duration = durationSeconds.toString(); // Convert to string for consistency
			}
		} catch (error) {
			console.error(`Failed to get duration for ${videoId}:`, error);
		}

		logger.debug("Duration: " + duration);

		if (duration) {
			sendMessage(
				TOPICS.THUMBNAIL_EVENT,
				JSON.stringify({ videoId, status: "PROCESSING", duration }) // Notify start
			);
			createThumbnails({
				videoPath: inputVideo,
				thumbnailOutputDir: path.join(outputDirectory, "thumbnails"),
				gcsPath,
				fileName: videoId,
				duration,
			})
				.then(() => {
					sendMessage(
						TOPICS.THUMBNAIL_EVENT,
						JSON.stringify({ videoId, status: "SUCCESS", duration })
					);
				})
				.catch((error) => {
					console.error(`Thumbnail generation FAILED for ${videoId}:`, error);
					sendMessage(
						TOPICS.THUMBNAIL_EVENT,
						JSON.stringify({
							videoId,
							status: "FAILED",
							duration,
							error: (error as Error).message,
						})
					);
				});
		}

		if (aiFeature) {
			try {
				sendMessage(
					TOPICS.VIDEO_SUMMARY_TITLE_EVENT,
					JSON.stringify({ videoId, status: "PROCESSING" })
				);
				const result = await processVideo(inputVideo, videoId);
				if (!result) {
					sendMessage(
						TOPICS.VIDEO_SUMMARY_TITLE_EVENT,
						JSON.stringify({
							videoId,
							status: "FAILED",
							error: "FAILED",
						})
					);
				} else {
					if (result.title || result.description) {
						sendMessage(
							TOPICS.VIDEO_SUMMARY_TITLE_EVENT,
							JSON.stringify({ videoId, status: "SUCCESS", ...result })
						);
					}
					sendMessage(
						TOPICS.VIDEO_TRANSCRIPTION_EVENT,
						JSON.stringify({ videoId, status: "SUCCESS", ...result })
					);
				}
			} catch (error) {
				console.error(`Video summarization FAILED for ${videoId}:`, error);
				sendMessage(
					TOPICS.VIDEO_SUMMARY_TITLE_EVENT,
					JSON.stringify({
						videoId,
						status: "FAILED",
						error: (error as Error).message,
					})
				);
			}
		}

		sendMessage(
			TOPICS.VIDEO_PROCESSED_EVENT,
			JSON.stringify({ videoId, status: "SUCCESS" })
		);

		// removeFile(inputVideo);
	}
}

function removeFile(filePath: string) {
	unlink(filePath)
		.then(() => {
			console.log(`✔️ Deleted temporary file: ${filePath}`);
		})
		.catch(() => {
			console.error(`🟠 FAILED to delete temporary file: ${filePath}`);
		});
}
