import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

// here i use the cors orign because i just want to give the specific url the access

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  }),
);

// here i wana convert all the json file into the javascript object
app.use(
  express.json({
    limit: '20kb',
  }),
);

// this will let me help in the getting the form value nicely and in format and readable
app.use(
  express.urlencoded({
    extended: true,
    limit: '20kb',
  }),
);
// using the helmet

app.use(helmet());

// make the public folder accessable only needed if the image are in the public folder if i use cloudinary i dont need this because the image will be in the cloud and i will get the url of the image and save it in the database and use it when i need to show the image
app.use(express.static('public'));

// using the cookieparser for the data reciving from the cookie and make it in the format of the javascript object
app.use(cookieParser());

//routes import here **************************
import { adminRouter } from './routes/admin.route.js';

// route decleration

app.use('/api/v1/admin', adminRouter);

export default app;
