import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';

export const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads');

function safeRelativePath(value) {
  const parts = String(value ?? '')
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '-'))
    .filter((part) => part !== '.' && part !== '..');

  if (!parts.length) throw new Error('Caminho de upload inválido');
  return parts.join('/');
}

export async function saveLocalUpload({ relativePath, buffer }) {
  const storedPath = safeRelativePath(relativePath);
  const absolutePath = path.join(uploadsRoot, storedPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    path: storedPath,
    publicUrl: `/uploads/${storedPath.split('/').map(encodeURIComponent).join('/')}`,
  };
}

export async function removeLocalUploads(paths) {
  await Promise.all(
    (paths ?? []).map(async (storedPath) => {
      try {
        await unlink(path.join(uploadsRoot, safeRelativePath(storedPath)));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }),
  );
}
