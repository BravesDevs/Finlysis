import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadFileParams {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  userId: string;
  batchId: string;
}

export interface UploadResult {
  fileKey: string;
  fileUrl: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client;
  private bucket: string;
  private endpoint: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Validates all five vars at startup — getOrThrow throws if any is absent
    const endpoint        = this.config.getOrThrow<string>('BUCKET_ENDPOINT');
    const region          = this.config.getOrThrow<string>('BUCKET_REGION');
    const bucket          = this.config.getOrThrow<string>('BUCKET_NAME');
    const accessKeyId     = this.config.getOrThrow<string>('BUCKET_ACCESS_ID');
    const secretAccessKey = this.config.getOrThrow<string>('BUCKET_SECRET_KEY');

    this.endpoint = endpoint;
    this.bucket   = bucket;

    this.s3 = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // required for Railway / non-AWS S3-compatible stores
    });

    this.logger.log(`StorageService initialised — bucket: ${bucket}, endpoint: ${endpoint}`);
  }

  async uploadFile(params: UploadFileParams): Promise<UploadResult> {
    const { buffer, originalName, mimeType, userId, batchId } = params;

    // Sanitise filename: keep alphanumeric, hyphen, underscore, dot
    const sanitised = originalName.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    const fileKey   = `imports/${userId}/${batchId}/${Date.now()}-${sanitised}`;

    // Upload uses multipart automatically for files > 5 MB
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket:      this.bucket,
        Key:         fileKey,
        Body:        buffer,
        ContentType: mimeType,
      },
    });

    await upload.done();

    const fileUrl = `${this.endpoint}/${this.bucket}/${fileKey}`;
    return { fileKey, fileUrl };
  }
}
