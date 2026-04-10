import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fsp from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { Api } from 'telegram';

// Try system ffmpeg first, then fallback to ffmpeg-static
try {
  // On Render/Linux, 'ffmpeg' is usually in the PATH if installed via apt-get
  ffmpeg.setFfmpegPath('ffmpeg');
} catch (e) {
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
  }
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

  static async convertToMp4(inputBuffer: Buffer): Promise<Buffer> {
    const tempIn = path.join(tmpdir(), `video_in_${Date.now()}`);
    const tempOut = path.join(tmpdir(), `video_out_${Date.now()}.mp4`);
    await fsp.writeFile(tempIn, inputBuffer);
    
    return new Promise((resolve, reject) => {
      ffmpeg(tempIn)
        .toFormat('mp4')
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-crf 23',
          '-preset medium'
        ])
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
      let isMp4 = false;

      if (typeof content === 'string' && content.startsWith('data:')) {
        const mimeType = content.split(';')[0].split(':')[1];
        isMp4 = mimeType === 'video/mp4';
        buffer = Buffer.from(content.split(',')[1], 'base64');
      } else if (Buffer.isBuffer(content)) {
        buffer = content;
      } else if (typeof content === 'string' && content.startsWith('/uploads/')) {
        isMp4 = content.endsWith('.mp4');
        buffer = await fsp.readFile(path.join(process.cwd(), content));
      } else {
        return { file: content };
      }

      if (type === 'image') {
        const jpgBuffer = await MediaService.convertToJpg(buffer);
        (jpgBuffer as any).name = `photo_${Date.now()}.jpg`;
        return { file: jpgBuffer };
      }
      if (type === 'voice') {
        const oggBuffer = await MediaService.convertToOgg(buffer);
        (oggBuffer as any).name = `voice_${Date.now()}.ogg`;
        return {
          file: oggBuffer,
          attributes: [new Api.DocumentAttributeAudio({ voice: true, duration: 0 })]
        };
      }
      if (type === 'video') {
        let finalBuffer = buffer;
        if (!isMp4) {
          console.log('[Media] Converting video to mp4...');
          finalBuffer = await MediaService.convertToMp4(buffer);
        }
        (finalBuffer as any).name = `video_${Date.now()}.mp4`;
        return {
          file: finalBuffer,
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
