const mongoose = require('mongoose');
const logger = require('./logger');
const config = require('./index');

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      const uri = config.NODE_ENV === 'test'
        ? config.MONGODB_TEST_URI
        : config.MONGODB_URI;

      if (!uri) {
        throw new Error('MONGODB_URI is not defined in environment variables');
      }

      const options = {
        maxPoolSize: 10,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 5000,
        family: 4,
        autoIndex: true,
        autoCreate: true
      };

      mongoose.set('strictQuery', false);

      this.connection = await mongoose.connect(uri, options);

      logger.info(`MongoDB connected: ${this.connection.connection.host}`);

      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
      });

      return this.connection;
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.connection.close();
        logger.info('MongoDB disconnected gracefully');
      }
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new Database();
