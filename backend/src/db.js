import mongoose from 'mongoose';

export async function connectDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/flower-finance';
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB at ${uri}`);
}
