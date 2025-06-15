import redis from "redis";

class RedisClient {
	constructor() {
		// Create a new Redis client instance.
		this.client = redis.createClient();

		// Log any connection errors to the console.
		this.client.on("error", (error) => {
			console.error("Redis client error: " + error);
		});
	}

	// Check if the Redis client is currently connected.
	isAlive() {
		if (this.client.connected) {
			return true;
		}

		return false;
	}

	// Retrieve a value from Redis by key.
	async get(key) {
		return new Promise((resolve, reject) => {
			this.client.get(key, (error, value) => {
				if (error) {
					return reject(error);
				}

				return resolve(value);
			});
		});
	}

	// Store a value in Redis with an expiration time.
	async set(key, value, duration) {
		return new Promise((resolve, reject) => {
			this.client.setex(key, duration, value, (error, reply) => {
				if (error) {
					return reject(error);
				}

				return resolve(reply);
			});
		});
	}

	// Delete a key from Redis.
	async del(key) {
		return new Promise((resolve, reject) => {
			this.client.del(key, (error, reply) => {
				if (error) {
					return reject(err);
				}

				return resolve(reply);
			});
		});
	}
}

// Export a singleton instance of RedisClient for reuse.
const redisClient = new RedisClient();
export default redisClient;
