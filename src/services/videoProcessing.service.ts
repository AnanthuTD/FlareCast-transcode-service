import path from "path";
import { createHLSAndUpload } from "../aws/uploadToS3";
import { createThumbnails } from "./createThumbnails";
import { processVideo } from "./processVideo";
import { sendMessage } from "../kafka/producer";
import { TOPICS } from "../kafka/topics";
import { unlink } from "fs/promises";
import { fixWebMDuration } from "./fixDuration";
import { randomUUID } from "crypto";

export class VideoProcessingService {
	static async processVideoFile({
		fileName,
		videoId,
		filePath,
		aiFeature = true,
		transcode = true,
	}: {
		fileName: string;
		videoId: string;
		filePath: string;
		aiFeature?: boolean;
		transcode?: boolean;
	}) {
		const inputVideo = filePath;
		const outputDirectory = path.join(process.cwd(), `hls-output/${videoId}`);
		const gcsPath = videoId;

		if (transcode)
			try {
				// Step 1: Process HLS (Blocking - Must Succeed)
				sendMessage(
					TOPICS.VIDEO_TRANSCODE_EVENT,
					JSON.stringify({ videoId, status: "" }) // Notify start
				);
				await createHLSAndUpload(inputVideo, outputDirectory, gcsPath);
				sendMessage(
					TOPICS.VIDEO_TRANSCODE_EVENT,
					JSON.stringify({ videoId, status: "SUCCESS" })
				);
			} catch (error) {
				console.error(`HLS  FAILED for ${videoId}:`, error);
				sendMessage(
					TOPICS.VIDEO_TRANSCODE_EVENT,
					JSON.stringify({
						videoId,
						status: "FAILED",
						error: (error as Error).message,
					})
				);
				removeFile(inputVideo);
				return; // Stop if HLS fails
			}

		// Step 2: Process Thumbnails (Fire-and-Forget)
		const duration = await fixWebMDuration(
			inputVideo,
			path.join(process.cwd(), `remuxed_video`, `${randomUUID()}.webm`)
		);

		if (duration) {
			sendMessage(
				TOPICS.THUMBNAIL_EVENT,
				JSON.stringify({ videoId, status: "", duration }) // Notify start
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
				// Step 3: Process Video Summary (Blocking - If user has access)
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

		// Step 4: Send Video Processed Event (Fire-and-Forget)
		sendMessage(
			TOPICS.VIDEO_PROCESSED_EVENT,
			JSON.stringify({ videoId, status: "SUCCESS" })
		);

		removeFile(inputVideo);
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
