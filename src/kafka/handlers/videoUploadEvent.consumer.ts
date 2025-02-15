import path from "path";
import { downloadInParts } from "../../aws/fetchFile";
import env from "../../env";
import { logger } from "../../logger/logger";
import { VideoProcessingService } from "../../services/videoProcessing.service";

export async function handleNewVideoEvent(value: {
	s3Key: string;
	videoId: string;
}) {
	logger.info("New video received for transcoding.", value);

	logger.info("⏳ downloading video in parts!");
	const destinationDirectory = path.join(process.cwd(), "processing-files");
	const filePath = path.join(destinationDirectory, value.s3Key);
	await downloadInParts(env.AWS_S3_BUCKET_NAME, value.s3Key, filePath, 5);

	if (!filePath) {
		logger.error("🔴 Failed to download video.");
		return;
	}

	// Process video
	await VideoProcessingService.processVideoFile(
		value.s3Key,
		value.videoId,
		filePath
	);
}
