# aug-zlib

Compression and decompression backed by zlib. Both operations copy their output into August Bytes and release the native allocation.

This package targets the August `0.21.0` LLVM preview on macOS 14 or later, ARM64. Its source is ready for qualification; consumption requires the matching public compiler and native release assets. It does not work with August 0.20.1.

## Use it

After those preview assets are published:

```sh
aug init native-example
cd native-example
aug add https://github.com/GreenPandaStudios/aug-zlib#v0.1.1 --as zlib
```

Replace `main.aug` with:

```aug
import CompressionError and compress and decompress from zlib
try:
    Bytes input = "The world runs on language".bytes()
    Bytes compressed = compress(input)
    Bytes restored = decompress(input=compressed, maximumOutput=4096)
    print(value=restored.text())
catch CompressionError error:
    print(value=error.message)
catch ConversionError error:
    print(value="Decompressed output is not valid UTF-8")
```

Run `aug run`. Expected output:

```text
The world runs on language
```

August selects LLVM for this native package. It verifies the source revision, binding contract, native archive, and compiler pack. Consumers need Node 24 and the supported OS. They do not install Git, Clang, LLVM, CMake, or Rust and do not execute this repository's native build recipe. Commit `aug.lock.json`; subsequent `aug run --offline --frozen` uses only verified cached selections. Keep a deployed executable with its adjacent `lib` and `share` directories.

## Contracts and maintenance

`src/export.aug` is the public surface. `src/*.aug.md` describes the checked August code. `native.abi.json` records native symbols, ownership, input representations, checked errors, and call-duration loans. `native/include` contains the C ABI, and `native/src` contains the actual upstream adapter. Acquisition returns owned handles; their scope releases them, including on errors. C++ exceptions and Rust panics do not cross the ABI. Native code remains a trust boundary.

Maintain binding declarations and the descriptor together. Run `aug check .`, `aug test .`, and `aug spec .` with the matching preview. Native maintainers additionally run `node native/build.mjs`; this explicit source build needs the toolchain in `aug-package.json` and the pinned inputs in `native/sources.lock.json`. Rust builds select Rust 1.98.1 explicitly. The build runs independent native clients before succeeding. The candidate workflow builds and uploads the measured archive and candidate manifest for review. Copy the reviewed manifest into source, check the August tests, then tag that source. Publish exactly the archive whose SHA-256 is in the tagged manifest; rebuilding creates a new candidate.

The prebuilt archive includes upstream notices, provenance, a runtime dependency inventory and a whole-file manifest. Installing this package does not run build scripts. An unsupported target or missing artifact is an error; there is no automatic source-build fallback.
