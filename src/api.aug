// aug-spec: "api.aug.md" explains this file. Read it before changes; refresh with aug spec.
import CompressionError from contracts
extern C _compress(Bytes input) returns Bytes unless CompressionError
extern C _decompress(Bytes input, int maximumOutput) returns Bytes unless CompressionError
/** Compress bytes with the standard zlib framing. */
compress(Bytes input) returns Bytes:
    unsafe:
        return _compress(input)
/** Decompress at most maximumOutput bytes (maximum 256 MiB). */
decompress(Bytes input, int maximumOutput) returns Bytes:
    unsafe:
        return _decompress(input, maximumOutput)

test compress:
    when compression:
        it preserves_bytes:
            Bytes input = "The world runs on language".bytes()
            Bytes packed = compress(input)
            Bytes restored = decompress(input=packed, maximumOutput=4096)
            assert(restored.text() == "The world runs on language")
        it checks_output_limit:
            Bytes packed = compress(input="length limit".bytes())
            bool rejected = false
            try:
                decompress(input=packed, maximumOutput=1)
            catch CompressionError error:
                rejected = true
            assert(rejected)
