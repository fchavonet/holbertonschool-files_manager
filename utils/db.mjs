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

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url);
    this.db = this.client.db(database);
    this.isConnected = false;

    // Initiate connection.
    this.client
      .connect()
      .then(() => {
        this.isConnected = true;
      })
      .catch((error) => {
        console.error('MongoDB connection error:', error);
      });
  }

  // Check connection status.
  isAlive() {
    return this.isConnected;
  }

  // Count users.
  async nbUsers() {
    return this.db.collection('users').countDocuments();
  }

  // Count files.
  async nbFiles() {
    return this.db.collection('files').countDocuments();
  }
}

// Export a singleton instance of DBClient for reuse.
const dbClient = new DBClient();
export default dbClient;
