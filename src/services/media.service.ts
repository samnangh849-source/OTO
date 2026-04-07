import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fsp from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { CustomFile } from 'telegram/client/uploads.js';
import { Api } from 'telegram';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export class MediaService {
  static async ensureUploadsDir() {
    const dirs = ['images', 'videos', 'voice'].map(d => path.join(UPLOADS_DIR, d));
    for (const dir of dirs) {
      await fsp.mkdir(dir, { recursive: true });
    }
  }

  static async saveBase64File(base64Data: string, type: 'image' | 'video' | 'voice'): Promise<string> {
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
    const ext = type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'ogg';
    const fileName = `${type}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, type === 'image' ? 'images' : type === 'video' ? 'videos' : 'voice', fileName);
    
    let finalBuffer = buffer;
    if (type === 'image') {
      finalBuffer = await sharp(buffer)
        .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();
    } else if (type === 'voice') {
       // Convert to OGG if it's voice (if needed, or just save)
       // For now, let's just save the buffer if it's already in the right format from convertToOgg logic
    }

    await fsp.writeFile(filePath, finalBuffer);
    return `/uploads/${type === 'image' ? 'images' : type === 'video' ? 'videos' : 'voice'}/${fileName}`;
  }

  static async saveBuffer(buffer: Buffer, type: 'image' | 'video' | 'voice'): Promise<string> {
    const ext = type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'ogg';
    const fileName = `${type}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, type === 'image' ? 'images' : type === 'video' ? 'videos' : 'voice', fileName);
    
    await fsp.writeFile(filePath, buffer);
    return `/uploads/${type === 'image' ? 'images' : type === 'video' ? 'videos' : 'voice'}/${fileName}`;
  }

  static async convertToJpg(inputBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(inputBuffer)
        .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();
    } catch (error) {
      console.error('Error converting to JPG:', error);
      throw new Error('Failed to process image');
    }
  }

  static async convertToOgg(inputBuffer: Buffer): Promise<Buffer> {
    const tempIn = path.join(tmpdir(), `audio_in_${Date.now()}`);
    const tempOut = path.join(tmpdir(), `audio_out_${Date.now()}.ogg`);
    await fsp.writeFile(tempIn, inputBuffer);
    return new Promise((resolve, reject) => {
      ffmpeg(tempIn)
        .toFormat('ogg')
        .audioCodec('libopus')
        .on('end', async () => {
          try {
            const outBuffer = await fsp.readFile(tempOut);
            await Promise.all([fsp.unlink(tempIn), fsp.unlink(tempOut)]).catch(() => {});
            resolve(outBuffer);
          } catch (e) { 
            reject(e); 
          }
        })
        .on('error', async (err) => {
          await Promise.all([fsp.unlink(tempIn), fsp.unlink(tempOut)]).catch(() => {});
          reject(err);
        })
        .save(tempOut);
    });
  }

  static async preprocessMedia(type: string, content: any): Promise<{ file: any, attributes?: any[] }> {
    try {
      let buffer: Buffer;
      if (typeof content === 'string' && content.startsWith('data:')) {
        buffer = Buffer.from(content.split(',')[1], 'base64');
      } else if (Buffer.isBuffer(content)) {
        buffer = content;
      } else if (typeof content === 'string' && content.startsWith('/uploads/')) {
        // Already a file path, need to read it back if TelegramClient needs the buffer
        buffer = await fsp.readFile(path.join(process.cwd(), content));
      } else {
        return { file: content };
      }

      if (type === 'image') {
        const jpgBuffer = await MediaService.convertToJpg(buffer);
        return { file: new CustomFile(`photo_${Date.now()}.jpg`, jpgBuffer.length, '', jpgBuffer) };
      }
      if (type === 'voice') {
        const oggBuffer = await MediaService.convertToOgg(buffer);
        return {
          file: new CustomFile(`voice_${Date.now()}.ogg`, oggBuffer.length, '', oggBuffer),
          attributes: [new Api.DocumentAttributeAudio({ voice: true, duration: 0 })]
        };
      }
      if (type === 'video') {
        return {
          file: new CustomFile(`video_${Date.now()}.mp4`, buffer.length, '', buffer),
          attributes: [new Api.DocumentAttributeVideo({ supportsStreaming: true, duration: 0, w: 1280, h: 720 })]
        };
      }
      return { file: buffer };
    } catch (error) {
      console.error('Media preprocessing error:', error);
      throw error;
    }
  }
}
