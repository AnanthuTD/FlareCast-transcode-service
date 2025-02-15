import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "../logger/logger";

export async function createHLS(
	inputPath,
	outputDir,
	resolutions = [480, 720]
) {
	try {
		fs.mkdirSync(outputDir, { recursive: true });

		for (const resolution of resolutions) {
			const outputPath = path.join(outputDir, `${resolution}p.m3u8`);
			const segmentFilename = path.join(outputDir, `${resolution}p_%03d.ts`);
			const FFMPEG_LOCATION = process.env.FFMPEG_LOCATION; // Ensure this is set correctly

			const command = `ffmpeg -i "${inputPath}" -vf scale="trunc(oh*a/2)*2:${resolution}" -c:v libx264 -b:v ${getBitrate(
				resolution
			)}k -c:a aac -ar 44100 -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${segmentFilename}" "${outputPath}"`;

			logger.info(`Executing command for ${resolution}p: ${command}`);

			await new Promise((resolve, reject) => {
				exec(command, (error, stdout, stderr) => {
					if (error) {
						logger.error(`Error for ${resolution}p:`, error);
						logger.error(`Stderr for ${resolution}p:`, stderr);
						reject(error);
					} else {
						logger.info(`Finished processing ${resolution}p.`);
						resolve();
					}
				});
			});
		}

		logger.info("All resolutions processed successfully!");
		return outputDir;
	} catch (err) {
		logger.error("Error creating HLS:", err);
		throw err;
	}
}

const getBitrate = (resolution) => {
	switch (resolution) {
		case 480:
			return 800;
		case 720:
			return 2000;
		case 1080:
			return 2500; // 4000
		default:
			return 800;
	}
};

export function createMasterPlaylist(gcsPath, resolutions) {
  let playlist = "#EXTM3U\n";
  resolutions.forEach((res) => {
    const bandwidth = getBitrate(res) * 1000; // Bitrate in bits/s
    playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=1280x${res},CODECS="avc1.42E01E,mp4a.40.2"\n`; // Adjust codecs if needed
    // playlist += `${path.join(gcsPath, `${res}p.m3u8`)}\n`;
    playlist += `${res}p.m3u8\n`;
  });
  return playlist;
}
