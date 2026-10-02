#!/usr/bin/env node
// Explicit native maintainer build. No package installation executes this recipe.
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {nativeSourceIdentity} from './source-identity.mjs';
import {prepareLinuxRuntimes} from './prepare-linux-runtimes.mjs';
const root=resolve(import.meta.dirname,'..'),arch=process.arch;
if(process.platform!=='linux'||!['x64','arm64'].includes(arch))throw Error('GNU/Linux x86-64 or ARM64 maintainer required');
const triple=(arch==='x64'?'x86_64':'aarch64')+'-unknown-linux-gnu';
const manifest=JSON.parse(readFileSync(join(root,'aug-package.json'))),lock=JSON.parse(readFileSync(join(root,'native/sources.lock.json')));
const name=manifest.name.split('/').at(-1).slice(4);
const cache=join(root,'.aug-build/native-linux-'+arch),out=join(cache,'artifact');
mkdirSync(cache,{recursive:true});rmSync(out,{recursive:true,force:true});for(const path of ['lib','licenses','sources'])mkdirSync(join(out,path),{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(command,args,options={})=>{const result=spawnSync(command,args,{cwd:root,encoding:'utf8',maxBuffer:10000000,...options});if(result.status!==0)throw Error(command+': '+(result.stderr||result.error?.message));return result.stdout.replaceAll(root,'/aug-native/aug-'+name);};
const download=async(input,file)=>{if(!existsSync(file)){const response=await fetch(input.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('Pinned upstream input unavailable: '+input.url);const bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==input.sha256)throw Error('Upstream download digest differs');writeFileSync(file,bytes);}if(hash(readFileSync(file))!==input.sha256)throw Error('Upstream cached input changed');};
const cc=process.env.AUG_CC??'clang',cpp=process.env.AUG_CXX??'clang++';
const flags=['-O2','-g','-fPIC','-fvisibility=hidden','-ffile-prefix-map='+root+'=/aug-native/aug-'+name,'-I'+join(root,'native/include'),...(arch==='x64'?['-march=x86-64','-mtune=generic']:['-march=armv8-a'])];
const stem={pytorch:'torch',sqlite:'sqlite',zlib:'zlib',blake3:'blake3'}[name],library='lib/libaug_'+stem+'.so.1',target=join(out,library),shared=['-shared','-Wl,-soname,'+basename(library),'-Wl,-rpath,$ORIGIN','-pthread'];
let upstream,input=lock.inputs[0];
if(name!=="zlib")throw Error('This recipe only builds aug-zlib');
{
const archive=join(cache,'zlib.tar.gz');await download(input,archive);upstream=join(cache,'zlib-1.3.2');if(!existsSync(upstream))run('tar',['-xzf',archive,'-C',cache]);
 run(cc,[...flags,'-std=c11',...shared,'-I'+upstream,join(root,'native/src/adapter.c'),...['adler32','compress','crc32','deflate','inflate','inffast','inftrees','trees','uncompr','zutil'].map(file=>join(upstream,file+'.c')),'-o',target]);
 copyFileSync(join(upstream,'LICENSE'),join(out,'licenses/zlib.txt'));

}
const licenseFolder=join(root,'native/licenses');if(existsSync(licenseFolder))cpSync(licenseFolder,join(out,'licenses'),{recursive:true});
copyFileSync(join(root,'LICENSE'),join(out,'licenses/august-adapter.txt'));copyFileSync(join(root,'THIRD_PARTY_NOTICES.md'),join(out,'THIRD_PARTY_NOTICES.md'));
if(['pytorch','blake3'].includes(name)){
 const redistribution=await prepareLinuxRuntimes(root,join(cache,'gnu-runtime')),inputs=JSON.parse(readFileSync(join(redistribution,'redistribution.json')));
 const needed=name==='pytorch'?['libstdc++.so.6','libgcc_s.so.1','libgomp.so.1']:['libgcc_s.so.1'];
 for(const [file,digest] of Object.entries(inputs.files)){if(file.startsWith('lib/')&&!needed.includes(basename(file)))continue;if(hash(readFileSync(join(redistribution,file)))!==digest)throw Error('GNU runtime input changed');mkdirSync(join(out,file,'..'),{recursive:true});copyFileSync(join(redistribution,file),join(out,file));}
 copyFileSync(join(redistribution,'redistribution.json'),join(out,'sources/gnu-redistribution.json'));
}
const libs=readdirSync(join(out,'lib')).sort(),system=new Set(['libc.so.6','libm.so.6','libdl.so.2','libpthread.so.0','librt.so.1',arch==='x64'?'ld-linux-x86-64.so.2':'ld-linux-aarch64.so.1']);
const closure=[];
for(const file of libs){
 const path=join(out,'lib',file);
 // Normalize vendored OpenMP sonames to the locked GCC implementation.
 for(const match of run('readelf',['-d',path]).matchAll(/Shared library: \[([^\]]+)\]/g)){
  const dependency=match[1];if(dependency.startsWith('libgomp-')&&name==='pytorch')run('patchelf',['--replace-needed',dependency,'libgomp.so.1',path]);
  else if(!libs.includes(dependency)&&!system.has(dependency))throw Error('Unpackaged native dependency '+dependency+' in '+file);
 }
 for(const match of run('readelf',['--version-info',path]).matchAll(/\bGLIBC_(\d+)\.(\d+)\b/g))if(Number(match[1])>2||Number(match[1])===2&&Number(match[2])>36)throw Error('Artifact exceeds glibc 2.36: '+file);
 run('patchelf',['--set-rpath','$ORIGIN',path]);
 closure.push({path:'lib/'+file,sha256:hash(readFileSync(path)),dynamic:run('readelf',['-d',path]),versions:run('readelf',['--version-info',path])});
}
writeFileSync(join(out,'runtime-files.json'),JSON.stringify({format:1,files:closure},null,2)+'\n');
const sourceIdentity=nativeSourceIdentity(root);
writeFileSync(join(out,'provenance.json'),JSON.stringify({format:1,source:sourceIdentity,package:manifest.name,target:triple,minimumLibc:'2.36',inputs:input,upstream:lock.upstream,compiler:run(name==='pytorch'?cpp:cc,['--version']).trim(),adapter:hash(readFileSync(join(root,'native/src/adapter.'+(name==='pytorch'?'cpp':name==='blake3'?'rs':'c')))),runtimeInspection:'runtime-files.json'},null,2)+'\n');
writeFileSync(join(out,'sbom.json'),JSON.stringify({format:1,upstream:lock.upstream,runtimeFiles:closure.map(({path,sha256})=>({path,sha256})),licenses:readdirSync(join(out,'licenses')),cargo:name==='blake3'?readFileSync(join(root,'native/Cargo.lock'),'utf8'):undefined},null,2)+'\n');
if(existsSync(join(root,'native/tests/client.c'))){const client=join(cache,'native-client');run(cc,[...flags,'-std=c11',join(root,'native/tests/client.c'),target,'-Wl,-rpath,'+join(out,'lib'),'-o',client]);console.log(run(client,[]).trim());}
const files={};let unpacked=0;const walk=(directory,prefix='')=>{for(const entry of readdirSync(directory,{withFileTypes:true})){const path=prefix+entry.name;if(entry.isDirectory())walk(join(directory,entry.name),path+'/');else{const bytes=readFileSync(join(directory,entry.name));unpacked+=bytes.length;files[path]=hash(bytes);}}};walk(out);
writeFileSync(join(out,'files.json'),JSON.stringify({format:1,files},null,2)+'\n');unpacked+=readFileSync(join(out,'files.json')).length;
const archive=join(cache,'native-linux-'+arch+'.tar.gz');run('tar',['-czf',archive,'-C',out,...readdirSync(out).sort()]);
const bytes=readFileSync(archive),artifact={id:'linux-'+arch,target:{triple,os:'linux',arch,minimumLibc:'2.36',cpuBaseline:arch==='x64'?'x86-64':'armv8-a',libc:'glibc',...(name==='pytorch'?{cxxRuntime:'bundled-libstdc++',cxxABI:'itanium-cxx11',features:['cpu','float64']}:{})},url:'https://github.com/GreenPandaStudios/aug-'+name+'/releases/download/v'+manifest.version+'/native-linux-'+arch+'.tar.gz',sha256:hash(bytes),maximumDownloadBytes:bytes.length,maximumUnpackedBytes:unpacked,link:{kind:'dynamic',libraries:[library]},runtime:{files:libs.map(file=>'lib/'+file),closureManifest:'runtime-files.json',relocation:'loader-relative'},components:[{id:lock.upstream.repository,version:lock.upstream.version,compatibilityKey:'aug-'+name+'-runtime',linkage:name==='pytorch'?'dynamic':'static',required:true},...(['pytorch','blake3'].includes(name)?[{id:'gcc-runtime',version:'12.2.0-14+deb12u1',compatibilityKey:'gcc-runtime',linkage:'dynamic',required:true}]:[])],fileManifest:'files.json',provenance:'provenance.json',notices:'THIRD_PARTY_NOTICES.md'};
// Keep each independently qualified target in the same ordinary package manifest.
manifest.native.artifacts=manifest.native.artifacts.filter(entry=>entry.id!==artifact.id).concat(artifact).sort((a,b)=>a.id.localeCompare(b.id));
manifest.native.sourceBuild.tools=['Clang or Apple Clang','platform C/C++ development headers','patchelf on Linux',...(name==='blake3'?['Rust 1.98.1 and Cargo']:[])];
writeFileSync(join(root,'aug-package.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(cache,'candidate.json'),JSON.stringify({source:sourceIdentity,package:manifest.name,version:manifest.version,artifact},null,2)+'\n');console.log(JSON.stringify({archive,sha256:artifact.sha256,bytes:bytes.length,unpacked}));
