import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import { pipeline } from "stream";
import { promisify } from "util";
import s3Client from "./s3";
import path from "path";
import { ensureDirectoryExists } from "../helpers/fs.helper";

const pipe = promisify(pipeline);

export async function downloadInParts(
	bucketName: string,
	objectKey: string,
	outputFilePath: string,
	partSizeMB: number = 5
): Promise<string | void> {
	try {
		await ensureDirectoryExists(outputFilePath);

		// Step 1: Get Object Size
		const headCommand = new HeadObjectCommand({
			Bucket: bucketName,
			Key: objectKey,
		});
		const headResponse = await s3Client.send(headCommand);
		const totalSize: number | undefined = headResponse.ContentLength;

		if (totalSize === undefined) {
			throw new Error("Unable to retrieve object size");
		}

		console.log(`Total file size: ${totalSize} bytes`);

		const partSize = partSizeMB * 1024 * 1024; // Convert MB to Bytes
		const partCount = Math.ceil(totalSize / partSize);
		console.log(`Downloading in ${partCount} parts...`);

		// Step 2: Download parts concurrently
		const downloadPromises: Promise<string>[] = [];
		const partsDir = path.join(path.dirname(outputFilePath), "parts");
		for (let i = 0; i < partCount; i++) {
			const start = i * partSize;
			const end = Math.min(start + partSize - 1, totalSize - 1);
			downloadPromises.push(
				downloadPart(bucketName, objectKey, start, end, i, partsDir)
			);
		}

		const parts: string[] = await Promise.all(downloadPromises);

		// Step 3: Merge all parts into a single file
		const writeStream = fs.createWriteStream(outputFilePath, { flags: "w" });

		// Use a single pipeline to concatenate all parts
		for (const partPath of parts) {
			const readStream = fs.createReadStream(partPath);
			await new Promise<void>((resolve, reject) => {
				readStream.pipe(writeStream, { end: false }); // Don't close writeStream yet
				readStream.on("end", () => resolve());
				readStream.on("error", (err) => reject(err));
			});
			fs.unlinkSync(partPath); // Delete temporary part file after piping
		}

		// Close the writeStream after all parts are written
		await new Promise<void>((resolve, reject) => {
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
			writeStream.end();
		});

		console.log(`Download complete: ${outputFilePath}`);
		return outputFilePath;
	} catch (error) {
		console.error("Error downloading file:", error);
		throw error; // Re-throw to handle upstream
	}
}

async function downloadPart(
	bucketName: string,
	objectKey: string,
	start: number,
	end: number,
	partIndex: number,
	destinationDir: string
): Promise<string> {
	const range = `bytes=${start}-${end}`;
	console.log(`Downloading part ${partIndex + 1}: ${range}`);

	const getObjectCommand = new GetObjectCommand({
		Bucket: bucketName,
		Key: objectKey,
		Range: range,
	});

	const response = await s3Client.send(getObjectCommand);

	if (!response.Body) {
		throw new Error(`Failed to download part ${partIndex + 1}`);
	}

	const partPath = path.join(destinationDir, `part-${partIndex}`);
	await ensureDirectoryExists(partPath);

	const writeStream = fs.createWriteStream(partPath);
	await pipe(response.Body as NodeJS.ReadableStream, writeStream);

	return partPath;
}
