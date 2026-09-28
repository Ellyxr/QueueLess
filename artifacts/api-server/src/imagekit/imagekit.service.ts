import { Injectable } from '@nestjs/common';
import ImageKit from 'imagekit';

@Injectable()
export class ImagekitService {
  private imagekit: ImageKit;

  constructor() {
    this.imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY!,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT!,
    });
  }

  getAuthenticationParameters() {
    return this.imagekit.getAuthenticationParameters();
  }

  async uploadPrivateStudentId(userId: string, file: Buffer, extension: string) {
    const result = await this.imagekit.upload({
      file,
      fileName: `${userId}-${Date.now()}.${extension}`,
      folder: '/pasabuy-student-ids',
      useUniqueFileName: true,
      isPrivateFile: true,
    });
    return result.filePath;
  }

  signedStudentIdUrl(path: string) {
    return this.imagekit.url({ path, signed: true, expireSeconds: 300 });
  }
}
