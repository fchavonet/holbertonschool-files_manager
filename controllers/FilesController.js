import { ObjectId } from 'mongodb';
import { promises as fs, existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      type,
      parentId = 0,
      isPublic = false,
      data,
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // 4) Vérif parentId si renseigné
    let parentFile = null;

    if (parentId !== 0) {
      parentFile = await dbClient.db
        .collection('files')
        .findOne({ _id: new ObjectId(parentId) });

      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDoc = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? 0 : new ObjectId(parentId),
    };

    if (type === 'folder') {
      const { insertedId } = await dbClient.db
        .collection('files')
        .insertOne(fileDoc);
      return res.status(201).json({
        id: insertedId,
        ...fileDoc,
      });
    }

    if (!existsSync(FOLDER_PATH)) {
      mkdirSync(FOLDER_PATH, { recursive: true });
    }

    const localFilename = uuidv4();
    const localPath = path.join(FOLDER_PATH, localFilename);

    try {
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
    } catch (err) {
      return res.status(500).json({ error: 'Cannot save file' });
    }

    const { insertedId } = await dbClient.db
      .collection('files')
      .insertOne({ ...fileDoc, localPath });

    return res.status(201).json({
      id: insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }
}

export default FilesController;
