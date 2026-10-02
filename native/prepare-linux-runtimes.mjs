// Explicit maintainer preparation of redistribution inputs, not an install hook.
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export async function prepareLinuxRuntimes(root=resolve(import.meta.dirname,'..'),output=join(root,'.aug-build/linux-runtimes'),{tools=false,fortran=false}={}) {
  if(process.platform!=='linux'||!['x64','arm64'].includes(process.arch))throw new Error('Linux redistribution inputs require a native GNU/Linux maintainer');
  const lock=JSON.parse(readFileSync(join(root,'native/linux-runtimes.lock.json'))),arch=process.arch==='x64'?'amd64':'arm64',gnu=process.arch==='x64'?'x86_64-linux-gnu':'aarch64-linux-gnu';
  const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  const run=(command,args)=>{const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:10000000});if(result.status!==0)throw new Error(command+': '+(result.stderr||result.error?.message));return result.stdout;};
  for(const path of ['lib','sources','licenses','unpacked']){rmSync(join(output,path),{recursive:true,force:true});mkdirSync(join(output,path),{recursive:true});}
  mkdirSync(join(output,'downloads'),{recursive:true});
  const records=[];
  for(const input of lock.inputs.filter(input=>(tools||input.scope!=='tools')&&(fortran||input.scope!=='fortran')&&(!input.file.endsWith('.deb')||input.file.endsWith('_'+arch+'.deb')))){
    const file=join(output,'downloads',input.file);
    if(!existsSync(file)){const response=await fetch(input.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('Pinned Linux runtime input unavailable: '+input.url);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==input.bytes||createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw new Error('Linux runtime download pin differs');writeFileSync(file,bytes);}
    if(sha(file)!==input.sha256)throw new Error('Linux runtime cache input changed: '+file);
    if(input.file.endsWith('.deb'))run('dpkg-deb',['-x',file,join(output,'unpacked')]);
    else copyFileSync(file,join(output,'sources',input.file));
    records.push(input);
  }
  const libraries=[['libstdc++.so.6','usr/lib/'+gnu+'/libstdc++.so.6.0.30'],['libgcc_s.so.1','lib/'+gnu+'/libgcc_s.so.1'],['libgomp.so.1','usr/lib/'+gnu+'/libgomp.so.1.0.0'],['libz.so.1','lib/'+gnu+'/libz.so.1.2.13']];
  if(tools)libraries.push(...['libicui18n','libicuuc','libicudata'].map(name=>[name+'.so.70','usr/lib/'+gnu+'/'+name+'.so.70.1']),['liblzma.so.5','lib/'+gnu+'/liblzma.so.5.4.1']);
  if(fortran){if(process.arch!=='arm64')throw new Error('The qualified Fortran runtime currently targets ARM64 only');libraries.push(['libgfortran.so.5','usr/lib/'+gnu+'/libgfortran.so.5.0.0']);}
  for(const [name,path] of libraries){
    const file=join(output,'lib',name);copyFileSync(join(output,'unpacked',path),file);
    run('patchelf',['--set-rpath','$ORIGIN',file]);
    for(const match of run('readelf',['--version-info',file]).matchAll(/\bGLIBC_(\d+)\.(\d+)\b/g))if(Number(match[1])>2||Number(match[1])===2&&Number(match[2])>36)throw new Error('Pinned Linux library exceeds its libc floor: '+name);
  }
  for(const [name,archive] of [['GCC-Debian','gcc-12_12.2.0-14+deb12u1.debian.tar.xz'],['zlib-Debian','zlib_1.2.13.dfsg-1.debian.tar.xz']])writeFileSync(join(output,'licenses',name+'.txt'),run('tar',['-xOf',join(output,'sources',archive),'debian/copyright']));
  if(tools)for(const [name,archive] of [['ICU-Ubuntu','icu_70.1-2ubuntu1.debian.tar.xz'],['XZ-Debian','xz-utils_5.4.1-1+deb12u2.debian.tar.xz']])writeFileSync(join(output,'licenses',name+'.txt'),run('tar',['-xOf',join(output,'sources',archive),'debian/copyright']));
  // GCC's exception permits eligible compiled applications. Include the full
  // license texts and exact corresponding Debian source/patch inputs as well.
  const nested=join(output,'gcc-source.tar.xz');
  if(!existsSync(nested)){
    const result=spawnSync('tar',['-xOf',join(output,'sources/gcc-12_12.2.0.orig.tar.gz'),'gcc-12-12.2.0/gcc-12.2.0-dfsg.tar.xz'],{maxBuffer:100000000});
    if(result.status!==0)throw new Error('Pinned GCC source extraction failed');writeFileSync(nested,result.stdout);
  }
  for(const name of ['COPYING3','COPYING.LIB','COPYING.RUNTIME'])writeFileSync(join(output,'licenses',name+'.txt'),run('tar',['-xOf',nested,'gcc-12.2.0/'+name]));
  writeFileSync(join(output,'sources/Linux-runtime-BUILD.md'),'# Linux runtime redistribution inputs\n\nThese are the unmodified Debian 12 GCC 12.2 and zlib 1.2.13 source archives and Debian patches for the pinned runtime packages. Build instructions and package rules are inside the Debian tar archives. The distributed libraries have only their ELF search path changed to `$ORIGIN`; use `patchelf --set-rpath \'$ORIGIN\' LIBRARY` after a Debian package build.\n\nThe compiler uses these replaceable dynamic libraries for its LLVM tools. A native package may deploy the same locked libraries when its own binary requires them. No libc, SDK headers, compiler startup objects or executable build scripts are installed in an August application.\n');
  const files={};for(const folder of ['lib','licenses','sources'])for(const file of readdirSync(join(output,folder)))files[folder+'/'+file]=sha(join(output,folder,file));
  writeFileSync(join(output,'redistribution.json'),JSON.stringify({format:1,distribution:lock.distribution,minimumLibc:lock.minimumLibc,arch:process.arch,gcc:lock.gcc,zlib:lock.zlib,...(tools?{icu:lock.icu,xz:lock.xz}:{}),inputs:records,files},null,2)+'\n');
  return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(await prepareLinuxRuntimes());
