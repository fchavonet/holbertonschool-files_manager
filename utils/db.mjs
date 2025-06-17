import mongo from 'mongodb';

class DBClient {
  constructor() {
    // Get host (from env or default).
    let host;
    if (process.env.DB_HOST) {
      host = process.env.DB_HOST;
    } else {
      host = 'localhost';
    }

    // Get port (from env or default).
    let port;
    if (process.env.DB_PORT) {
      port = process.env.DB_PORT;
    } else {
      port = '27017';
    }

    // Get database name (from env or default).
    let database;
    if (process.env.DB_DATABASE) {
      database = process.env.DB_DATABASE;
    } else {
      database = 'files_manager';
    }

    const uri = `mongodb://${host}:${port}`;

    this.client = new mongo.MongoClient(uri);

    // Initiate connection.
    this.client
      .connect()
      .then(() => {
        this.client.connected = true;
        this.db = this.client.db(database);
      })
      .catch((error) => {
        console.error('MongoDB connection error:', error);
      });
  }

  // Check if MongoDB client is connected.
  isAlive() {
    if (this.client.connected) {
      return true;
    }
    return false;
  }

  // Get number of users.
  async nbUsers() {
    if (!this.isAlive()) {
      return 0;
    }
    return this.db.collection('users').countDocuments();
  }

  // Get number of files.
  async nbFiles() {
    if (!this.isAlive()) {
      return 0;
    }
    return this.db.collection('files').countDocuments();
  }
}

// Export a singleton instance of DBClient for reuse.
const dbClient = new DBClient();
export default dbClient;
