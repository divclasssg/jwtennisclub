import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const r2EnvSchema = z.object({
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_R2_BUCKET: z.string().min(1),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1),
});

export type R2Env = {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  secretAccessKey: string;
};

type R2EnvSource = {
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_ACCOUNT_ID?: string;
  CLOUDFLARE_R2_BUCKET?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
};

type ReceiptUploadInput = {
  contentType: string;
  file: File;
  key: string;
};

export function readR2Env(source: R2EnvSource): R2Env {
  const parsed = r2EnvSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error("Missing or invalid Cloudflare R2 environment variables");
  }

  return {
    accessKeyId: parsed.data.CLOUDFLARE_R2_ACCESS_KEY_ID,
    accountId: parsed.data.CLOUDFLARE_R2_ACCOUNT_ID,
    bucket: parsed.data.CLOUDFLARE_R2_BUCKET,
    secretAccessKey: parsed.data.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  };
}

export function getR2Env() {
  return readR2Env({
    CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_ACCOUNT_ID: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    CLOUDFLARE_R2_BUCKET: process.env.CLOUDFLARE_R2_BUCKET,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY:
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  });
}

export function buildR2Endpoint(accountId: string) {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export async function uploadReceiptFile(input: ReceiptUploadInput) {
  const env = getR2Env();
  const client = createR2Client(env);
  const body = Buffer.from(await input.file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Body: body,
      Bucket: env.bucket,
      ContentLength: input.file.size,
      ContentType: input.contentType,
      Key: input.key,
      Metadata: {
        "original-name": encodeURIComponent(input.file.name),
      },
    }),
  );
}

export async function createReceiptDownloadUrl(key: string) {
  const env = getR2Env();
  const client = createR2Client(env);

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: key,
    }),
    { expiresIn: 60 * 5 },
  );
}

export async function deleteReceiptFile(key: string) {
  const env = getR2Env();
  const client = createR2Client(env);

  await client.send(
    new DeleteObjectCommand({
      Bucket: env.bucket,
      Key: key,
    }),
  );
}

function createR2Client(env: R2Env) {
  return new S3Client({
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    endpoint: buildR2Endpoint(env.accountId),
    region: "auto",
  });
}
