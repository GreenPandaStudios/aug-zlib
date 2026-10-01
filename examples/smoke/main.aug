import CompressionError and compress and decompress from "https://github.com/GreenPandaStudios/aug-zlib#v0.1.0"
try:
    Bytes input = "The world runs on language".bytes()
    Bytes compressed = compress(input)
    Bytes restored = decompress(input=compressed, maximumOutput=4096)
    print(value=restored.text())
catch CompressionError error:
    print(value=error.message)
catch ConversionError error:
    print(value="Decompressed output is not valid UTF-8")
