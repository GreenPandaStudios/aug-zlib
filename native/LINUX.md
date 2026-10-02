# GNU/Linux native candidates

The Linux preview targets x86-64 and ARM64 with glibc 2.36 or later. Musl and GPU support are outside this profile. Consumer installation downloads a checked archive; it never runs this build recipe.

Maintainers build on Debian 12 to hold the libc floor. The pinned multi-platform container includes Clang and Rust only for producing the artifact:

```sh
docker build -f native/Dockerfile -t aug-zlib-maintainer .
docker create --name aug-zlib-candidate aug-zlib-maintainer
docker start --attach aug-zlib-candidate
docker cp aug-zlib-candidate:/package/.aug-build .aug-build
docker cp aug-zlib-candidate:/package/aug-package.json aug-package.candidate.json
```

Run on each architecture; this recipe does not cross-compile. The candidate workflow uses native GitHub-hosted x86-64 and ARM64 runners. Each build verifies pinned upstream inputs, checks the actual ELF dependency closure and glibc versions, and runs an independent native client. Rust also runs its locked crate tests.

Review each `candidate.json`, then merge its measured artifact into `aug-package.json`. Retain other target selections. Tag that source and publish the exact archives referenced by their SHA-256 values; do not rebuild after tagging. A compiler qualification must also import the tagged repository, run its August tests through LLVM, and check frozen/offline restoration and relocated execution before this platform is advertised to consumers.

The candidate records the build checkout revision and hashes the adapter, public headers, binding descriptor, August declarations, locked inputs and build recipes. Before tagging the metadata commit, run `node native/verify-candidate.mjs PATH_TO_CANDIDATE_JSON`. This rejects source or contract changes after the measured build. Adding reviewed artifact pins does not change that source identity; changing an API or recipe requires a new build.

Dynamic dependencies use `$ORIGIN` paths. The archive includes pinned GNU runtime libraries when needed, their complete source inputs and Debian patches, license texts, dependency inspections, provenance and file hashes. Keep deployment libraries beside the executable and retain its `share` metadata.
