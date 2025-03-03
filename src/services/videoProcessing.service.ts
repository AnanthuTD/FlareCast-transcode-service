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
	static async processVideoFile(
		fileName: string,
		videoId: string,
		filePath: string
	) {
		const inputVideo = filePath;
		const outputDirectory = path.join(process.cwd(), `hls-output/${videoId}`);
		const gcsPath = videoId;

		try {
			// ✅ Step 1: Process HLS (Blocking - Must Succeed)
			await createHLSAndUpload(inputVideo, outputDirectory, gcsPath);
			sendMessage(
				TOPICS.VIDEO_TRANSCODE_EVENT,
				JSON.stringify({ videoId, status: true })
			);
		} catch (error) {
			console.error(`HLS processing failed for ${videoId}:`, error);
			sendMessage(
				TOPICS.VIDEO_TRANSCODE_EVENT,
				JSON.stringify({
					videoId,
					status: false,
					error: (error as Error).message,
				})
			);

			removeFile(inputVideo);

			return; // 🚨 Stop further execution if HLS fails.
		}

		// ✅ Step 2: Process Thumbnails (Fire-and-Forget)
		const duration = await fixWebMDuration(
			inputVideo,
			path.join(process.cwd(), `remuxed_video`, `${randomUUID()}.webm`)
		);

		if (duration) {
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
						JSON.stringify({ videoId, status: true, duration })
					);
				})
				.catch((error) => {
					console.error(`Thumbnail generation failed for ${videoId}:`, error);
					sendMessage(
						TOPICS.THUMBNAIL_EVENT,
						JSON.stringify({
							videoId,
							status: false,
							duration,
							error: (error as Error).message,
						})
					);
				});
		}

		try {
			// ✅ Step 3: Process Video Summary (Blocking - If user has access)
			const result = await processVideo(inputVideo, videoId);
			if (!result) {
				sendMessage(
					TOPICS.VIDEO_SUMMARY_TITLE_EVENT,
					JSON.stringify({ videoId, status: false, error: "Processing failed" })
				);
			} else {
				if (result.title || result.description)
					sendMessage(
						TOPICS.VIDEO_SUMMARY_TITLE_EVENT,
						JSON.stringify({ videoId, status: true, ...result })
					);
				sendMessage(
					TOPICS.VIDEO_TRANSCRIPTION_EVENT,
					JSON.stringify({ videoId, status: true, ...result })
				);
			}
		} catch (error) {
			console.error(`Video summarization failed for ${videoId}:`, error);
			sendMessage(
				TOPICS.VIDEO_SUMMARY_TITLE_EVENT,
				JSON.stringify({
					videoId,
					status: false,
					error: (error as Error).message,
				})
			);
		}

		// ✅ Step 4: Send Video Processed Event (Fire-and-Forget)
		sendMessage(
			TOPICS.VIDEO_PROCESSED_EVENT,
			JSON.stringify({ videoId, status: true })
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
			console.error(`🟠 Failed to delete temporary file: ${filePath}`);
		});
}
