import Queue from 'bull';
import imageThumbnail from 'image-thumbnail';
import { promises as fs } from 'fs';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const file = await dbClient.db.collection('files').findOne({
    _id: new ObjectId(fileId),
    userId: new ObjectId(userId),
  });

  if (!file) {
    throw new Error('File not found');
  }

  const originalPath = file.localPath;
  const sizes = [500, 250, 100];

  const tasks = sizes.map(async (width) => {
    const buffer = await imageThumbnail(originalPath, { width });
    const outputPath = `${originalPath}_${width}`;
    await fs.writeFile(outputPath, buffer);
  });

  await Promise.all(tasks);
});
