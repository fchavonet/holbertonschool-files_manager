import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import dbClient from '../utils/db.mjs';
import redisClient from '../utils/redis.mjs';

class AuthController {
  static async getConnect(req, res) {
    try {
      const auth = req.headers.authorization || '';

      if (!auth.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const b64 = auth.split(' ')[1];
      const [email, pwd] = Buffer.from(b64, 'base64').toString('utf-8').split(':');

      if (!email || !pwd) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await dbClient.db
        .collection('users')
        .findOne({ email, password: sha1(pwd) });

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = uuidv4();
      await redisClient.set(`auth_${token}`, user._id.toString(), 24 * 3600);

      return res.status(200).json({ token });
    } catch (error) {
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await redisClient.del(key);
    return res.status(204).send();
  }
}

export default AuthController;
