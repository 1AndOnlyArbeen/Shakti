import mongoose from 'mongoose';
import { DB_NAME } from '../utils/constants.js';
import dotenv from 'dotenv';
dotenv.config();

const dbConnect = async () => {
  try {
    const response = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`,
    );
    console.log(`Mongo dB connected: HOST:  ${response.connection.host}`);
  } catch (error) {
    console.log('ERROR: Database connection FAILED !!', error);
    throw error;
  }
};

export default dbConnect;
