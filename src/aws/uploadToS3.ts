import fs from "fs/promises";
import path from "path";
import { PutObjectCommand, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { env } from "process";
import { createHLS, createMasterPlaylist } from "../ffmpeg/transcode";
import { logger } from "../logger/logger";
import s3Client from "./s3";

const BUCKET_NAME = env.AWS_S3_BUCKET_NAME;
const RESOLUTIONS = [480, 720];

export async function createHLSAndUpload(inputPath: string, outputDir: string, s3Path: string) {
    try {
        // 1. Create HLS Streams
        await createHLS(inputPath, outputDir);

        // 2. Upload to S3
        await uploadDirectoryToS3(outputDir, s3Path);

        // 3. Create Master Playlist (for Adaptive Bitrate)
        const masterPlaylistContent = createMasterPlaylist(s3Path, RESOLUTIONS);
        const masterPlaylistPath = path.join(outputDir, "master.m3u8");
        await fs.writeFile(masterPlaylistPath, masterPlaylistContent);
        await uploadFileToS3(masterPlaylistPath, `${s3Path}/master.m3u8`);

        // 4. Cleanup local files (Optional but recommended)
        // await fs.rm(outputDir, { recursive: true, force: true });

        logger.info("🟢 HLS creation and upload complete!");
    } catch (error) {
        logger.error("🔴 Error processing HLS and upload:", error);
        throw error;
    }
}

export async function uploadDirectoryToS3(localDir: string, s3Path: string) {
    const files = await fs.readdir(localDir);
    const uploadPromises = files.map(async (file) => {
        const localFilePath = path.join(localDir, file);
        const s3FilePath = `${s3Path}/${file}`;
        await uploadFileToS3(localFilePath, s3FilePath);
    });
    await Promise.all(uploadPromises);
}

export async function uploadFileToS3(localFilePath: string, s3Key: string) {
    const fileContent = await fs.readFile(localFilePath);
    
    const params: PutObjectCommandInput = {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileContent,
        // Add appropriate Content-Type for HLS files
        ContentType: getContentType(path.extname(s3Key))
    };

    try {
        await s3Client.send(new PutObjectCommand(params));
        logger.info(`🟢 Uploaded ${s3Key} to s3://${BUCKET_NAME}/${s3Key}`);
    } catch (error) {
        logger.error(`🔴 Error uploading ${s3Key}:`, error);
        throw error;
    }
}

function getContentType(extension: string): string {
    const typeMap: { [key: string]: string } = {
        '.m3u8': 'application/vnd.apple.mpegurl',
        '.ts': 'video/MP2T',
        '.mp4': 'video/mp4'
    };
    return typeMap[extension] || 'application/octet-stream';
}