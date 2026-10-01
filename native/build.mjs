#!/usr/bin/env node
// Explicit maintainer build. August consumers never execute this file.
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),name=basename(root).slice(4),lock=JSON.parse(readFileSync(join(root,'native/sources.lock.json')));
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Build target is macOS ARM64');
const cache=join(root,'.aug-build/native'),out=join(cache,'artifact');mkdirSync(cache,{recursive:true});rmSync(out,{recursive:true,force:true});mkdirSync(join(out,'lib'),{recursive:true});mkdirSync(join(out,'licenses'),{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(command,args,options={})=>{const r=spawnSync(command,args,{encoding:'utf8',cwd:root,...options});if(r.status!==0)throw new Error(r.stderr||r.error?.message||command+' failed');return r.stdout.replaceAll(root,'/aug-native/aug-'+name);};
const download=async(url,file,digest)=>{if(!existsSync(file)){const r=await fetch(url);if(!r.ok)throw new Error('Download failed '+url);writeFileSync(file,Buffer.from(await r.arrayBuffer()));}if(hash(readFileSync(file))!==digest)throw new Error('Pinned source digest differs '+file);};
const cc=process.env.AUG_CC??'/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang';
const sdk=process.env.SDKROOT??'/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk';
const flags=['-isysroot',sdk,'-mmacosx-version-min=14.0','-O2','-g','-fPIC','-fvisibility=hidden','-ffile-prefix-map='+root+'=/aug-native/aug-'+name,'-I'+join(root,'native/include')];
const stem={pytorch:'torch',sqlite:'sqlite',zlib:'zlib',blake3:'blake3'}[name],library='lib/libaug_'+stem+'.1.dylib',target=join(out,library);
let upstream;
if(name==='sqlite'){
 const archive=join(cache,'sqlite.zip');await download(lock.inputs[0].url,archive,lock.inputs[0].sha256);
 if(!existsSync(join(cache,'sqlite-amalgamation-3530400')))run('/usr/bin/unzip',['-q',archive,'-d',cache]);upstream=join(cache,'sqlite-amalgamation-3530400');
 run(cc,[...flags,'-std=c11','-DSQLITE_THREADSAFE=1','-DSQLITE_OMIT_LOAD_EXTENSION','-dynamiclib','-Wl,-install_name,@rpath/libaug_sqlite.1.dylib','-I'+upstream,join(root,'native/src/adapter.c'),join(upstream,'sqlite3.c'),'-o',target]);
}else if(name==='zlib'){
 const archive=join(cache,'zlib.tar.gz');await download(lock.inputs[0].url,archive,lock.inputs[0].sha256);
 if(!existsSync(join(cache,'zlib-1.3.2')))run('/usr/bin/tar',['-xzf',archive,'-C',cache]);upstream=join(cache,'zlib-1.3.2');
 run(cc,[...flags,'-std=c11','-dynamiclib','-Wl,-install_name,@rpath/libaug_zlib.1.dylib','-I'+upstream,join(root,'native/src/adapter.c'),...['adler32','compress','crc32','deflate','inflate','inffast','inftrees','trees','uncompr','zutil'].map(n=>join(upstream,n+'.c')),'-o',target]);
 copyFileSync(join(upstream,'LICENSE'),join(out,'licenses/zlib.txt'));
}else if(name==='pytorch'){
 const archive=join(cache,'libtorch.zip');await download(lock.inputs[0].url,archive,lock.inputs[0].sha256);
 if(!existsSync(join(cache,'libtorch')))run('/usr/bin/unzip',['-q',archive,'-d',cache]);upstream=join(cache,'libtorch');
 run(cc,[...flags,'-std=c++20','-dynamiclib','-Wl,-install_name,@rpath/libaug_torch.1.dylib','-Wl,-rpath,@loader_path','-I'+join(upstream,'include'),join(root,'native/src/adapter.cpp'),'-L'+join(upstream,'lib'),'-ltorch_cpu','-lc10','-o',target]);
 for(const file of ['libtorch_cpu.dylib','libc10.dylib','libomp.dylib'])copyFileSync(join(upstream,'lib',file),join(out,'lib',file));
 for(const file of ['LICENSE.pytorch','NOTICE.pytorch'])copyFileSync(join(root,'native',file),join(out,'licenses',file));
}else if(name==='blake3'){
 const cargo=process.env.CARGO??'cargo';
 run(cargo,['test','--locked','--manifest-path',join(root,'native/Cargo.toml')],{env:{...process.env,MACOSX_DEPLOYMENT_TARGET:'14.0'}});
 run(cargo,['build','--release','--locked','--manifest-path',join(root,'native/Cargo.toml')],{env:{...process.env,MACOSX_DEPLOYMENT_TARGET:'14.0'}});
 copyFileSync(join(root,'native/target/release/libaug_blake3_native.dylib'),target);
 run('/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/install_name_tool',['-id','@rpath/libaug_blake3.1.dylib',target]);
}
const licenseFolder=join(root,'native/licenses');if(existsSync(licenseFolder))cpSync(licenseFolder,join(out,'licenses'),{recursive:true});
copyFileSync(join(root,'LICENSE'),join(out,'licenses/august-adapter.txt'));copyFileSync(join(root,'THIRD_PARTY_NOTICES.md'),join(out,'THIRD_PARTY_NOTICES.md'));
const libs=readdirSync(join(out,'lib'),{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort(),closure=libs.map(file=>({path:'lib/'+file,sha256:hash(readFileSync(join(out,'lib',file))),loadCommands:run('/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/otool',['-L',join(out,'lib',file)]),platform:run('/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/otool',['-l',join(out,'lib',file)])}));
writeFileSync(join(out,'runtime-files.json'),JSON.stringify({format:1,files:closure},null,2)+'\n');
writeFileSync(join(out,'provenance.json'),JSON.stringify({format:1,package:basename(root),target:lock.target,minimumOS:lock.minimumOS,inputs:lock,compiler:run(cc,['--version']).trim(),adapter:hash(readFileSync(join(root,'native/src/adapter.'+(name==='pytorch'?'cpp':name==='blake3'?'rs':'c')))),runtimeInspection:'runtime-files.json'},null,2)+'\n');
writeFileSync(join(out,'sbom.json'),JSON.stringify({format:1,upstream:lock.upstream,runtimeFiles:closure.map(f=>({path:f.path,sha256:f.sha256})),componentNotices:existsSync(join(out,'licenses/provenance.json'))?JSON.parse(readFileSync(join(out,'licenses/provenance.json'))):undefined,licenseFiles:readdirSync(join(out,'licenses')),cargo:name==='blake3'?readFileSync(join(root,'native/Cargo.lock'),'utf8'):undefined},null,2)+'\n');
for(const entry of readdirSync(join(out,'lib'),{withFileTypes:true}))if(entry.isDirectory())rmSync(join(out,'lib',entry.name),{recursive:true});
const files={};let unpacked=0;const walk=(folder,prefix='')=>{for(const entry of readdirSync(folder,{withFileTypes:true})){const path=prefix+entry.name;if(entry.isDirectory())walk(join(folder,entry.name),path+'/');else{const bytes=readFileSync(join(folder,entry.name));unpacked+=bytes.length;files[path]=hash(bytes);}}};walk(out);
writeFileSync(join(out,'files.json'),JSON.stringify({format:1,files},null,2)+'\n');unpacked+=readFileSync(join(out,'files.json')).length;
const archive=join(cache,'native-macos-arm64.tar.gz');run('/usr/bin/tar',['-czf',archive,'-C',out,...readdirSync(out).sort()],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const bytes=readFileSync(archive),descriptor=readFileSync(join(root,'native.abi.json'));
const artifact={id:'macos-arm64',target:{triple:lock.target,os:'macos',arch:'arm64',minimumOS:'14.0',cpuBaseline:'armv8-a',libc:'libSystem',...(name==='pytorch'?{cxxRuntime:'system-libc++',cxxABI:'apple-libc++',features:['cpu','float64']}:{})},url:'https://github.com/GreenPandaStudios/aug-'+name+'/releases/download/v0.1.0/native-macos-arm64.tar.gz',sha256:hash(bytes),maximumDownloadBytes:bytes.length,maximumUnpackedBytes:unpacked,link:{kind:'dynamic',libraries:[library]},runtime:{files:libs.map(f=>'lib/'+f),closureManifest:'runtime-files.json',relocation:'loader-relative'},components:[{id:lock.upstream.repository,version:lock.upstream.version,compatibilityKey:'aug-'+name+'-runtime',linkage:name==='pytorch'?'dynamic':'static',required:true}],fileManifest:'files.json',provenance:'provenance.json',notices:'THIRD_PARTY_NOTICES.md'};
const compiler=process.env.AUG_COMPILER_VERSION??'0.21.0-native.1';
writeFileSync(join(root,'aug-package.json'),JSON.stringify({format:2,name:'@greenpandastudios/aug-'+name,version:'0.1.0',compiler,source:'src',dependencies:{},native:{profile:'aug-native-abi-1',bindings:'native.abi.json',bindingsSha256:hash(descriptor),upstream:lock.upstream,artifacts:[artifact],sourceBuild:{recipe:'native/build.json',inputs:'native/sources.lock.json',tools:name==='blake3'?['Rust 1.98.1','Cargo','Apple macOS SDK']:['Clang','Apple macOS SDK'],automatic:false}}},null,2)+'\n');
if(existsSync(join(root,'native/tests/client.c'))){const client=join(cache,'native-client');run(cc,[...flags,'-std=c11',join(root,'native/tests/client.c'),target,'-Wl,-rpath,'+join(out,'lib'),'-o',client]);console.log(run(client,[]).trim());}
console.log(JSON.stringify({artifact:archive,sha256:artifact.sha256,download:bytes.length,unpacked}));
