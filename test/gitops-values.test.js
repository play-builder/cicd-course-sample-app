import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readImageBlock, updateImageBlock } from '../scripts/gitops-values-lib.mjs';

const source = `environment: dev

image:
  repository: "old.example/sample-app"
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

workload:
  kind: Deployment
`;

test('GitOps image block만 새 immutable digest로 바꾼다', () => {
  const digest = `sha256:${'b'.repeat(64)}`;
  const updated = updateImageBlock(source, 'new.example/sample-app', digest);

  assert.deepEqual(readImageBlock(updated), {
    repository: 'new.example/sample-app',
    digest,
  });
  assert.ok(updated.includes('workload:\n  kind: Deployment'));
});

test('mutable tag나 잘못된 digest를 거부한다', () => {
  assert.throws(
    () => updateImageBlock(source, 'new.example/sample-app', 'latest'),
    /image digest must match/,
  );
});
