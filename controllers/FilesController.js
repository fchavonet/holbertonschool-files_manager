import { ObjectId } from 'mongodb';
import { promises as fs, existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import mime from 'mime-types';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';
const fileQueue = new Queue('fileQueue');

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
      parentId = '0',
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

    let parentFile = null;

    if (parentId !== '0') {
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

    let dbParentId;

    if (parentId === '0') {
      dbParentId = '0';
    } else {
      dbParentId = new ObjectId(parentId);
    }

    const fileDoc = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: dbParentId,
    };

    if (type === 'folder') {
      const { insertedId } = await dbClient.db
        .collection('files')
        .insertOne(fileDoc);

      let parentIdResponse;
      if (fileDoc.parentId === '0') {
        parentIdResponse = 0;
      } else {
        parentIdResponse = fileDoc.parentId.toString();
      }

      return res.status(201).json({
        id: insertedId.toString(),
        userId: fileDoc.userId.toString(),
        name: fileDoc.name,
        type: fileDoc.type,
        isPublic: fileDoc.isPublic,
        parentId: parentIdResponse,
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

    fileQueue.add({ userId, fileId: insertedId.toString() });

    let parentIdResponse;

    if (fileDoc.parentId === '0') {
      parentIdResponse = 0;
    } else {
      parentIdResponse = fileDoc.parentId.toString();
    }

    return res.status(201).json({
      id: insertedId.toString(),
      userId: fileDoc.userId.toString(),
      name,
      type,
      isPublic,
      parentId: parentIdResponse,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({
          _id: new ObjectId(req.params.id),
          userId: new ObjectId(userId),
        });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    let resParentId;

    if (file.parentId === '0') {
      resParentId = 0;
    } else {
      resParentId = file.parentId.toString();
    }

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: resParentId,
    });
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let parentIdQuery;

    if (req.query.parentId === undefined) {
      parentIdQuery = '0';
    } else {
      parentIdQuery = req.query.parentId;
    }

    let filterParentId;
    if (parentIdQuery === '0') {
      filterParentId = '0';
    } else {
      filterParentId = new ObjectId(parentIdQuery);
    }

    let page;

    if (!req.query.page) {
      page = 0;
    } else {
      page = parseInt(req.query.page, 10);

      if (Number.isNaN(page) || page < 0) {
        page = 0;
      }
    }

    const files = await dbClient.db
      .collection('files')
      .find({
        userId: new ObjectId(userId),
        parentId: filterParentId,
      })
      .skip(page * 20)
      .limit(20)
      .toArray();

    const result = [];

    for (const file of files) {
      let resPid;

      if (file.parentId === '0') {
        resPid = 0;
      } else {
        resPid = file.parentId.toString();
      }

      result.push({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: resPid,
      });
    }

    return res.status(200).json(result);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({
          _id: new ObjectId(fileId),
          userId: new ObjectId(userId),
        });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db
      .collection('files')
      .updateOne(
        { _id: new ObjectId(fileId), userId: new ObjectId(userId) },
        { $set: { isPublic: true } },
      );

    let resParentId;

    if (file.parentId === '0') {
      resParentId = 0;
    } else {
      resParentId = file.parentId.toString();
    }

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: true,
      parentId: resParentId,
    });
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({
          _id: new ObjectId(fileId),
          userId: new ObjectId(userId),
        });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db
      .collection('files')
      .updateOne(
        { _id: new ObjectId(fileId), userId: new ObjectId(userId) },
        { $set: { isPublic: false } },
      );

    let resParentId;

    if (file.parentId === '0') {
      resParentId = 0;
    } else {
      resParentId = file.parentId.toString();
    }

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: false,
      parentId: resParentId,
    });
  }

  static async getFile(req, res) {
    const { id: fileId } = req.params;
    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({ _id: new ObjectId(fileId) });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (file.isPublic === false) {
      const token = req.headers['x-token'];
      const userId = await redisClient.get(`auth_${token}`);

      if (!userId) {
        return res.status(404).json({ error: 'Not found' });
      }

      const ownerId = file.userId.toString();

      if (userId !== ownerId) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    if (!file.localPath || !existsSync(file.localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    let mimeType = mime.lookup(file.name);

    if (!mimeType) {
      mimeType = 'application/octet-stream';
    }

    const { size } = req.query;
    let readPath = file.localPath;

    if (size) {
      if (size !== '100' && size !== '250' && size !== '500') {
        return res.status(400).json({ error: 'Invalid size' });
      }
      readPath = `${file.localPath}_${size}`;
      if (!existsSync(readPath)) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    let data;

    try {
      data = await fs.readFile(readPath);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.setHeader('Content-Type', mimeType);

    return res.status(200).send(data);
  }
}

export default FilesController;
