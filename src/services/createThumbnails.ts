import ffmpeg from "fluent-ffmpeg";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { fixWebMDuration } from "./fixDuration";
import { logger } from "../logger/logger";
import { uploadDirectoryToS3 } from "../aws/uploadToS3";
import env from "../env";

export const createThumbnails = async (
	videoPath: string,
	thumbnailOutputDir: string,
	gcsPath: string,
	fileName: string
) => {
	try {
		const videoDuration = await fixWebMDuration(
			videoPath,
			path.join(process.cwd(), `remuxed_video`, `${randomUUID()}.webm`)
		);

		if (!videoDuration) {
			logger.info(
				"🔴 Unable to fix video duration. Skipping thumbnail generation."
			);
			return;
		}

		/* prisma.video
			.update({
				where: {
					id: fileName,
				},
				data: {
					duration: videoDuration,
				},
			})
			.then(() => {
				console.log("Updated video duration in DB: ", videoDuration);
			})
			.catch((err) =>
				console.error(
					`Failed to update video duration in db (${videoDuration})`,
					err
				)
			); */

		const videoDurationNum = parseFloat(videoDuration);

		if (!fs.existsSync(thumbnailOutputDir)) {
			fs.mkdirSync(thumbnailOutputDir, { recursive: true });
		}

		const timemarks = Array.from(
			{ length: Math.max(Math.floor(videoDurationNum / 10), 1) },
			(_, i) => `${i * 10}`
		);

		logger.info("====timemarks===", timemarks, videoDuration);

		ffmpeg(videoPath)
			.on("filenames", function (filenames) {
				logger.info("screenshots are " + filenames.join(", "));
				generateVTTFile(filenames, gcsPath, thumbnailOutputDir);
			})
			.on("end", () => {
				logger.info(
					"✅ Thumbnails generated successfully.\n⚙️ Now uploading thumbnails to GCS..."
				);
				uploadDirectoryToS3(thumbnailOutputDir, gcsPath + "/thumbnails");
			})
			.on("error", (err) => {
				logger.error("🔴 Error generating thumbnails:", err);
			})
			.screenshots({
				count: Math.floor(videoDurationNum / 10),
				timemarks,
				filename: "thumb%0000i.jpg",
				folder: thumbnailOutputDir,
			});
	} catch (err) {
		logger.error("🔴 Error creating thumbnails:", err);
	}
};

function generateVTTFile(
	filenames: string[],
	gcsPath: string,
	thumbnailOutputDir: string
) {
	const vttContent: string[] = [];
	const timeDiff = 10;

	const timemarks = filenames.map((fileNames, index) => index * 10);

	const thumbnailBaseURL = `${env.AWS_CLOUDFRONT_URL}/${gcsPath
		.split("/")
		.at(-1)}/thumbnails/`;

	filenames.forEach((filename, index) => {
		const time = timemarks[index];
		const timeStart = formatTime(time);
		const timeEnd = formatTime(time + timeDiff);

		const thumbnailURL = `${thumbnailBaseURL}${filename}#xywh=0,0,427,240`;

		vttContent.push(`${index + 1}`);
		vttContent.push(`${timeStart} --> ${timeEnd}`);
		vttContent.push(thumbnailURL);
		vttContent.push("");
	});

	const vttFileContent = `WEBVTT\n\n${vttContent.join("\n")}`;

	// Write the VTT content to a file
	const vttFilePath = path.join(thumbnailOutputDir, "thumbnails.vtt");
	fs.writeFileSync(vttFilePath, vttFileContent);

	logger.info("✅ VTT file generated: " + vttFilePath);
}

// Function to format time in VTT format (HH:MM:SS.MMM)
function formatTime(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;
	const milliseconds = Math.round((remainingSeconds % 1) * 1000);

	const formattedHours = String(hours).padStart(2, "0");
	const formattedMinutes = String(minutes).padStart(2, "0");
	const formattedSeconds = String(Math.floor(remainingSeconds)).padStart(
		2,
		"0"
	);
	const formattedMilliseconds = String(milliseconds).padStart(3, "0");

	return `${formattedHours}:${formattedMinutes}:${formattedSeconds}.${formattedMilliseconds}`;
}
