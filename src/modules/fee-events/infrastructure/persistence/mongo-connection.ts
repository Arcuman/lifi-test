import mongoose from "mongoose";

export const connectMongo = async (uri: string): Promise<void> => {
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 45_000
  });
};

export const closeMongoConnection = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};
