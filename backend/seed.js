import { Admin } from './src/models/admin.model.js';
import dbConnect from './src/db/index.js';
import { asyncHandler } from './src/utils/asyncHandler.js';
import { apiError } from './src/utils/apiError.js';
import dotenv from 'dotenv';

dotenv.config();

const seedAdmin = asyncHandler(async () => {
  await dbConnect();

  const admin = await Admin.create({
    name: 'Arbeen',
    email: 'arbinbabuthapamagar2002@gmail.com',
    password: 'Arbeen@1',
    phoneNumber: '9818856764',
    role: 'admin',
  });
  const existingAdmin = await Admin.findOne({ email: 'arbinbabuthapamagar2002@gmail.com' });
  if (existingAdmin) {
    throw new apiError(400, 'Admin already exits');
  }
  console.log('admin EMAIL: ', admin.email);
  process.exit();
});
seedAdmin();
