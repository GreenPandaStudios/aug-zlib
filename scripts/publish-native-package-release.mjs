#!/usr/bin/env node
// Maintainer CI only. GH_TOKEN is supplied by GitHub Actions, never persisted.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyNativeReleaseDirectory} from './prepare-native-package-release.mjs';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(join(root,'aug-package.json')));
const plan=JSON.parse(readFileSync(join(root,'release-candidates.json')));
const repository='GreenPandaStudios/'+manifest.name.split('/').at(-1),tag='v'+manifest.version;
assert.equal(process.env.GITHUB_REPOSITORY,repository);
assert.equal(process.env.GITHUB_REF_NAME,tag,'Publication requires the exact version tag');
assert.equal(plan.version,manifest.version);
const gh=args=>{const result=spawnSync('gh',args,{encoding:'utf8',cwd:root});
  assert.equal(result.status,0,result.stderr||result.error?.message||'GitHub command failed');return result.stdout;};
const run=JSON.parse(gh(['api',`repos/${repository}/actions/runs/${plan.runId}`]));
assert.equal(run.conclusion,'success');assert.equal(run.status,'completed');
assert.equal(run.head_sha,plan.sourceRevision);assert.equal(run.path,'.github/workflows/candidate.yml');
assert.equal(run.repository.full_name,repository);
const directory=resolve(process.argv[2]??join(root,'.aug-build/release'));
const files=readdirSync(directory).sort();
assert.deepEqual(files,['SHA256SUMS','native-linux-arm64.tar.gz','native-linux-x64.tar.gz','native-macos-arm64.tar.gz','release.json']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
verifyNativeReleaseDirectory(root,directory);
const releases=JSON.parse(gh(['api',`repos/${repository}/releases?per_page=100`]));
let release=releases.find(release=>release.tag_name===tag);
if(!release){
  gh(['release','create',tag,'--repo',repository,'--draft','--prerelease','--verify-tag','--title',manifest.name+' '+manifest.version,
    '--notes','CPU native packages for the August 0.21.0 LLVM preview. Includes macOS ARM64 and Debian/Ubuntu GNU/Linux x64 and ARM64 artifacts. Source, licenses, dependency provenance and cleanup tests are recorded with the exact candidate archives.']);
  release=JSON.parse(gh(['api',`repos/${repository}/releases/tags/${tag}`]));
}
assert.ok(release.assets.every(asset=>files.includes(asset.name)),'Existing release contains unexpected assets');
const previous=mkdtempSync(join(tmpdir(),'aug-native-published-'));
try{
  for(const asset of release.assets){
    gh(['release','download',tag,'--repo',repository,'--pattern',asset.name,'--dir',previous]);
    assert.equal(sha(readFileSync(join(previous,asset.name))),sha(readFileSync(join(directory,asset.name))),'Existing release asset differs; it must not be overwritten');
  }
  const missing=files.filter(name=>!release.assets.some(asset=>asset.name===name));
  assert.ok(release.draft||missing.length===0,'An already published release cannot be completed with different assets');
  if(missing.length)gh(['release','upload',tag,...missing.map(name=>join(directory,name)),'--repo',repository]);
  const uploaded=JSON.parse(gh(['api',`repos/${repository}/releases/tags/${tag}`]));
  assert.deepEqual(uploaded.assets.map(asset=>asset.name).sort(),files);
  for(const asset of uploaded.assets){
    if(release.assets.some(previous=>previous.name===asset.name))continue;
    gh(['release','download',tag,'--repo',repository,'--pattern',asset.name,'--dir',previous]);
    assert.equal(sha(readFileSync(join(previous,asset.name))),sha(readFileSync(join(directory,asset.name))),'Uploaded release asset differs');
  }
  if(uploaded.draft)gh(['release','edit',tag,'--repo',repository,'--draft=false','--prerelease']);
  console.log('Published exact reviewed native artifacts: '+repository+' '+tag);
}finally{rmSync(previous,{recursive:true,force:true});}
