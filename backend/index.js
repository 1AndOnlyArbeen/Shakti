import dotenv from 'dotenv';
dotenv.config();

import dbConnect from './db/index.js';
import app from './app.js';
import { uploadOnCloudinary } from './utils/cloudinary.js';

const port = process.env.PORT || 8000;

uploadOnCloudinary();
dbConnect()
  .then(() => {
    app.listen(port, () => {
      console.log(`your server is running at port no ${port}`);
    });
  })
  .catch((error) => {
    console.log('Db mongo connection FAILED!', error);
  });
