import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  readlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linkSessionFile } from '../src/server/assistant/pi.ts';

test('persistent session uploads reuse the same link and never overwrite different content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'session-files-'));
  try {
    const uploads = join(root, 'uploads'),
      session = join(root, 'session');
    await mkdir(uploads);
    await mkdir(session);
    const source = join(uploads, 'input.json'),
      target = join(session, 'input.json');
    await writeFile(source, '{"original":true}');
    await linkSessionFile(source, target);
    await linkSessionFile(source, target);
    assert.equal(await readlink(target), source);
    assert.equal(await readFile(target, 'utf8'), '{"original":true}');
    await writeFile(source, '{"revised":true}');
    await linkSessionFile(source, target);
    assert.equal(await readFile(target, 'utf8'), '{"revised":true}');
    const owned = join(session, 'user.txt');
    await writeFile(owned, 'keep this');
    await assert.rejects(
      linkSessionFile(source, owned),
      /已存在且指向其他内容/,
    );
    assert.equal(await readFile(owned, 'utf8'), 'keep this');
    const other = join(uploads, 'other.json');
    await writeFile(other, 'different');
    const conflict = join(session, 'other.json');
    await symlink(other, conflict);
    await assert.rejects(
      linkSessionFile(source, conflict),
      /已存在且指向其他内容/,
    );
    assert.equal(await readlink(conflict), other);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
