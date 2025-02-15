import { TOPICS } from "./topics";
import { logger } from "../logger/logger";
import { createTopic } from "./admin";
import { consumeMessages } from "./consumer";
import { handleNewVideoEvent } from "./handlers/videoUploadEvent.consumer";

// Create topics and start consuming messages
createTopic(Object.values(TOPICS)).then(() => {
	logger.info("✅ Topic created successfully");

	// Define topic handlers
	const topicHandlers = {
		[TOPICS.VIDEO_UPLOAD_EVENT]: handleNewVideoEvent,
	};

	// Start consuming messages
	consumeMessages(topicHandlers).catch((error) => {
		logger.error("Failed to start consumer:", error);
	});
});
